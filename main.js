(function () {
  'use strict';

  // ─── PIN CONFIG (mirrors Skeye exactly) ──────────────────────
  const VIDEO_FPS = 24;

  const PIN_CONFIG = [
    { name: 'INTRO',      frame: 0,   navIdx: 0 },
    { name: 'EXPERIENCE', frame: 32,  navIdx: 1 },
    { name: 'RESEARCH_1', frame: 58,  navIdx: 2 }, // optics patent   — right-third spotlight
    { name: 'RESEARCH_2', frame: 58,  navIdx: 2 }, // tactile robotics — left-half spotlight
    { name: 'RESEARCH_3', frame: 58,  navIdx: 2 }, // Harvard Medical  — left-3/4 spotlight
    { name: 'PROJECTS',   frame: 92,  navIdx: 3 },
    { name: 'CONTACT',    frame: 230, navIdx: 4 },
  ];

  PIN_CONFIG.forEach(pin => { pin.time = pin.frame / VIDEO_FPS; });

  const NUM_PINS = PIN_CONFIG.length;

  // ─── ANIMATION DURATIONS ─────────────────────────────────────
  const SCROLL_DURATION        = 2100; // ms
  const BUTTON_DURATION        =  600; // ms
  const OVERLAY_SWAP_DURATION  =  480; // ms — same-video-time panel swaps
  const OVERLAY_FADE_START     = 0.15;

  // After each transition finishes, block scroll for this long.
  // Prevents Mac trackpad momentum from triggering the next pin change.
  const POST_TRANSITION_LOCK = 600; // ms

  // ─── STATE ───────────────────────────────────────────────────
  let currentPin      = 0;
  let isTransitioning = false;
  let transitionToken = 0;
  let hasScrolled     = false;
  let scrollAllowedAt = 0; // timestamp after which next scroll is accepted

  // ─── DOM ─────────────────────────────────────────────────────
  const video        = document.getElementById('bg-video');
  const wrapper      = document.getElementById('video-wrapper');
  const loader       = document.getElementById('loader');
  const loaderBar    = document.getElementById('loader-bar');
  const loaderLabel  = document.getElementById('loader-label');
  const panels       = document.querySelectorAll('.content-panel');
  const navLinks     = document.querySelectorAll('.nav-link');
  const indicators   = document.querySelectorAll('.indicator');
  const progressFill = document.getElementById('nav-progress-fill');
  const videoTimeEl  = document.getElementById('video-time');
  const scrollHint   = document.getElementById('scroll-hint');

  // ─── LOADER ──────────────────────────────────────────────────
  video.addEventListener('progress', () => {
    if (!video.duration || !video.buffered.length) return;
    const pct = Math.min(100,
      (video.buffered.end(video.buffered.length - 1) / video.duration) * 100);
    loaderBar.style.width = pct + '%';
    if (loaderLabel) loaderLabel.textContent = 'LOADING... ' + Math.round(pct) + '%';
  });

  video.addEventListener('canplay', () => {
    if (!siteShown) {
      loaderBar.style.width = '100%';
      if (loaderLabel) loaderLabel.textContent = 'INITIALIZED';
      video.pause();
      video.currentTime = PIN_CONFIG[0].time;
      setTimeout(showSite, 250);
    }
  });

  video.addEventListener('timeupdate', () => {
    const t = video.currentTime;
    const d = video.duration || PIN_CONFIG[NUM_PINS - 1].time;
    if (progressFill) progressFill.style.width = ((t / d) * 100) + '%';
    if (videoTimeEl)  videoTimeEl.textContent  = fmt(t);
  });

  setTimeout(() => { if (!siteShown) showSite(); }, 7000);

  // ─── TAB VISIBILITY / BFCACHE ────────────────────────────────
  // When returning from another tab, the browser may have suspended the
  // video decoder. A brief play() wakes it up before we re-seek, so that
  // subsequent currentTime assignments actually render new frames.
  function resumeAfterHidden() {
    if (!siteShown) return;
    // Cancel any stale rAF animation that was running while hidden
    transitionToken++;
    isTransitioning = false;
    scrollAllowedAt = 0; // allow immediate scroll after tab return

    const targetTime = PIN_CONFIG[currentPin].time;

    // Re-assert panel states immediately
    panels.forEach((p, i) => setCardVisual(p, i === currentPin ? 1 : 0));

    // Wake up the video decoder then park at the correct frame.
    // play() + immediate pause() forces the browser to decode frames again.
    const p = video.play();
    if (p instanceof Promise) {
      p.then(() => {
        video.pause();
        video.currentTime = targetTime;
      }).catch(() => {
        video.currentTime = targetTime;
      });
    } else {
      video.pause();
      video.currentTime = targetTime;
    }
  }

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) resumeAfterHidden();
  });

  window.addEventListener('pageshow', (e) => {
    if (e.persisted) resumeAfterHidden();
  });

  // ─── INIT / SHOW ─────────────────────────────────────────────
  let siteShown = false;
  function showSite() {
    if (siteShown) return;
    siteShown = true;
    video.pause();
    video.currentTime = PIN_CONFIG[0].time;
    loader.classList.add('hidden');
    panels.forEach((p, i) => setCardVisual(p, i === 0 ? 1 : 0));
    syncNavAndDots(0);
  }

  function fmt(s) {
    const m = Math.floor(s / 60);
    return m + ':' + String(Math.floor(s % 60)).padStart(2, '0');
  }

  // ─── OVERLAY HELPERS ─────────────────────────────────────────
  function setCardVisual(panel, alpha) {
    if (!panel) return;
    const a = clamp01(alpha);
    panel.style.opacity       = String(a);
    panel.style.transform     = 'translateY(' + (18 * (1 - a)) + 'px)';
    panel.style.pointerEvents = a > 0.05 ? 'all' : 'none';
  }

  function syncNavAndDots(idx) {
    const navIdx = PIN_CONFIG[idx].navIdx;
    navLinks.forEach((l, i)   => l.classList.toggle('active', i === navIdx));
    indicators.forEach((d, i) => d.classList.toggle('active', i === navIdx));
    wrapper.dataset.section = idx;
    currentPin = idx;
    if (hasScrolled && scrollHint) scrollHint.classList.add('hidden');
  }

  // ─── CORE ANIMATION ──────────────────────────────────────────
  function animateVideoTime(startTime, endTime, duration, myToken, onProgress, onDone) {
    const startTS = performance.now();

    function step(now) {
      if (transitionToken !== myToken) return;

      const p    = Math.min((now - startTS) / duration, 1);
      const ease = p < 0.5
        ? 4 * p * p * p
        : 1 - Math.pow(-2 * p + 2, 3) / 2;

      video.currentTime = startTime + (endTime - startTime) * ease;
      onProgress(ease);

      if (p < 1) requestAnimationFrame(step);
      else        onDone();
    }

    requestAnimationFrame(step);
  }

  // ─── GO TO PIN ───────────────────────────────────────────────
  function goToPin(targetIdx, isButtonClick) {
    if (targetIdx === currentPin)               return;
    if (targetIdx < 0 || targetIdx >= NUM_PINS) return;

    const myToken   = ++transitionToken;
    isTransitioning = true;

    const fromIdx   = currentPin;
    const startTime = video.currentTime || PIN_CONFIG[fromIdx].time;
    const endTime   = PIN_CONFIG[targetIdx].time;

    const isSameTime = Math.abs(startTime - endTime) < 0.05;
    const duration   = isSameTime
      ? OVERLAY_SWAP_DURATION
      : (isButtonClick ? BUTTON_DURATION : SCROLL_DURATION);

    syncNavAndDots(targetIdx);

    animateVideoTime(startTime, endTime, duration, myToken, (ease) => {
      const t = clamp01((ease - OVERLAY_FADE_START) / (1 - OVERLAY_FADE_START));
      setCardVisual(panels[fromIdx],   1 - t);
      setCardVisual(panels[targetIdx], t);
    }, () => {
      if (transitionToken !== myToken) return;
      video.pause();
      video.currentTime = endTime;
      isTransitioning   = false;
      setCardVisual(panels[fromIdx],   0);
      setCardVisual(panels[targetIdx], 1);
      // Lock out momentum scroll for a beat after each transition
      scrollAllowedAt = Date.now() + POST_TRANSITION_LOCK;
    });
  }

  // ─── SCROLL ──────────────────────────────────────────────────
  function setupScrollDetection() {
    window.addEventListener('wheel', (e) => {
      e.preventDefault();
      const now = Date.now();
      // Two gates: in-transition lock + post-transition momentum cooldown
      if (isTransitioning || now < scrollAllowedAt) return;

      if (!hasScrolled) {
        hasScrolled = true;
        if (scrollHint) scrollHint.classList.add('hidden');
      }

      if (e.deltaY > 0) {
        goToPin(currentPin + 1, false);
      } else {
        goToPin(Math.max(currentPin - 1, 0), false);
      }
    }, { passive: false });

    // Touch
    let touchStartY = null;
    window.addEventListener('touchstart', (e) => {
      touchStartY = e.touches[0].clientY;
    }, { passive: true });

    window.addEventListener('touchend', (e) => {
      if (touchStartY == null || isTransitioning) return;
      const dy = touchStartY - e.changedTouches[0].clientY;
      touchStartY = null;
      if (Math.abs(dy) < 40) return;
      if (!hasScrolled) { hasScrolled = true; if (scrollHint) scrollHint.classList.add('hidden'); }
      goToPin(currentPin + (dy > 0 ? 1 : -1), false);
    }, { passive: true });
  }

  // ─── KEYBOARD ────────────────────────────────────────────────
  function setupKeyboard() {
    document.addEventListener('keydown', (e) => {
      if (isTransitioning) return;
      if (['ArrowDown', 'ArrowRight', 'PageDown', ' '].includes(e.key)) {
        e.preventDefault();
        goToPin(currentPin + 1, false);
      } else if (['ArrowUp', 'ArrowLeft', 'PageUp'].includes(e.key)) {
        e.preventDefault();
        goToPin(Math.max(currentPin - 1, 0), false);
      }
    });
  }

  // ─── NAV / DOT CLICKS ────────────────────────────────────────
  function setupNavClicks() {
    navLinks.forEach(l => l.addEventListener('click', () => {
      if (isTransitioning) return;
      const t = parseInt(l.dataset.section, 10);
      if (!isNaN(t)) goToPin(t, true);
    }));

    indicators.forEach(d => d.addEventListener('click', () => {
      if (isTransitioning) return;
      const t = parseInt(d.dataset.section, 10);
      if (!isNaN(t)) goToPin(t, true);
    }));
  }

  function clamp01(x) { return Math.max(0, Math.min(1, x)); }

  // ─── INIT ────────────────────────────────────────────────────
  function init() {
    panels.forEach(p => setCardVisual(p, 0));
    video.pause();

    setupScrollDetection();
    setupKeyboard();
    setupNavClicks();

    if (video.readyState >= 3 && !siteShown) {
      video.pause();
      video.currentTime = PIN_CONFIG[0].time;
      setTimeout(showSite, 200);
    }
  }

  document.addEventListener('DOMContentLoaded', init);
})();
