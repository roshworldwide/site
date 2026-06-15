/* ============================================================
   RoSh - Portfolio interactions
   Motion policy (per taste-skill):
   - reveals via IntersectionObserver
   - scroll-linked work via a single requestAnimationFrame loop
     (no window 'scroll' listener, no per-frame state churn)
   - transform / opacity only
   - everything degrades under prefers-reduced-motion
   ============================================================ */
(() => {
  "use strict";

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const finePointer = window.matchMedia("(pointer: fine)").matches;

  /* ---------- Footer year ---------- */
  const yearEl = document.getElementById("year");
  if (yearEl) yearEl.textContent = String(new Date().getFullYear());

  /* ---------- Reveal on scroll ---------- */
  const revealEls = document.querySelectorAll("[data-reveal]");
  if (reduceMotion || !("IntersectionObserver" in window)) {
    revealEls.forEach((el) => el.classList.add("is-in"));
  } else {
    const ro = new IntersectionObserver(
      (entries, obs) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add("is-in");
            obs.unobserve(e.target);
          }
        });
      },
      { threshold: 0.16, rootMargin: "0px 0px -8% 0px" }
    );
    revealEls.forEach((el) => ro.observe(el));
  }

  /* ---------- Mobile menu (focus-managed dialog) ---------- */
  const burger = document.getElementById("nav-burger");
  const overlay = document.getElementById("nav-overlay");
  let lastFocused = null;
  const overlayFocusables = () =>
    overlay ? Array.from(overlay.querySelectorAll('a[href], button:not([disabled])')) : [];
  const setMenu = (open) => {
    document.body.classList.toggle("menu-open", open);
    document.body.style.overflow = open ? "hidden" : "";
    if (burger) {
      burger.setAttribute("aria-expanded", String(open));
      burger.setAttribute("aria-label", open ? "Close menu" : "Open menu");
    }
    if (overlay) overlay.setAttribute("aria-hidden", String(!open));
    if (open) {
      lastFocused = document.activeElement;
      // focus the dialog container (always visible immediately; SR announces the menu)
      requestAnimationFrame(() => { if (overlay) overlay.focus(); });
    } else if (lastFocused && typeof lastFocused.focus === "function") {
      lastFocused.focus();
    }
  };
  if (burger) burger.addEventListener("click", () => setMenu(!document.body.classList.contains("menu-open")));
  document.querySelectorAll("[data-overlay-link]").forEach((a) => a.addEventListener("click", () => setMenu(false)));
  document.addEventListener("keydown", (e) => {
    if (!document.body.classList.contains("menu-open")) return;
    if (e.key === "Escape") { setMenu(false); return; }
    if (e.key === "Tab") {
      const f = overlayFocusables();
      if (!f.length) return;
      const first = f[0], last = f[f.length - 1], active = document.activeElement;
      if (e.shiftKey && (active === first || active === overlay)) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && active === last) { e.preventDefault(); first.focus(); }
    }
  });

  /* ---------- Marquee: clone track for seamless loop (clone hidden from AT) ---------- */
  document.querySelectorAll("[data-marquee] .marquee__track").forEach((track) => {
    const clone = document.createElement("span");
    clone.setAttribute("aria-hidden", "true");
    clone.style.display = "contents"; // children stay direct flex participants
    clone.innerHTML = track.innerHTML; // visual duplicate so translateX(-50%) loops seamlessly
    track.appendChild(clone);
    // graceful fallback: if a CDN logo ever 404s, hide it instead of showing a broken glyph
    track.querySelectorAll("img").forEach((img) => {
      img.addEventListener("error", () => { img.style.display = "none"; });
    });
  });

  /* ---------- Magnetic elements ---------- */
  if (finePointer && !reduceMotion) {
    document.querySelectorAll("[data-magnetic]").forEach((el) => {
      const strength = 0.3;
      el.addEventListener("pointermove", (e) => {
        const r = el.getBoundingClientRect();
        const x = (e.clientX - (r.left + r.width / 2)) * strength;
        const y = (e.clientY - (r.top + r.height / 2)) * strength;
        el.style.transform = `translate(${x}px, ${y}px)`;
      });
      el.addEventListener("pointerleave", () => { el.style.transform = ""; });
    });

    /* ---------- Subtle tilt ---------- */
    document.querySelectorAll("[data-tilt]").forEach((el) => {
      const max = 6; // degrees
      el.addEventListener("pointermove", (e) => {
        const r = el.getBoundingClientRect();
        const px = (e.clientX - r.left) / r.width - 0.5;
        const py = (e.clientY - r.top) / r.height - 0.5;
        el.style.transform = `perspective(900px) rotateX(${(-py * max).toFixed(2)}deg) rotateY(${(px * max).toFixed(2)}deg)`;
      });
      el.addEventListener("pointerleave", () => { el.style.transform = ""; });
    });
  }

  /* ---------- Scroll-scrubbed image sequence (Apple-style; hooks the shared rAF) ---------- */
  let seqTick = null;
  (function initSequence() {
    const section = document.getElementById("sequence");
    if (!section) return;
    const canvas = document.getElementById("seq-canvas");
    const ctx = canvas && canvas.getContext ? canvas.getContext("2d") : null;
    const small = window.matchMedia("(max-width: 760px)").matches;

    // Static fallback: poster + stacked chapters. No pin, no preload, no scrub.
    // NOTE: do NOT gate on pointer:coarse - touchscreen laptops report coarse but
    // have full-size screens and handle the scrub fine. Only true small screens
    // (phones) and reduced-motion get the static poster.
    if (reduceMotion || !ctx || small) {
      section.classList.add("is-static");
      section.querySelectorAll(".seq__chapter").forEach((c) => c.classList.add("is-active"));
      return;
    }

    const FRAMES = 227; // actual count produced in assets/sequence/ (Firefly 4K source, 24fps native)
    const pad = (n) => String(n).padStart(3, "0");
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    const images = new Array(FRAMES);
    const loaded = new Array(FRAMES).fill(false);
    let decoded = 0;
    let ready = false;
    let lastDrawn = -1;
    let cur = 0;        // lerped float frame index
    let primed = false; // snap to target on first paint
    let prevIdx = 0;
    const decodedSet = new Set(); // frames we've asked the browser to pre-decode

    const loaderNum = document.getElementById("seq-loader-num");
    const railFill = document.getElementById("seq-rail");
    const chapters = Array.from(section.querySelectorAll(".seq__chapter")).map((el) => ({
      el, at: parseFloat(el.dataset.at), active: false,
    }));

    function sizeCanvas() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const r = canvas.getBoundingClientRect();
      canvas.width = Math.max(1, Math.round(r.width * dpr));
      canvas.height = Math.max(1, Math.round(r.height * dpr));
      lastDrawn = -1; // force a redraw at the new backing size
    }
    function draw(idx) {
      const img = images[idx];
      if (!img || !loaded[idx]) return;
      const iw = img.naturalWidth, ih = img.naturalHeight;
      const scale = Math.max(canvas.width / iw, canvas.height / ih); // cover-fit
      const dw = iw * scale, dh = ih * scale;
      ctx.drawImage(img, (canvas.width - dw) / 2, (canvas.height - dh) / 2, dw, dh);
      lastDrawn = idx;
    }
    function nearestLoaded(idx) {
      if (loaded[idx]) return idx;
      for (let d = 1; d < FRAMES; d++) {
        if (idx - d >= 0 && loaded[idx - d]) return idx - d;
        if (idx + d < FRAMES && loaded[idx + d]) return idx + d;
      }
      return -1;
    }
    // pre-decode upcoming frames in the travel direction so high-res draws never block on decode
    // (window kept modest: each 2560x1440 frame is ~14MB decoded, so don't over-warm)
    function warm(idx, dir) {
      for (let k = -1; k <= 8; k++) {
        const j = idx + k * dir;
        if (j < 0 || j >= FRAMES || !loaded[j] || decodedSet.has(j)) continue;
        const img = images[j];
        if (img && img.decode) { decodedSet.add(j); img.decode().catch(() => decodedSet.delete(j)); }
      }
    }
    function onDecoded() {
      decoded++;
      if (loaderNum) loaderNum.textContent = Math.round((decoded / FRAMES) * 100);
      if (!ready && decoded >= Math.min(FRAMES, 24)) {
        ready = true;
        section.classList.add("is-ready");
        sizeCanvas();
      }
    }
    function load(i) {
      const img = new Image();
      img.decoding = "async";
      img.onload = () => { loaded[i] = true; onDecoded(); };
      img.onerror = onDecoded;
      img.src = `assets/sequence/frame_${pad(i + 1)}.webp`;
      images[i] = img;
    }
    // Sequence is the opening section now, so preload immediately (nothing competes above it).
    for (let i = 0; i < FRAMES; i++) load(i);

    // Only do work while the section is near/in the viewport.
    let inView = false;
    if ("IntersectionObserver" in window) {
      new IntersectionObserver(
        (es) => es.forEach((e) => { inView = e.isIntersecting; }),
        { rootMargin: "10% 0px" }
      ).observe(section);
    } else {
      inView = true;
    }
    window.addEventListener("resize", () => { if (ready) sizeCanvas(); }, { passive: true });

    seqTick = function () {
      if (!ready || !inView) return;
      const r = section.getBoundingClientRect();
      const dist = r.height - window.innerHeight;
      const p = dist > 0 ? Math.min(1, Math.max(0, -r.top / dist)) : 0;
      const target = p * (FRAMES - 1);
      if (!primed) { cur = target; primed = true; }
      // lerp toward target -> weighted, silky scrubbing; snappy enough to not feel laggy
      cur += (target - cur) * 0.18;
      if (Math.abs(target - cur) < 0.4) cur = target;
      const idx = Math.min(FRAMES - 1, Math.max(0, Math.round(cur)));
      if (idx !== prevIdx) { warm(idx, idx >= prevIdx ? 1 : -1); prevIdx = idx; }
      if (idx !== lastDrawn) {
        const use = nearestLoaded(idx);
        if (use >= 0) draw(use);
      }
      if (railFill) railFill.style.transform = `scaleX(${p.toFixed(4)})`;
      for (const c of chapters) {
        const on = Math.abs(p - c.at) < 0.16;
        if (on !== c.active) { c.active = on; c.el.classList.toggle("is-active", on); }
      }
    };
  })();

  /* ---------- Single rAF loop: nav state + ambient parallax + sequence ---------- */
  const navShell = document.querySelector(".nav-shell");
  const orbA = document.querySelector(".orb--a");
  const orbB = document.querySelector(".orb--b");
  let lastY = -1;

  function frame() {
    const y = window.scrollY;
    if (y !== lastY) {
      if (navShell) {
        navShell.classList.toggle("is-scrolled", y > 16);
        if (y > lastY && y > 480) navShell.classList.add("is-hidden");
        else navShell.classList.remove("is-hidden");
      }
      if (!reduceMotion) {
        if (orbA) orbA.style.transform = `translateY(${(y * 0.05).toFixed(1)}px)`;
        if (orbB) orbB.style.transform = `translateY(${(y * -0.035).toFixed(1)}px)`;
      }
      lastY = y;
    }
    if (seqTick) seqTick();
    requestAnimationFrame(frame);
  }
  if (!reduceMotion) requestAnimationFrame(frame);
  else if (navShell) {
    // still toggle nav background without animation loop
    navShell.classList.toggle("is-scrolled", window.scrollY > 16);
  }
})();
