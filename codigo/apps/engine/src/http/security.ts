import { createHash, timingSafeEqual } from "node:crypto";
import { AppError } from "@shelfie/core";
import type { Clock } from "@shelfie/core";
import type { NextFunction, Request, RequestHandler, Response } from "express";

// Zero-dependency hardening middleware (security.md 4.4): headers, token bucket, Host/Origin
// guards, constant-time token auth with failure lockout.

export function securityHeaders(): RequestHandler {
  return (req, res, next) => {
    res.setHeader(
      "Content-Security-Policy",
      "default-src 'self'; img-src 'self' data: blob: https://tile.openstreetmap.org; script-src 'self'; style-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
    );
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader("Permissions-Policy", "camera=(self), geolocation=(self), microphone=()");
    res.setHeader("Strict-Transport-Security", "max-age=86400");
    res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
    if (req.path.startsWith("/api")) res.setHeader("Cache-Control", "no-store");
    next();
  };
}

/** Rejects requests whose Host header is not one of ours (DNS rebinding on the loopback surface). */
export function hostGuard(allowedHostnames: ReadonlySet<string>): RequestHandler {
  return (req, _res, next) => {
    let hostname = "";
    try {
      hostname = new URL(`http://${req.headers.host ?? ""}`).hostname.toLowerCase();
    } catch {
      hostname = "";
    }
    if (!allowedHostnames.has(hostname)) {
      next(new AppError("forbidden", "Host not allowed.", 421));
      return;
    }
    next();
  };
}

/**
 * Parses `ALLOWED_ORIGINS`: comma-separated exact origins (`https://app.example.me`). No wildcards,
 * no paths, http(s) only; anything else throws so the engine fails at boot (security.md E9).
 */
