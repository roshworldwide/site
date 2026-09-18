(() => {
  "use strict";

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const finePointer = window.matchMedia("(pointer: fine)").matches;

  const yearEl = document.getElementById("year");
  if (yearEl) yearEl.textContent = String(new Date().getFullYear());

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

  document.querySelectorAll("[data-marquee] .marquee__track").forEach((track) => {
    const clone = document.createElement("span");
    clone.setAttribute("aria-hidden", "true");
    clone.style.display = "contents";
    clone.innerHTML = track.innerHTML;
    track.appendChild(clone);
    track.querySelectorAll("img").forEach((img) => {
      img.addEventListener("error", () => { img.style.display = "none"; });
    });
  });

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

    document.querySelectorAll("[data-tilt]").forEach((el) => {
      const max = 6;
      el.addEventListener("pointermove", (e) => {
        const r = el.getBoundingClientRect();
        const px = (e.clientX - r.left) / r.width - 0.5;
        const py = (e.clientY - r.top) / r.height - 0.5;
        el.style.transform = `perspective(900px) rotateX(${(-py * max).toFixed(2)}deg) rotateY(${(px * max).toFixed(2)}deg)`;
      });
      el.addEventListener("pointerleave", () => { el.style.transform = ""; });
    });
  }

  let seqTick = null;
  (function initSequence() {
    const section = document.getElementById("sequence");
    if (!section) return;
    const canvas = document.getElementById("seq-canvas");
    const ctx = canvas && canvas.getContext ? canvas.getContext("2d") : null;
    const small = window.matchMedia("(max-width: 760px)").matches;

    if (reduceMotion || !ctx || small) {
      section.classList.add("is-static");
      section.querySelectorAll(".seq__chapter").forEach((c) => c.classList.add("is-active"));
      return;
    }

    const FRAMES = 227;
    const pad = (n) => String(n).padStart(3, "0");
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    const images = new Array(FRAMES);
    const loaded = new Array(FRAMES).fill(false);
    let decoded = 0;
    let ready = false;
    let lastDrawn = -1;
    let cur = 0;
    let primed = false;
    let prevIdx = 0;
    const decodedSet = new Set();

    const loaderNum = document.getElementById("seq-loader-num");
    const railFill = document.getElementById("seq-rail");
    const heroEl = document.getElementById("seq-hero");
    const openEl = document.getElementById("seq-open");
    const cueEl = document.getElementById("seq-cue");
    let heroGone = false;
    const easeOut = (t) => 1 - Math.pow(1 - t, 3);
    const vh = () => window.innerHeight || 1;
    const chapters = Array.from(section.querySelectorAll(".seq__chapter")).map((el) => ({
      el, at: parseFloat(el.dataset.at), active: false,
    }));

    function sizeCanvas() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const r = canvas.getBoundingClientRect();
      canvas.width = Math.max(1, Math.round(r.width * dpr));
      canvas.height = Math.max(1, Math.round(r.height * dpr));
      lastDrawn = -1;
    }
    function draw(idx) {
      const img = images[idx];
      if (!img || !loaded[idx]) return;
      const iw = img.naturalWidth, ih = img.naturalHeight;
      const scale = Math.max(canvas.width / iw, canvas.height / ih);
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
    for (let i = 0; i < FRAMES; i++) load(i);

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
      if (!inView) return;
      const r = section.getBoundingClientRect();
      const dist = r.height - window.innerHeight;
      const p = dist > 0 ? Math.min(1, Math.max(0, -r.top / dist)) : 0;

      const out = easeOut(Math.min(1, p / 0.18));
      if (heroEl) {
        heroEl.style.opacity = (1 - out).toFixed(3);
        heroEl.style.transform =
          `translate3d(0, ${(-out * vh() * 0.10).toFixed(1)}px, 0) scale(${(1 - out * 0.035).toFixed(4)})`;
        const gone = p > 0.16;
        if (gone !== heroGone) { heroGone = gone; heroEl.classList.toggle("is-gone", gone); }
      }
      if (openEl) openEl.style.opacity = ((1 - easeOut(Math.min(1, p / 0.20))) * 0.97).toFixed(3);
      if (cueEl) cueEl.style.opacity = Math.max(0, 1 - p / 0.045).toFixed(3);
      if (railFill) railFill.style.transform = `scaleX(${p.toFixed(4)})`;
      for (const c of chapters) {
        const on = Math.abs(p - c.at) < 0.14;
        if (on !== c.active) { c.active = on; c.el.classList.toggle("is-active", on); }
      }

      if (!ready) return;
      const target = p * (FRAMES - 1);
      if (!primed) { cur = target; primed = true; }
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

  let choreoTick = null;
  if (!reduceMotion) {
    document.documentElement.classList.add("choreo");
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
    addGroup("#work .bento > .card", "#work .bento", { stagger: 0.09, win: 0.55, rise: 44, parallax: true });
    addGroup("#patents .patent", "#patents .patents__grid", { stagger: 0.07, win: 0.5, rise: 38, underline: true });

    choreoTick = function () {
      const H = window.innerHeight || 1;
      for (const g of groups) {
        if (!g.inView) continue;
        const r = g.section.getBoundingClientRect();
        const sp = clamp01((H * 0.92 - r.top) / (H * 0.52));
        if (sp === g._lastSp) continue;
        g._lastSp = sp;
        for (let i = 0; i < g.items.length; i++) {
          const el = g.items[i];
          const cp = clamp01((sp - i * g.stagger) / g.win);
          const e = easeOut(cp);
          el.style.opacity = e.toFixed(3);
          el.style.transform = `translate3d(0, ${((1 - e) * g.rise).toFixed(1)}px, 0) scale(${(0.965 + e * 0.035).toFixed(4)})`;
          if (g.parallax) {
            const cr = el.getBoundingClientRect();
            const rel = (cr.top + cr.height / 2 - H / 2) / H;
            el.style.setProperty("--mpy", (-rel * 16).toFixed(1) + "px");
          }
          if (g.underline) {
            const shown = cp > 0.5;
            if (shown !== el._shown) { el._shown = shown; el.classList.toggle("is-shown", shown); }
          }
        }
      }
    };

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

    if (finePointer) {
      document.querySelectorAll("#work .bento > .card").forEach((card) => {
        card.addEventListener("pointermove", (e) => {
          const r = card.getBoundingClientRect();
          card.style.setProperty("--mx", ((e.clientX - r.left) / r.width * 100).toFixed(1) + "%");
          card.style.setProperty("--my", ((e.clientY - r.top) / r.height * 100).toFixed(1) + "%");
        });
      });
    }
  }

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
    if (choreoTick) choreoTick();
    if (seqTick) seqTick();
    requestAnimationFrame(frame);
  }
  if (!reduceMotion) requestAnimationFrame(frame);
  else if (navShell) {
    navShell.classList.toggle("is-scrolled", window.scrollY > 16);
  }
})();
