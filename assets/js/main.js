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

  /* ---------- About stat count-up (own short rAF tween; stops when done) ---------- */
  (function initCountUp() {
    const dl = document.querySelector("#about .stats");
    if (!dl || dl.dataset.counted) return;
    const nums = Array.prototype.slice.call(dl.querySelectorAll(".stat__num"));
    if (!nums.length) return;

    const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);
    const fmt = (v, d) => (d ? v.toFixed(d) : String(Math.round(v)));

    const run = () => {
      if (dl.dataset.counted) return;
      dl.dataset.counted = "1";
      dl.classList.add("is-counting"); // arms the .choreo-gated 0-emphasis landing
      const specs = nums.map((n) => ({
        n, to: parseFloat(n.dataset.to), dec: parseInt(n.dataset.decimals || "0", 10),
      }));
      if (reduceMotion) { specs.forEach((s) => { s.n.textContent = fmt(s.to, s.dec); }); return; }
      const DUR = 1200;
      let start = null;
      const step = (ts) => {
        if (start === null) start = ts;
        const e = easeOutCubic(Math.min(1, (ts - start) / DUR));
        // skip-if-unchanged: avoids redundant DOM writes (the static "0", and "7" once it rounds)
        for (const s of specs) { const str = fmt(s.to * e, s.dec); if (str !== s.n.textContent) s.n.textContent = str; }
        if (e < 1) requestAnimationFrame(step);           // re-arms only while animating
        else for (const s of specs) s.n.textContent = fmt(s.to, s.dec); // exact final; loop stops
      };
      requestAnimationFrame(step);
    };

    if (reduceMotion || !("IntersectionObserver" in window)) { run(); return; }
    const io = new IntersectionObserver((entries, obs) => {
      entries.forEach((en) => { if (en.isIntersecting) { run(); obs.disconnect(); } });
    }, { threshold: 0.5, rootMargin: "0px 0px -10% 0px" });
    io.observe(dl);
  })();

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
    const heroEl = document.getElementById("seq-hero");   // headline overlay (parallaxes out)
    const openEl = document.getElementById("seq-open");   // opening curtain (reel lights up)
    const cueEl = document.getElementById("seq-cue");      // scroll cue (fades on first scroll)
    let heroGone = false;                                  // pointer-events handoff past the fade
    const easeOut = (t) => 1 - Math.pow(1 - t, 3);         // smooth, no overshoot
    const vh = () => window.innerHeight || 1;
    const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
    // COLD-OPEN refs. seqTick writes the camera/light/letterbox as CSS custom props on the LEAF element
    // that reads each one (poster/canvas read --dolly, bloom reads --bloom, bars read --bar) - never on
    // the shared .seq__pin, so style invalidation stays on those nodes instead of the whole pin subtree
    // (hero/h1/chapters/...). It still never writes a transform STRING to any element, so it can't stomp
    // #seq-hero's inline transform. pinEl is kept only for sizeCanvas (the un-transformed rect source).
    const pinEl = section.querySelector(".seq__pin");
    const posterEl = section.querySelector(".seq__poster");
    const bloomEl = document.getElementById("seq-bloom");
    const barsEl = section.querySelector(".seq__bars");
    let lastP = -1;                                        // idle guard: skip cinematic writes when p hasn't moved
    const chapters = Array.from(section.querySelectorAll(".seq__chapter")).map((el) => ({
      el, at: parseFloat(el.dataset.at), active: false,
    }));

    function sizeCanvas() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      // read the PIN's rect, not the canvas's: the canvas now carries the --dolly CSS scale, so its own
      // getBoundingClientRect() would report the post-transform (scaled) box and mis-size the DPR backing
      // store on a mid-dolly resize. The pin is never transformed and is the canvas's inset:0 box.
      const r = (pinEl || canvas).getBoundingClientRect();
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

    // The static decision is made once at load. If the viewport later crosses BELOW the breakpoint
    // (desktop narrowed, tablet rotated to portrait), collapse the cold open then too: add .is-static,
    // clear every inline write so no half-applied transform/letterbox is left behind, and let the
    // .is-static CSS take over. One-way (matches the load-time semantics; re-widening keeps it static).
    const mqSmall = window.matchMedia("(max-width: 760px)");
    function collapseStatic() {
      section.classList.add("is-static");
      if (posterEl) posterEl.style.removeProperty("--dolly");
      if (canvas) canvas.style.removeProperty("--dolly");
      if (bloomEl) { bloomEl.style.removeProperty("--bloom"); bloomEl.style.opacity = ""; }
      if (barsEl) barsEl.style.removeProperty("--bar");
      if (heroEl) { heroEl.style.transform = ""; heroEl.style.opacity = ""; heroEl.classList.remove("is-gone"); heroGone = false; }
      if (openEl) openEl.style.opacity = "";
      if (cueEl) cueEl.style.opacity = "";
      if (railFill) railFill.style.transform = "";
      chapters.forEach((c) => { c.active = false; c.el.classList.add("is-active"); });
      lastP = -1;
    }
    if (mqSmall.addEventListener) {
      mqSmall.addEventListener("change", (e) => { if (e.matches) collapseStatic(); });
    }

    seqTick = function () {
      if (!inView || section.classList.contains("is-static")) return; // collapsed: no cold-open writes
      const r = section.getBoundingClientRect();
      const dist = r.height - window.innerHeight;
      const p = dist > 0 ? Math.min(1, Math.max(0, -r.top / dist)) : 0;

      // cold-open derived progress (all run regardless of frame-decode `ready`)
      const e20 = easeOut(Math.min(1, p / 0.20));            // curtain-lift / lights-up key
      const exitDim = easeOut(clamp01((p - 0.9) / 0.1));     // exit: dim reel back toward Vault
      const pMoved = Math.abs(p - lastP) > 0.0004;            // idle guard for the cinematic writes

      /* ---- opening handoff: runs regardless of frame-decode `ready` so the headline
              lifts and the curtain lights up even while frames are still warming ---- */
      // hero parallaxes out over the first ~18%: up ~10vh, fades, scales 1 -> .965
      const out = easeOut(Math.min(1, p / 0.13));  // headline clears by ~p0.13 - a clean gap before full light (~p0.20)
      if (heroEl) {
        heroEl.style.opacity = (1 - out).toFixed(3);
        heroEl.style.transform =
          `translate3d(0, ${(-out * vh() * 0.10).toFixed(1)}px, 0) scale(${(1 - out * 0.035).toFixed(4)})`;
        const gone = p > 0.13; // stop intercepting clicks once the headline is essentially gone
        if (gone !== heroGone) { heroGone = gone; heroEl.classList.toggle("is-gone", gone); }
      }
      // curtain: lights up at the start (lift 1->0 by p~=0.20) AND dims back on exit (p 0.9->1).
      // Math.max => lift dominates the open, exit dominates the close, ~0 through the middle. Never scaled
      // (opacity only) so its Vault always covers the pin corners with no gap during the lift or dim.
      if (openEl) openEl.style.opacity = Math.max((1 - e20) * 0.97, exitDim * 0.92).toFixed(3);
      // scroll cue fades out after the first nudge
      if (cueEl) cueEl.style.opacity = Math.max(0, 1 - p / 0.045).toFixed(3);
      // progress rail + chapter cross-fades (transform/opacity only)
      if (railFill) railFill.style.transform = `scaleX(${p.toFixed(4)})`;
      for (const c of chapters) {
        const on = Math.abs(p - c.at) < 0.14; // tighter window so the headline owns the opening
        if (on !== c.active) { c.active = on; c.el.classList.toggle("is-active", on); }
      }

      /* ---- cinematic layers (camera dolly + key-light bloom + letterbox): written as CSS custom
              props on .seq__pin so no transform string ever lands on an existing element. Idle-guarded
              by pMoved. Runs regardless of `ready` (compositor-only, independent of frame decode). ---- */
      if (pMoved) {
        // beat 3 - dolly push-in: 1.060 -> 1.000 over p 0..0.58, then flat (floor exactly 1.0).
        // Written on poster + canvas directly (the two readers) so only those leaves restyle.
        const dolly = (1.060 - 0.060 * easeOut(Math.min(1, p / 0.58))).toFixed(4);
        if (posterEl) posterEl.style.setProperty("--dolly", dolly);
        if (canvas) canvas.style.setProperty("--dolly", dolly);
        // beat 4 - key light: grows .92 -> 1.02 and blooms in on the curtain-lift key; fades on exit
        if (bloomEl) {
          bloomEl.style.setProperty("--bloom", (0.92 + e20 * 0.10).toFixed(4));
          bloomEl.style.opacity = (e20 * 0.9 * (1 - exitDim)).toFixed(3);
        }
        // beat 5 - letterbox: bars drive IN over p 0.04..0.16, hold, retract over p 0.85..1.0.
        // --bar on .seq__bars itself; its ::before/::after inherit from it (1-element subtree).
        if (barsEl) {
          const barIn = easeOut(clamp01((p - 0.04) / 0.12));
          const barOut = easeOut(clamp01((p - 0.85) / 0.15));
          barsEl.style.setProperty("--bar", Math.max(0, barIn - barOut).toFixed(4));
        }
      }
      lastP = p; // idle-guard bookkeeping (set before the ready gate so it holds even mid-decode)

      /* ---- canvas scrub: the only part gated on frames being decodable ---- */
      if (!ready) return;
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
    };
  })();

  /* ---------- Work: pinned horizontal cinematic gallery (sibling of seqTick; hooks the shared frame()) ----------
     Progressive enhancement: default markup is a native scroll-snap strip (CSS); this upgrades capable
     devices to the pinned scrub by adding .work--pinned. All scroll math runs in the single frame() rAF. */
  let workTick = null;
  (function initWork() {
    const section = document.getElementById("work");
    if (!section) return;
    const pin = section.querySelector(".work__pin");
    const track = section.querySelector(".work__track");
    if (!pin || !track) return;
    const panels = Array.prototype.slice.call(track.querySelectorAll(".work__panel"));
    const cards = panels.map((p) => p.querySelector(".card"));
    const railFill = document.getElementById("work-rail");
    const indexEl = document.getElementById("work-index");
    const N = cards.length;
    if (!N) return;

    // PATH GATE: a vertical-drives-horizontal hijack needs a wheel/trackpad, so the pinned scrub gates on
    // finePointer (unlike the cold open). fine + !small + !reduceMotion => PINNED; else native scroll-snap.
    const smallWork = () => window.matchMedia("(max-width: 760px)").matches;
    if (reduceMotion || !finePointer || smallWork()) return;   // workTick stays null -> frame() skips Work
    section.classList.add("work--pinned");

    // a11y: each card becomes a real, ordered tab stop named by its own <h3> (pinned path only).
    cards.forEach((c) => {
      if (!c) return;
      c.tabIndex = 0;
      const t = c.querySelector(".card__title");
      if (t && t.id) c.setAttribute("aria-labelledby", t.id);
      c.setAttribute("aria-roledescription", "project");
    });

    const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
    let pinW = 0, travel = 0, cur = 0, primed = false, measured = false, lastP = -1, lastCur = -1, lastIdx = -1;
    const cardW = new Array(N).fill(0);
    const cardCenter = new Array(N).fill(0);

    // The ONLY layout-read path (init lazy + resize + fonts): write lead/trail, then read widths/centers
    // (one write->read boundary). Uses pin.clientWidth (not 100vw) so centering shares `travel`'s basis.
    function measure() {
      pinW = pin.clientWidth;
      track.style.setProperty("--work-lead", ((pinW - panels[0].offsetWidth) / 2) + "px");
      track.style.setProperty("--work-trail", ((pinW - panels[N - 1].offsetWidth) / 2) + "px");
      travel = track.scrollWidth - pinW; if (travel < 0) travel = 0;
      for (let i = 0; i < N; i++) {
        cardW[i] = panels[i].offsetWidth;
        cardCenter[i] = panels[i].offsetLeft + cardW[i] / 2; // offsetLeft is rel to the offsetParent (the sticky pin); pin has no h-padding + track sits at x=0, so this == track-origin distance, incl. lead pad
      }
      measured = true; primed = false; lastP = -1; lastCur = -1;
    }
    // resize/fonts only mark the geometry STALE; workTick lazily re-measures once on the next in-view
    // frame (rAF-coalesced) - so a drag-resize never thrashes layout with a synchronous write->read reflow.
    const remeasure = () => { if (section.classList.contains("work--pinned")) measured = false; };
    window.addEventListener("resize", remeasure, { passive: true });
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(remeasure);

    // IO inView gate (mirror seqTick)
    let inView = false;
    if ("IntersectionObserver" in window) {
      new IntersectionObserver((es) => es.forEach((e) => { inView = e.isIntersecting; }), { rootMargin: "10% 0px" }).observe(section);
    } else { inView = true; }

    // runtime collapse below 760 mid-session (mirror the cold open's mqSmall): one-way -> native strip
    const mqW = window.matchMedia("(max-width: 760px)");
    if (mqW.addEventListener) mqW.addEventListener("change", (e) => {
      if (e.matches && section.classList.contains("work--pinned")) {
        section.classList.remove("work--pinned");
        track.style.transform = "";
        track.style.removeProperty("--work-lead");
        track.style.removeProperty("--work-trail");
        cards.forEach((c) => {
          if (!c) return;
          c.style.transform = ""; c.style.opacity = ""; c.style.removeProperty("--mpy");
          // revert the pinned-only focus/AT state so the collapsed native strip matches the load-gate
          // native strip (plain non-focusable <article>s), not a strip with 5 stray "project" tab stops.
          c.removeAttribute("tabindex"); c.removeAttribute("aria-labelledby"); c.removeAttribute("aria-roledescription");
        });
        if (railFill) railFill.style.transform = "";
        workTick = null; // frame() short-circuits at `if (workTick)`
      }
    });

    workTick = function () {
      if (!inView || !section.classList.contains("work--pinned")) return;
      if (!measured) measure();                          // lazy first measure (after layout settles)
      const r = section.getBoundingClientRect();          // the only per-frame layout read
      const dist = r.height - window.innerHeight;
      const p = dist > 0 ? clamp01(-r.top / dist) : 0;

      // weighted lerp of the horizontal translate (same 0.18 + snap as seqTick)
      const target = p * travel;
      if (!primed) { cur = target; primed = true; }
      cur += (target - cur) * 0.18;
      if (Math.abs(target - cur) < 0.4) cur = target;
      // fully-idle guard: skip ALL writes only when BOTH the lerp (cur) and scroll (p) have settled.
      // (Guarding the focus loop on p alone froze it mid-lerp - the focus depends on cur, which keeps
      //  moving for many frames after p stops.)
      if (cur === lastCur && p === lastP) return;
      lastCur = cur; lastP = p;
      track.style.transform = `translate3d(${(-cur).toFixed(2)}px,0,0)`;
      if (railFill) railFill.style.transform = `scaleX(${p.toFixed(4)})`;

      // per-card focus from CACHED widths/centers (ZERO per-card getBoundingClientRect)
      const viewCenter = cur + pinW / 2;                  // viewport center in track-content coords
      let best = 0, bestD = Infinity;
      for (let i = 0; i < N; i++) {
        const c = cards[i]; if (!c) continue;
        const dc = cardCenter[i] - viewCenter;            // signed px from viewport center
        const ad = dc < 0 ? -dc : dc;
        const n = clamp01(ad / (cardW[i] * 0.9));          // focus band ~one card wide
        const f = 1 - n * n;                                // quadratic falloff: decisive snap into focus
        c.style.transform = `scale(${(0.92 + f * 0.08).toFixed(4)})`;  // on .card (tilt lives on .card__inner)
        c.style.opacity = (0.55 + f * 0.45).toFixed(3);
        // signed media drift, magnitude clamped to <=6px (off-center cards are >1 card-width away, so
        // the raw dc/cardW would otherwise reach ~20px+). --mpy is the wired media-parallax channel.
        c.style.setProperty("--mpy", ((dc < 0 ? -1 : 1) * Math.min(ad / cardW[i], 1) * 6).toFixed(1) + "px");
        if (ad < bestD) { bestD = ad; best = i; }
      }
      if (best !== lastIdx) {
        lastIdx = best;
        if (indexEl) indexEl.textContent = String(best + 1).padStart(2, "0");
      }
    };

    // keyboard recenter: focusin -> scroll so the focused card centers (exact inverse of the scrub).
    // behavior:"auto" is required (html{scroll-behavior:smooth} would otherwise fight the lerp across 380vh).
    section.addEventListener("focusin", (e) => {
      if (!section.classList.contains("work--pinned")) return;
      const card = e.target.closest && e.target.closest(".card");
      if (!card) return;
      // only recenter for KEYBOARD focus - a mouse click on a card (now tabbable) must not yank the page.
      // :focus-visible matches keyboard focus only; feature-detect so an old engine can't throw here.
      let kbd; try { kbd = e.target.matches && e.target.matches(":focus-visible"); } catch (_) { kbd = false; }
      if (!kbd) return;
      const i = cards.indexOf(card); if (i < 0) return;
      if (!measured) measure();
      if (travel <= 0) return;
      const pTarget = clamp01((cardCenter[i] - pinW / 2) / travel);
      const sectionTop = window.scrollY + section.getBoundingClientRect().top; // absolute doc top of #work
      const targetTop = Math.round(sectionTop + pTarget * (section.offsetHeight - window.innerHeight));
      // defer ONE frame so the browser's own focus scroll-into-view (the off-screen card) doesn't
      // override ours; behavior:"auto" because html{scroll-behavior:smooth} would otherwise fight the lerp.
      requestAnimationFrame(() => window.scrollTo({ top: targetTop, behavior: "auto" }));
    });
  })();

  /* ---------- Scroll choreography: Patents (hooks the shared frame(); transform/opacity only) ---------- */
  let choreoTick = null;
  if (!reduceMotion) {
    document.documentElement.classList.add("choreo"); // arms hidden start-states in CSS
    const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
    const easeOut = (t) => 1 - Math.pow(1 - t, 3);
    const groups = [];

    const addGroup = (itemsSel, sectionSel, o) => {
      const section = document.querySelector(sectionSel);
      const items = Array.from(document.querySelectorAll(itemsSel));
      if (!section || !items.length) return;
      const g = { section, items, inView: false, ...o };
      if ("IntersectionObserver" in window) {
        new IntersectionObserver(
          (es) => es.forEach((e) => { g.inView = e.isIntersecting; }),
          { rootMargin: "0px 0px -5% 0px" }
        ).observe(section);
      } else { g.inView = true; }
      groups.push(g);
    };
    // Work is owned by workTick now; choreoTick only drives the Patents cascade.
    addGroup("#patents .patent", "#patents .patents__grid", { stagger: 0.07, win: 0.5, rise: 38, underline: true });

    choreoTick = function () {
      const H = window.innerHeight || 1;
      for (const g of groups) {
        if (!g.inView) continue;
        const r = g.section.getBoundingClientRect();
        // section progress: begins as its top passes ~92% vh, completes near ~40% vh
        const sp = clamp01((H * 0.92 - r.top) / (H * 0.52));
        if (sp === g._lastSp) continue; // idle: nothing to repaint
        g._lastSp = sp;
        for (let i = 0; i < g.items.length; i++) {
          const el = g.items[i];
          const cp = clamp01((sp - i * g.stagger) / g.win);
          const e = easeOut(cp);
          el.style.opacity = e.toFixed(3);
          el.style.transform = `translate3d(0, ${((1 - e) * g.rise).toFixed(1)}px, 0) scale(${(0.965 + e * 0.035).toFixed(4)})`;
          if (g.parallax) {
            const cr = el.getBoundingClientRect();
            const rel = (cr.top + cr.height / 2 - H / 2) / H; // -0.5 .. 0.5
            el.style.setProperty("--mpy", (-rel * 16).toFixed(1) + "px"); // <= +-8px drift
          }
          if (g.underline) {
            const shown = cp > 0.5;
            if (shown !== el._shown) { el._shown = shown; el.classList.toggle("is-shown", shown); }
          }
        }
      }
    };

    // one-time gold "scan" hairline as the patents grid enters
    const pgrid = document.querySelector("#patents .patents__grid");
    if (pgrid && "IntersectionObserver" in window) {
      const sio = new IntersectionObserver((es) => {
        es.forEach((e) => {
          if (e.isIntersecting && !pgrid.classList.contains("is-scanned")) {
            pgrid.style.setProperty("--scan-end", pgrid.offsetHeight + "px");
            pgrid.classList.add("is-scanned");
            sio.disconnect();
          }
        });
      }, { threshold: 0.25 });
      sio.observe(pgrid);
    }

    // cursor-follow specular highlight: glides across every glass surface (cards + patents), fine pointer only
    if (finePointer) {
      document.querySelectorAll(".card, .patent").forEach((card) => {
        card.addEventListener("pointermove", (e) => {
          const r = card.getBoundingClientRect();
          card.style.setProperty("--mx", ((e.clientX - r.left) / r.width * 100).toFixed(1) + "%");
          card.style.setProperty("--my", ((e.clientY - r.top) / r.height * 100).toFixed(1) + "%");
        });
      });

      // Tahoe nav specular: the top-edge light tracks the pointer across the nav (writes --spec-x/--spec-y).
      // Compositor-only (a gradient position); CSS hides .nav::before under reduced-motion + mobile.
      const navEl = document.querySelector(".nav");
      if (navEl) {
        navEl.addEventListener("pointermove", (e) => {
          const r = navEl.getBoundingClientRect();
          navEl.style.setProperty("--spec-x", (((e.clientX - r.left) / r.width) * 100).toFixed(1) + "%");
          navEl.style.setProperty("--spec-y", (((e.clientY - r.top) / r.height) * 100).toFixed(1) + "%");
        });
        navEl.addEventListener("pointerleave", () => {
          navEl.style.setProperty("--spec-x", "50%");
          navEl.style.setProperty("--spec-y", "0%");
        });
      }
    }
  }

  /* ---------- Single rAF loop: nav state + ambient parallax + sequence ---------- */
  const navShell = document.querySelector(".nav-shell");
  const orbA = document.querySelector(".orb--a");
  const orbB = document.querySelector(".orb--b");
  const contactOrb = document.querySelector(".contact__orb");
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
        // contact ambient field: a few px of drift; base -50%/-50% centering preserved in the write
        if (contactOrb) contactOrb.style.transform = `translate3d(-50%, -50%, 0) translateY(${(y * 0.018).toFixed(1)}px)`;
      }
      lastY = y;
    }
    if (choreoTick) choreoTick();
    if (seqTick) seqTick();
    if (workTick) workTick();
    requestAnimationFrame(frame);
  }
  if (!reduceMotion) requestAnimationFrame(frame);
  else if (navShell) {
    // still toggle nav background without animation loop
    navShell.classList.toggle("is-scrolled", window.scrollY > 16);
  }
})();

