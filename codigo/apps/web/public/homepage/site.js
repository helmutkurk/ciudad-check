// Shelfie homepage, shared by every page: html.js flag, reveal on scroll, count-up, bars, nav.
// Written so that nothing is hidden before it runs, nothing returns early before every module is
// registered, and a page with nothing to animate stays fully visible. No dependencies; CSP-safe.
(() => {
  "use strict";
  const root = document.documentElement;
  root.classList.add("js");

  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
  const easeOut = (t) => 1 - Math.pow(1 - t, 3);

  // ---------- Module: current page in the navigation ----------
  function markCurrentPage() {
    const here = (location.pathname.split("/").pop() || "index.html").toLowerCase();
    document.querySelectorAll(".topnav a, .menu a").forEach((a) => {
      const href = a.getAttribute("href") || "";
      if (href.includes("#") || href.startsWith("/") || href.startsWith("http")) return;
      if (href.toLowerCase() === here) a.setAttribute("aria-current", "page");
    });
  }

  // ---------- Module: count-up ----------
  const formatCount = (el, value) => {
    const d = Number(el.dataset.decimals || 0);
    el.textContent = `${el.dataset.prefix || ""}${value.toFixed(d)}${el.dataset.suffix || ""}`;
  };
  function countUp(el) {
    const target = Number(el.dataset.count);
    if (!Number.isFinite(target)) return;
    if (reduced) return formatCount(el, target);
    const start = performance.now();
    const step = (now) => {
      const t = clamp((now - start) / 1300);
      formatCount(el, target * easeOut(t));
      if (t < 1) requestAnimationFrame(step);
      else formatCount(el, target);
    };
    requestAnimationFrame(step);
  }

  // ---------- Module: bars ----------
  function fillBar(el) {
    if (el.dataset.width) el.style.width = `${el.dataset.width}%`;
  }

  // ---------- Module: reveal on scroll ----------
  function revealAll(box) {
    box.classList.add("is-in");
    if (box.matches("[data-count]")) countUp(box);
    box.querySelectorAll("[data-count]").forEach(countUp);
    if (box.matches(".bar-fill")) fillBar(box);
    box.querySelectorAll(".bar-fill").forEach(fillBar);
  }
  function initReveal() {
    const targets = Array.from(document.querySelectorAll(".reveal"));
    // Counters and bars outside a .reveal box: show their final state right away.
    document.querySelectorAll("[data-count], .bar-fill").forEach((el) => {
      if (!el.closest(".reveal")) revealAll(el);
    });
    if (!targets.length) return;
    if (!("IntersectionObserver" in window) || reduced) {
      targets.forEach(revealAll);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            revealAll(e.target);
            io.unobserve(e.target);
          }
        }
      },
      { threshold: 0.2 },
    );
    targets.forEach((t) => io.observe(t));
  }

  // Each module is isolated: one failing never blocks the others.
  for (const run of [markCurrentPage, initReveal]) {
    try {
      run();
    } catch (err) {
      // Fail open: show everything.
      root.classList.remove("js");
      if (window.console) console.error(err);
    }
  }
})();