export function parseAllowedOrigins(raw: string | undefined): Set<string> {
  const out = new Set<string>();
  for (const part of (raw ?? "").split(",")) {
    const item = part.trim();
    if (item.length === 0) continue;
    let u: URL;
    try {
      u = new URL(item);
    } catch {
      throw new Error(`ALLOWED_ORIGINS: not an origin: ${item}`);
    }
    const plain = /^https?:\/\/[^/*?#@\s]+$/i.test(item);
    if (!plain || item.includes("*") || (u.protocol !== "https:" && u.protocol !== "http:")) {
      throw new Error(
        `ALLOWED_ORIGINS: exact http(s) origins only (no wildcard, path or userinfo): ${item}`,
      );
    }
    out.add(u.origin.toLowerCase());
  }
  return out;
}

/**
 * State-changing requests with a foreign `Origin` are refused (same-origin app, no CORS).
 * `allowedOrigins` is an exact allow-list of extra full origins (Vercel frontend proxying /api).
 */
export function originGuard(
  allowedOriginHosts: ReadonlySet<string>,
  allowedOrigins: ReadonlySet<string> = new Set(),
): RequestHandler {
  return (req, _res, next) => {
    if (req.method === "GET" || req.method === "HEAD" || req.method === "OPTIONS") {
      next();
      return;
    }
    const origin = req.headers.origin;
    if (origin === undefined) {
      next();
      return;
    }
    if (allowedOrigins.has(origin.toLowerCase())) {
      next();
      return;
    }
    let host = "";
    try {
      host = new URL(origin).host.toLowerCase();
    } catch {
      host = "";
    }
    if (host !== (req.headers.host ?? "").toLowerCase() && !allowedOriginHosts.has(host)) {
      next(new AppError("forbidden", "Cross-origin request refused."));
      return;
    }
    next();
  };
}

/** In-memory token bucket. `limit` requests per minute, refilled continuously. */
export class RateLimiter {
  private readonly buckets = new Map<string, { tokens: number; at: number }>();
  constructor(
    private readonly limitPerMin: number,
    private readonly clock: Clock,
  ) {}

  /** Returns 0 when allowed, else the seconds to wait. */
  take(key: string): number {
    const now = this.clock.nowMs();
    const b = this.buckets.get(key) ?? { tokens: this.limitPerMin, at: now };
    b.tokens = Math.min(this.limitPerMin, b.tokens + ((now - b.at) / 60_000) * this.limitPerMin);
    b.at = now;
    if (b.tokens < 1) {
      this.buckets.set(key, b);
      return Math.max(1, Math.ceil(((1 - b.tokens) / this.limitPerMin) * 60));
    }
    b.tokens -= 1;
    this.buckets.set(key, b);
    if (this.buckets.size > 5000) this.prune(now);
    return 0;
  }

  private prune(now: number): void {
    for (const [k, b] of this.buckets) if (now - b.at > 120_000) this.buckets.delete(k);
  }
}

export function rateLimit(limiter: RateLimiter | null): RequestHandler {
  return (req, res, next) => {
    if (!limiter) {
      next();
      return;
    }
    const wait = limiter.take(req.ip ?? "unknown");
    if (wait > 0) {
      res.setHeader("Retry-After", String(wait));
      next(new AppError("rate_limited", "Too many requests. Please slow down."));
      return;
    }
    next();
  };
}

const digest = (s: string): Buffer => createHash("sha256").update(s).digest();

/** Constant-time string equality (compares SHA-256 digests of equal length). */
export function safeEqual(a: string, b: string): boolean {
  return timingSafeEqual(digest(a), digest(b));
}

/** Failed-auth lockout per IP: `maxFails` failures then `lockMs` of 429. */
export class FailLock {
  private readonly fails = new Map<string, { n: number; lockedUntil: number }>();
  constructor(
    private readonly clock: Clock,
    private readonly maxFails = 20,
    private readonly lockMs = 600_000,
  ) {}
  locked(ip: string): boolean {
    const f = this.fails.get(ip);
    return f !== undefined && f.lockedUntil > this.clock.nowMs();
  }
  fail(ip: string): void {
    const f = this.fails.get(ip) ?? { n: 0, lockedUntil: 0 };
    f.n += 1;
    if (f.n >= this.maxFails) {
      f.lockedUntil = this.clock.nowMs() + this.lockMs;
      f.n = 0;
    }
    this.fails.set(ip, f);
  }
  ok(ip: string): void {
    this.fails.delete(ip);
  }
}

export interface Tokens {
  admin: string;
  shell: string;
}

function headerValue(req: Request, name: string): string | undefined {
  const v = req.headers[name];
  return typeof v === "string" ? v : undefined;
}

export function isAdminToken(req: Request, tokens: Tokens): boolean {
  const t = headerValue(req, "x-admin-token");
  return t !== undefined && safeEqual(t, tokens.admin);
}

function guard(lock: FailLock, ok: (req: Request) => boolean, what: string): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction) => {
    const ip = req.ip ?? "unknown";
    if (lock.locked(ip)) {
      next(new AppError("rate_limited", "Too many failed attempts. Try again later."));
      return;
    }
    if (!ok(req)) {
      lock.fail(ip);
      next(new AppError("unauthorized", `${what} token missing or wrong.`));
      return;
    }
    lock.ok(ip);
    next();
  };
}

/** `X-Admin-Token` only. */
export const requireAdmin = (tokens: Tokens, lock: FailLock): RequestHandler =>
  guard(lock, (req) => isAdminToken(req, tokens), "Admin");

/** `X-Shell-Token`, or `X-Admin-Token` (contracts: POST /api/jobs is "shell or admin"). */
export const requireShellOrAdmin = (tokens: Tokens, lock: FailLock): RequestHandler =>
  guard(
    lock,
    (req) => {
      const s = headerValue(req, "x-shell-token");
      return (s !== undefined && safeEqual(s, tokens.shell)) || isAdminToken(req, tokens);
    },
    "Shell",
  );

/** A brand's id and its access code (ADR-21). */
export interface BrandCredential {
  id: string;
  token: string;
}

/**
 * Orders accept only the header. The code is compared with every brand's code (no early exit),
 * and the matching brand id is stored in `res.locals.brandId`. An empty list fails closed.
 * Failures count in their own lockout, so wrong brand codes never lock out the operator.
 */
export function requireBrand(brands: readonly BrandCredential[], lock: FailLock): RequestHandler {
  return (req, res, next) => {
    const ip = req.ip ?? "unknown";
    if (lock.locked(ip)) {
      next(new AppError("rate_limited", "Too many failed attempts. Try again later."));
      return;
    }
    const supplied = headerValue(req, "x-brand-token");
    if (!supplied) {
      lock.fail(ip);
      next(new AppError("brand_token_missing", "Brand access code required."));
      return;
    }
    let matched: string | undefined;
    for (const brand of brands) {
      if (safeEqual(supplied, brand.token) && matched === undefined) matched = brand.id;
    }
    if (matched === undefined) {
      lock.fail(ip);
      next(new AppError("brand_token_invalid", "Brand access code was not accepted."));
      return;
    }
    lock.ok(ip);
    res.locals["brandId"] = matched;
    next();
  };
}