/* ============================================================
   CONTACT FORM — Web3Forms AJAX submit (PASS C).
   Self-contained: only runs on the page that has #contact-form.
   Static-safe (GitHub Pages), no backend, no third-party scripts
   beyond the single fetch to api.web3forms.com. Submits a JSON POST
   (data never touches the URL) and renders state from the response.
   ============================================================ */
(() => {
  "use strict";
  const form = document.getElementById("contact-form");
  if (!form) return;

  /* ╔══════════════════════════════════════════════════════════════╗
     ║  OWNER — PASTE YOUR WEB3FORMS ACCESS KEY HERE  👇             ║
     ║  Get one (free, arrives by email instantly) at                ║
     ║  https://web3forms.com — register with roshan@roshworldwide.com║
     ║  Replace the placeholder string below; keep the quotes.        ║
     ║  Nothing else to change — the form wires itself up.            ║
     ╚══════════════════════════════════════════════════════════════╝ */
  const WEB3FORMS_ACCESS_KEY = "69c4388e-4c99-4670-a3c1-aee3e596b4a7";

  const ENDPOINT = "https://api.web3forms.com/submit";
  const submitBtn = form.querySelector(".cform__submit");
  const btnLabel  = form.querySelector(".cform__btn-label");
  const note      = document.getElementById("cform-note");
  const live      = document.getElementById("cform-live");
  const noteDefault = note ? note.textContent : "";

  const fields = {
    name:    form.querySelector("#cf-name"),
    email:   form.querySelector("#cf-email"),
    message: form.querySelector("#cf-message"),
  };
  const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  function setError(input, msg) {
    if (!input) return true;
    const field = input.closest(".cform__field");
    const err = field && field.querySelector(".cform__err");
    if (msg) {
      field && field.classList.add("is-invalid");
      if (err) err.textContent = msg;
      input.setAttribute("aria-invalid", "true");
      return false;
    }
    field && field.classList.remove("is-invalid");
    if (err) err.textContent = "";
    input.removeAttribute("aria-invalid");
    return true;
  }

  function validate() {
    let ok = true;
    ok = setError(fields.name, fields.name.value.trim() ? "" : "Your name, please.") && ok;
    const email = fields.email.value.trim();
    ok = setError(fields.email, !email ? "An email so I can reply." : (!emailRe.test(email) ? "That email looks off." : "")) && ok;
    ok = setError(fields.message, fields.message.value.trim() ? "" : "Tell me something.") && ok;
    return ok;
  }

  // clear a field's error as soon as the user starts fixing it
  Object.values(fields).forEach((i) => i && i.addEventListener("input", () => {
    const field = i.closest(".cform__field");
    if (field && field.classList.contains("is-invalid")) setError(i, "");
  }));

  function showNote(msg, isError) {
    if (note) { note.textContent = msg; note.classList.toggle("is-error", !!isError); }
    if (live) live.textContent = msg;
  }
  function resetButton() {
    form.classList.remove("is-sending");
    if (btnLabel) btnLabel.textContent = "Send message";
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    if (!validate()) {
      const firstBad = form.querySelector(".cform__field.is-invalid .cform__input");
      if (firstBad) firstBad.focus();
      showNote("A couple of fields need a look.", true);
      return;
    }

    // graceful fail if the key is still the placeholder (or empty)
    if (!WEB3FORMS_ACCESS_KEY || WEB3FORMS_ACCESS_KEY === "YOUR_WEB3FORMS_ACCESS_KEY") {
      showNote("Form isn’t connected yet — email me at roshan@roshworldwide.com.", true);
      return;
    }

    form.classList.add("is-sending");
    if (btnLabel) btnLabel.textContent = "Sending…";
    if (note) note.classList.remove("is-error");
    if (live) live.textContent = "Sending your message…";

    // build the JSON payload (POST body only — never the query string)
    const payload = Object.fromEntries(new FormData(form).entries());
    payload.access_key = WEB3FORMS_ACCESS_KEY;
    const subj = (payload.subject || "").trim();
    payload.subject = subj || `New message from ${payload.name} — roshworldwide.com`;
    payload.from_name = "roshworldwide.com contact form";

    try {
      const res = await fetch(ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Accept": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      resetButton();

      if (res.ok && data.success) {
        form.classList.add("is-sent");
        if (live) live.textContent = "Message received. I'll be in touch.";
        form.reset();
      } else {
        showNote((data && data.message) || "Something went wrong. Try again, or email me directly.", true);
      }
    } catch (err) {
      resetButton();
      showNote("Network hiccup — check your connection, or email me at roshan@roshworldwide.com.", true);
    }
  });
})();

