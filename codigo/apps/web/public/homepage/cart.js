// Shelfie homepage cart room (index.html only; fork of story.js). Scroll progress -> frame -> the canvas draws exactly that frame.
// The "frame sequence" is procedural: the cart from the logo is assembled piece by piece as the
// visitor scrolls (handle, basket, grid, rail, four wheels, products, verified photo, escrow
// blocks). No dependencies; works under the site's CSP (no inline script or style).
// Reveal, count-up and bars live in site.js, which every page loads.
(() => {
  "use strict";
  document.documentElement.classList.add("js");

  const C = {
    forest: "#0B2E1F",
    green: "#2E7D32",
    leaf: "#6BAF5B",
    mint: "#CFE7C1",
    cream: "#F5EFE3",
  };
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
  const span = (p, from, to) => clamp((p - from) / (to - from));
  const easeOut = (t) => 1 - Math.pow(1 - t, 3);
  const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  const bounce = (t) => {
    // Drop with one small bounce at the end (wheels landing).
    if (t < 0.72) return easeOut(t / 0.72);
    const k = (t - 0.72) / 0.28;
    return 1 - Math.sin(k * Math.PI) * 0.08;
  };

  // ---------- Cart geometry in a 1000 x 700 virtual scene ----------
  const HANDLE = [
    [120, 196],
    [205, 196],
    [262, 262],
  ];
  const BASKET = [
    [262, 262],
    [732, 262],
    [668, 474],
    [306, 474],
    [262, 262],
  ];
  const RAIL = [
    [306, 474],
    [292, 548],
    [690, 548],
  ];
  const WHEELS = [
    // back pair first (drawn behind), then the front pair
    { x: 402, y: 574, r: 26, back: true, from: 0.38, to: 0.45 },
    { x: 702, y: 574, r: 26, back: true, from: 0.42, to: 0.49 },
    { x: 338, y: 596, r: 34, back: false, from: 0.28, to: 0.35 },
    { x: 640, y: 596, r: 34, back: false, from: 0.32, to: 0.39 },
  ];
  // Four beats: basket (0-0.25), wheels (0.25-0.5), products and photo (0.5-0.75), payment (0.75-1).
  const PRODUCTS = [
    { kind: "bottle", x: 340, w: 58, h: 168, color: C.green, from: 0.52, to: 0.6 },
    { kind: "box", x: 420, w: 118, h: 112, color: C.leaf, from: 0.55, to: 0.63 },
    { kind: "can", x: 556, w: 64, h: 104, color: C.forest, from: 0.58, to: 0.66 },
    { kind: "bottle", x: 626, w: 50, h: 148, color: C.leaf, from: 0.61, to: 0.69 },
  ];
  const BASKET_FLOOR = 470;

  function polyLength(pts) {
    let len = 0;
    for (let i = 1; i < pts.length; i++)
      len += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    return len;
  }

  // Draw a polyline revealed up to fraction t (stroke "drawing" itself).
  function strokeReveal(ctx, pts, t, width, color) {
    if (t <= 0) return;
    const len = polyLength(pts);
    ctx.save();
    ctx.lineWidth = width;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = color;
    ctx.setLineDash([len * t, len]);
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.stroke();
    ctx.restore();
  }

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  // Point on the basket edge between two corners (for the grid lines).
  const lerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];

  function drawGhost(ctx) {
    ctx.save();
    ctx.globalAlpha = 0.13;
    ctx.setLineDash([10, 14]);
    ctx.lineWidth = 6;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = C.forest;
    for (const pts of [HANDLE, BASKET, RAIL]) {
      ctx.beginPath();
      ctx.moveTo(pts[0][0], pts[0][1]);
      for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
      ctx.stroke();
    }
    for (const w of WHEELS) {
      ctx.beginPath();
      ctx.arc(w.x, w.y, w.r, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawGrid(ctx, t) {
    if (t <= 0) return;
    const [tl, tr, br, bl] = BASKET;
    ctx.save();
    ctx.lineWidth = 9;
    ctx.lineCap = "round";
    ctx.strokeStyle = C.forest;
    ctx.globalAlpha = 0.95;
    const verticals = 4;
    for (let i = 1; i <= verticals; i++) {
      const k = i / (verticals + 1);
      const top = lerp(tl, tr, k);
      const bottom = lerp(bl, br, k);
      const local = clamp(t * (verticals + 2) - (i - 1));
      strokeReveal(ctx, [top, bottom], easeOut(local), 9, C.forest);
    }
    for (let j = 1; j <= 2; j++) {
      const k = j / 3;
      const left = lerp(tl, bl, k);
      const right = lerp(tr, br, k);
      strokeReveal(ctx, [left, right], easeOut(clamp(t * 3 - (j - 1) * 0.6)), 9, C.forest);
    }
    ctx.restore();
  }

  function drawWheel(ctx, w, t, spin) {
    if (t <= 0) return;
    const k = bounce(t);
    const y = w.y - (1 - k) * 420;
    ctx.save();
    ctx.globalAlpha = clamp(t * 3);
    ctx.fillStyle = w.back ? C.green : C.forest;
    ctx.beginPath();
    ctx.arc(w.x, y, w.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = C.cream;
    ctx.beginPath();
    ctx.arc(w.x, y, w.r * 0.42, 0, Math.PI * 2);
    ctx.fill();
    // one spoke so the roll is visible
    ctx.strokeStyle = w.back ? C.green : C.forest;
    ctx.lineWidth = 5;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(w.x, y);
    ctx.lineTo(w.x + Math.cos(spin) * w.r * 0.42, y + Math.sin(spin) * w.r * 0.42);
    ctx.stroke();
    ctx.restore();
    // short strut from the rail to the wheel
    if (t > 0.6) {
      ctx.save();
      ctx.globalAlpha = clamp((t - 0.6) / 0.4);
      ctx.strokeStyle = w.back ? C.green : C.forest;
      ctx.lineWidth = w.back ? 7 : 9;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(w.x, 548);
      ctx.lineTo(w.x, w.y - w.r + 4);
      ctx.stroke();
      ctx.restore();
    }
  }

  function drawProduct(ctx, prod, t) {
    if (t <= 0) return;
    const k = easeOut(t);
    const bottom = BASKET_FLOOR - 8;
    const y = bottom - prod.h - (1 - k) * 640;
    ctx.save();
    ctx.globalAlpha = clamp(t * 2.5);
    ctx.fillStyle = prod.color;
    if (prod.kind === "bottle") {
      const neck = prod.w * 0.36;
      roundRect(ctx, prod.x, y + prod.h * 0.32, prod.w, prod.h * 0.68, 14);
      ctx.fill();
      roundRect(ctx, prod.x + (prod.w - neck) / 2, y, neck, prod.h * 0.38, 6);
      ctx.fill();
      ctx.fillStyle = C.cream;
      roundRect(ctx, prod.x + 6, y + prod.h * 0.55, prod.w - 12, prod.h * 0.18, 4);
      ctx.fill();
    } else if (prod.kind === "can") {
      roundRect(ctx, prod.x, y, prod.w, prod.h, 10);
      ctx.fill();
      ctx.fillStyle = C.leaf;
      roundRect(ctx, prod.x + 8, y + prod.h * 0.35, prod.w - 16, prod.h * 0.3, 4);
      ctx.fill();
    } else {
      roundRect(ctx, prod.x, y, prod.w, prod.h, 8);
      ctx.fill();
      ctx.fillStyle = C.mint;
      roundRect(ctx, prod.x + 14, y + 18, prod.w - 28, 28, 5);
      ctx.fill();
    }
    ctx.restore();
  }

  // The verified photo: a small card with a price tag and a green check drawing itself.
  function drawPhoto(ctx, t, check) {
    if (t <= 0) return;
    const k = easeOut(t);
    const x = 762;
    const y = 96 + (1 - k) * 60;
    ctx.save();
    ctx.globalAlpha = k;
    ctx.translate(x, y);
    ctx.rotate(0.06);
    ctx.shadowColor = "rgba(11,46,31,0.18)";
    ctx.shadowBlur = 24;
    ctx.shadowOffsetY = 8;
    ctx.fillStyle = "#FFFDF8";
    roundRect(ctx, 0, 0, 176, 200, 14);
    ctx.fill();
    ctx.shadowColor = "transparent";
    ctx.fillStyle = C.mint;
    roundRect(ctx, 14, 14, 148, 112, 8);
    ctx.fill();
    // price tag inside the photo
    ctx.fillStyle = C.forest;
    roundRect(ctx, 44, 58, 88, 40, 6);
    ctx.fill();
    ctx.fillStyle = C.cream;
    ctx.font = "800 24px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("2,49", 88, 79);
    // the hand gesture hint: two raised fingers
    ctx.strokeStyle = C.green;
    ctx.lineWidth = 7;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(146, 118);
    ctx.lineTo(140, 86);
    ctx.moveTo(156, 118);
    ctx.lineTo(158, 84);
    ctx.stroke();
    // check circle
    if (check > 0) {
      ctx.fillStyle = C.leaf;
      ctx.beginPath();
      ctx.arc(88, 162, 24 * easeOut(clamp(check * 2)), 0, Math.PI * 2);
      ctx.fill();
      strokeReveal(
        ctx,
        [
          [76, 162],
          [86, 172],
          [102, 152],
        ],
        clamp(check * 2 - 0.6),
        6,
        "#FFFDF8",
      );
    }
    ctx.restore();
  }

  // Escrow blocks from the logo: two cubes joined by a chain.
  function drawBlocks(ctx, t) {
    if (t <= 0) return;
    const k = easeOut(t);
    ctx.save();
    ctx.globalAlpha = k;
    const cube = (cx, cy, s) => {
      ctx.fillStyle = C.leaf;
      ctx.beginPath();
      ctx.moveTo(cx, cy - s);
      ctx.lineTo(cx + s, cy - s / 2);
      ctx.lineTo(cx, cy);
      ctx.lineTo(cx - s, cy - s / 2);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = C.green;
      ctx.beginPath();
      ctx.moveTo(cx - s, cy - s / 2);
      ctx.lineTo(cx, cy);
      ctx.lineTo(cx, cy + s);
      ctx.lineTo(cx - s, cy + s / 2);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = C.forest;
      ctx.beginPath();
      ctx.moveTo(cx + s, cy - s / 2);
      ctx.lineTo(cx, cy);
      ctx.lineTo(cx, cy + s);
      ctx.lineTo(cx + s, cy + s / 2);
      ctx.closePath();
      ctx.fill();
    };
    cube(842, 408 - (1 - k) * 30, 30);
    cube(930, 500 - (1 - k) * 50, 30);
    strokeReveal(
      ctx,
      [
        [862, 432],
        [910, 476],
      ],
      clamp(t * 1.6 - 0.4),
      8,
      C.green,
    );
    ctx.restore();
  }

  function drawSpeedLines(ctx, t) {
    if (t <= 0) return;
    const rows = [
      [300, 150, C.leaf],
      [352, 118, C.green],
      [404, 150, C.leaf],
      [456, 96, C.green],
    ];
    ctx.save();
    ctx.lineCap = "round";
    ctx.lineWidth = 18;
    rows.forEach(([y, len, color], i) => {
      const local = easeOut(clamp(t * 1.8 - i * 0.15));
      ctx.strokeStyle = color;
      ctx.globalAlpha = local;
      ctx.beginPath();
      ctx.moveTo(210 - len * local, y);
      ctx.lineTo(210, y);
      ctx.stroke();
    });
    ctx.restore();
  }

  // ---------- Scene ----------
  const canvas = document.getElementById("cart-canvas");
  const room = document.getElementById("story");
  const bar = document.getElementById("story-progress");
  const beats = Array.from(document.querySelectorAll(".beat"));
  if (!canvas || !room) return;
  // The room CSS (pinned stage, hidden inactive beats) applies only once the canvas exists.
  document.documentElement.classList.add("cart-ready");
  const ctx = canvas.getContext("2d");
  let width = 0;
  let height = 0;
  let dpr = 1;

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    const rect = canvas.getBoundingClientRect();
    width = rect.width;
    height = rect.height;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
  }

  function layout() {
    const phone = width <= 760 || height > width * 1.15;
    if (phone) {
      // cart in the upper part, the text card sits at the bottom
      const s = Math.min((width * 0.98) / 1000, (height * 0.46) / 700);
      return { s, cx: width / 2, cy: height * 0.32 };
    }
    const s = Math.min((width * 0.52) / 1000, (height * 0.78) / 700);
    return { s, cx: width * 0.7, cy: height * 0.54 };
  }

  function render(p) {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);

    // background: cream with a soft mint glow that grows as the story advances
    const { s, cx, cy } = layout();
    const glow = ctx.createRadialGradient(
      cx,
      cy,
      10,
      cx,
      cy,
      Math.max(width, height) * (0.35 + p * 0.3),
    );
    glow.addColorStop(0, `rgba(207,231,193,${0.55 + p * 0.35})`);
    glow.addColorStop(1, "rgba(245,239,227,0)");
    ctx.fillStyle = C.cream;
    ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, width, height);

    const roll = easeInOut(span(p, 0.76, 0.98));
    ctx.save();
    ctx.translate(cx - 500 * s + roll * 46 * s, cy - 350 * s);
    ctx.scale(s, s);

    // ground shadow
    ctx.fillStyle = "rgba(11,46,31,0.10)";
    ctx.beginPath();
    ctx.ellipse(510, 636, 330, 22, 0, 0, Math.PI * 2);
    ctx.fill();

    drawGhost(ctx);
    drawSpeedLines(ctx, span(p, 0.76, 0.96));
    const spin = roll * Math.PI * 6;
    for (const w of WHEELS.filter((x) => x.back)) drawWheel(ctx, w, span(p, w.from, w.to), spin);
    strokeReveal(ctx, RAIL, easeOut(span(p, 0.24, 0.3)), 14, C.forest);
    for (const prod of PRODUCTS) drawProduct(ctx, prod, span(p, prod.from, prod.to));
    // the handle is already half drawn on arrival, so the first scroll visibly builds the cart
    strokeReveal(ctx, HANDLE, easeOut(clamp(0.45 + span(p, 0, 0.06) * 0.55)), 18, C.forest);
    strokeReveal(ctx, BASKET, easeOut(span(p, 0.03, 0.15)), 18, C.forest);
    drawGrid(ctx, span(p, 0.12, 0.22));
    for (const w of WHEELS.filter((x) => !x.back)) drawWheel(ctx, w, span(p, w.from, w.to), spin);
    ctx.restore();

    // photo and escrow blocks stay put while the cart rolls
    ctx.save();
    ctx.translate(cx - 500 * s, cy - 350 * s);
    ctx.scale(s, s);
    drawPhoto(ctx, span(p, 0.55, 0.63), span(p, 0.62, 0.72));
    drawBlocks(ctx, span(p, 0.8, 0.98));
    ctx.restore();
  }

  function progress() {
    const total = room.offsetHeight - window.innerHeight;
    if (total <= 0) return 1;
    return clamp((window.scrollY - room.offsetTop) / total);
  }

  // The drawn frame eases toward the scroll position, so the cart moves smoothly between wheel
  // ticks instead of jumping; the text beats follow the real scroll position.
  let pending = false;
  let shown = reduced ? 1 : progress();
  function update() {
    pending = false;
    const target = reduced ? 1 : progress();
    shown += (target - shown) * 0.16;
    if (Math.abs(target - shown) < 0.0008) shown = target;
    render(shown);
    if (bar) bar.style.width = `${(target * 100).toFixed(1)}%`;
    if (!reduced) {
      for (const b of beats) {
        const on = target >= Number(b.dataset.from) && target < Number(b.dataset.to);
        b.classList.toggle("is-active", on);
      }
    }
    if (shown !== target) schedule();
  }
  function schedule() {
    if (!pending) {
      pending = true;
      window.requestAnimationFrame(update);
    }
  }

  resize();
  update();
  window.addEventListener("scroll", schedule, { passive: true });
  window.addEventListener("resize", () => {
    resize();
    schedule();
  });
})();