/* ============================================================
   PROJECT DEMO SLOTS (PASS D) — honest, lazy live-demo embeds.
   Each case study has <div class="demo" data-demo="<slug>">. While a
   project's demo URL is empty, the slot shows an honest "in progress"
   state and NO iframe is created. The moment a real hosted URL is set
   below, that slot lazy-loads the demo into an <iframe> on scroll —
   recruiters get the real thing, never a mock.

   ╔══════════════════════════════════════════════════════════════╗
   ║  OWNER — TO MAKE A DEMO GO LIVE: set its hosted URL as the     ║
   ║  value for its slug below (the ONE line you edit), e.g.        ║
   ║      "llm-eval": "https://eval.roshworldwide.com",            ║
   ║  Leave it "" to keep the honest "in progress" state.          ║
   ╚══════════════════════════════════════════════════════════════╝ */
(() => {
  "use strict";
  const slots = document.querySelectorAll("[data-demo]");
  if (!slots.length) return;

  const PROJECT_DEMOS = {
    "llm-eval":     "",   // flagship playground — paste its hosted URL here to go live
    "acoustic-ams": "",
    "sre-engine":   "",
    "finance-os":   "",
    "quant-signal": "",
  };

  const activate = (box, url) => {
    if (box.dataset.loaded) return;
    box.dataset.loaded = "1";
    const frame = document.createElement("iframe");
    frame.className = "demo__frame";
    frame.src = url;
    frame.title = box.dataset.demoTitle || "Live demo";
    frame.loading = "lazy";
    frame.referrerPolicy = "no-referrer";
    frame.setAttribute("allow", "fullscreen");
    frame.setAttribute("allowfullscreen", "");
    const ph = box.querySelector(".demo__placeholder");
    if (ph) ph.remove();
    box.classList.add("is-live");
    box.appendChild(frame);
  };

  slots.forEach((box) => {
    const slug = box.dataset.demo;
    const url = (box.dataset.demoUrl || PROJECT_DEMOS[slug] || "").trim();
    if (!url) return; // honest placeholder stays; no iframe is ever created
    if ("IntersectionObserver" in window) {
      const io = new IntersectionObserver((entries, obs) => {
        entries.forEach((e) => { if (e.isIntersecting) { activate(box, url); obs.disconnect(); } });
      }, { rootMargin: "300px" });
      io.observe(box);
    } else {
      activate(box, url);
    }
  });
})();

/* ============================================================
   FROM THE WORKSHOP (PASS D) — live, curated GitHub feed.
   Fetches roshworldwide's public repos at runtime and renders ONLY those
   tagged with the `showreel` topic, deduped against the curated cards.
   Cached in sessionStorage so re-visits don't re-hit the rate-limited
   (~60/hr) anonymous API. On ANY failure (rate-limit / offline / empty)
   it stays silent — the section hides and the curated cards remain.
   Public data only; no token in client code.
   ============================================================ */
(() => {
  "use strict";
  const grid = document.getElementById("showreel-grid");
  const section = document.getElementById("showreel");
  if (!grid || !section) return;

  const USER = "roshworldwide";
  const TOPIC = "showreel";
  const CACHE_KEY = "rw_showreel_v1";

  // curated projects already shown by hand — dedupe the feed against these (normalized)
  const FEATURED = new Set(["acousticams", "llmevaluationframework", "llmeval", "onpremisesreengine", "sreengine", "financeos", "quantitativesignalengine", "quantsignal"]);
  const norm = (s) => (s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  const esc = (s) => String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

  const fmtDate = (iso) => {
    try { return "Updated " + new Date(iso).toLocaleDateString(undefined, { month: "short", year: "numeric" }); }
    catch (_) { return ""; }
  };

  const cardHTML = (r, i) => {
    const lang = r.language ? `<span class="chip">${esc(r.language)}</span>` : "<span></span>";
    const stars = (r.stargazers_count | 0) > 0 ? `<span class="repo-card__stars" aria-label="${r.stargazers_count} stars">★ ${r.stargazers_count}</span>` : "";
    const live = r.homepage ? ` · <a href="${esc(r.homepage)}" target="_blank" rel="noopener">Live ↗</a>` : "";
    const desc = r.description ? esc(r.description) : "No description yet.";
    return `<li style="--i:${i}"><article class="card repo-card">
      <div class="card__body">
        <div class="card__meta">${lang}${stars}</div>
        <h3 class="card__title">${esc(r.name)}</h3>
        <p class="card__desc">${desc}</p>
        <div class="repo-card__foot">
          <span class="repo-card__updated">${esc(fmtDate(r.pushed_at || r.updated_at))}</span>
          <span class="repo-card__links"><a href="${esc(r.html_url)}" target="_blank" rel="noopener">Repo ↗</a>${live}</span>
        </div>
      </div>
    </article></li>`;
  };

  const render = (repos) => {
    if (!repos || !repos.length) return;        // nothing to add -> stay hidden
    grid.innerHTML = repos.map(cardHTML).join("");
    section.hidden = false;
  };

  const pick = (all) => (Array.isArray(all) ? all : [])
    .filter((r) => r && !r.fork && !r.archived && Array.isArray(r.topics) && r.topics.includes(TOPIC))
    .filter((r) => !FEATURED.has(norm(r.name)))
    .map((r) => ({
      name: r.name, description: r.description, language: r.language,
      stargazers_count: r.stargazers_count, html_url: r.html_url, homepage: r.homepage,
      pushed_at: r.pushed_at, updated_at: r.updated_at,
    }));

  // 1) cache first (don't re-hit the rate-limited API on re-visits this session)
  try {
    const cached = JSON.parse(sessionStorage.getItem(CACHE_KEY) || "null");
    if (cached) { if (cached.ok) render(cached.repos); return; }
  } catch (_) {}

  // 2) fetch live; any error -> silent fallback (curated cards remain)
  fetch(`https://api.github.com/users/${USER}/repos?per_page=100&sort=updated`, {
    headers: { "Accept": "application/vnd.github+json" },
  })
    .then((res) => { if (!res.ok) throw new Error("gh " + res.status); return res.json(); })
    .then((all) => {
      const repos = pick(all);
      try { sessionStorage.setItem(CACHE_KEY, JSON.stringify({ ok: true, repos })); } catch (_) {}
      render(repos);
    })
    .catch(() => {
      try { sessionStorage.setItem(CACHE_KEY, JSON.stringify({ ok: false })); } catch (_) {}
    });
})();
