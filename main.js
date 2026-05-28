(function () {
  'use strict';

  // ─── PIN CONFIG ───────────────────────────────────────────────
  const VIDEO_FPS = 24;

  const PIN_CONFIG = [
    { name: 'INTRO',      frame: 0,   navIdx: 0 },
    { name: 'EXPERIENCE', frame: 32,  navIdx: 1 },
    { name: 'RESEARCH_1', frame: 58,  navIdx: 2 },
    { name: 'RESEARCH_2', frame: 58,  navIdx: 2 },
    { name: 'RESEARCH_3', frame: 58,  navIdx: 2 },
    { name: 'PROJECTS_1', frame: 92,  navIdx: 3 },
    { name: 'PROJECTS_2', frame: 107, navIdx: 3 },
    { name: 'PROJECTS_3', frame: 170, navIdx: 3 },
    { name: 'CONTACT',    frame: 230, navIdx: 4 },
  ];

  PIN_CONFIG.forEach(pin => { pin.time = pin.frame / VIDEO_FPS; });
  const NUM_PINS = PIN_CONFIG.length;

  // ─── STATE ────────────────────────────────────────────────────
  const IDLE_RATE = 0.001; // keep decoder alive; all rAF writes are forward seeks

  let currentPin      = 0;
  let isTransitioning = false;
  let transitionToken = 0;
  let hasScrolled     = false;
  let lastScrollTime  = 0;
  let scrollUnlockAt  = 0;
  const SCROLL_DEBOUNCE = 140;

  // ─── DOM ──────────────────────────────────────────────────────
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

  // ─── LOADER ───────────────────────────────────────────────────
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
  // After returning from a hidden tab the video decoder is suspended.
  // We play briefly, seek to the correct frame, then wait for
  // requestVideoFrameCallback to confirm the compositor has painted
  // before unlocking scroll. Without this the decoder stays cold and
  // currentTime writes produce no visual update.
  function resumeAfterHidden() {
    if (!siteShown) return;
    const myToken   = ++transitionToken;
    isTransitioning = false;
    lastScrollTime  = 0;
    scrollUnlockAt  = Date.now() + 2000;

    const targetTime = PIN_CONFIG[currentPin].time;
    panels.forEach((p, i) => setCardVisual(p, i === currentPin ? 1 : 0));

    function finish() {
      if (transitionToken !== myToken) return;
      video.currentTime = targetTime;
      video.playbackRate = IDLE_RATE;
      scrollUnlockAt = 0;
    }

    video.playbackRate = IDLE_RATE;
    const p = video.play();
    if (p instanceof Promise) {
      p.then(() => {
        if (transitionToken !== myToken) { scrollUnlockAt = 0; return; }
        video.currentTime = targetTime;
        if (typeof video.requestVideoFrameCallback === 'function') {
          video.requestVideoFrameCallback(finish);
        } else {
          setTimeout(finish, 150);
        }
      }).catch(() => { video.currentTime = targetTime; scrollUnlockAt = 0; });
    } else {
      video.currentTime = targetTime;
      video.playbackRate = IDLE_RATE;
      scrollUnlockAt = 0;
    }
  }

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) resumeAfterHidden();
  });
  window.addEventListener('pageshow', (e) => {
    if (e.persisted) resumeAfterHidden();
  });

  // ─── INIT / SHOW ──────────────────────────────────────────────
  let siteShown = false;
  function showSite() {
    if (siteShown) return;
    siteShown = true;
    video.currentTime = PIN_CONFIG[0].time;
    video.playbackRate = IDLE_RATE;
    video.play().catch(() => {});
    loader.classList.add('hidden');
    panels.forEach((p, i) => setCardVisual(p, i === 0 ? 1 : 0));
    syncNavAndDots(0);
  }

  function fmt(s) {
    const m = Math.floor(s / 60);
    return m + ':' + String(Math.floor(s % 60)).padStart(2, '0');
  }

  // ─── HELPERS ──────────────────────────────────────────────────
  function clamp01(x) { return Math.max(0, Math.min(1, x)); }

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

  // ─── PANEL FADE ───────────────────────────────────────────────
  // Fade a panel between two alpha values over `dur` ms using rAF.
  // Stops immediately if the transition token changes.
  function fadePanel(panel, from, to, dur, myToken, done) {
    const startTS = performance.now();
    function step(now) {
      if (transitionToken !== myToken) return;
      const t = Math.min((now - startTS) / dur, 1);
      setCardVisual(panel, from + (to - from) * t);
      if (t < 1) requestAnimationFrame(step);
      else done();
    }
    requestAnimationFrame(step);
  }

  // ─── SCRUB VIDEO ──────────────────────────────────────────────
  // Video plays at IDLE_RATE (0.001×) always, keeping the decoder live.
  // rAF loop writes currentTime at 0.75× (scroll) or 1.5× (nav click).
  // Both are massive forward seeks vs the near-zero natural position →
  // genuine decode ops on both fresh load and tab-return.
  function scrubToTime(targetTime, fast, myToken, done) {
    const startVideoTime = video.currentTime;
    const forward        = targetTime > startVideoTime + 0.02;
    const rate           = fast ? 1.5 : 0.75;

    let startTS = null;
    function step(now) {
      if (transitionToken !== myToken) { video.playbackRate = IDLE_RATE; return; }
      if (startTS === null) startTS = now;
      const elapsed = (now - startTS) / 1000;
      const next = forward
        ? Math.min(startVideoTime + elapsed * rate, targetTime)
        : Math.max(startVideoTime - elapsed * rate, targetTime);
      video.currentTime = next;
      const reached = forward ? next >= targetTime - 0.02 : next <= targetTime + 0.02;
      if (reached) { video.currentTime = targetTime; video.playbackRate = IDLE_RATE; done(); }
      else requestAnimationFrame(step);
    }

    if (video.paused) {
      video.playbackRate = IDLE_RATE;
      const p = video.play();
      if (p instanceof Promise) {
        p.then(() => requestAnimationFrame(step)).catch(() => requestAnimationFrame(step));
      } else {
        requestAnimationFrame(step);
      }
    } else {
      video.playbackRate = IDLE_RATE;
      requestAnimationFrame(step);
    }
  }

  // ─── GO TO PIN ────────────────────────────────────────────────
  function goToPin(targetIdx, isButtonClick) {
    if (targetIdx === currentPin)               return;
    if (targetIdx < 0 || targetIdx >= NUM_PINS) return;

    const myToken  = ++transitionToken;
    isTransitioning = true;

    const fromIdx    = currentPin;
    const endTime    = PIN_CONFIG[targetIdx].time;
    const isSameTime = Math.abs(video.currentTime - endTime) < 0.05;

    syncNavAndDots(targetIdx);
    setCardVisual(panels[fromIdx],   1);
    setCardVisual(panels[targetIdx], 0);

    if (isSameTime) {
      // Research panels share the same video frame — crossfade overlays only.
      const dur = 400, startTS = performance.now();
      (function step(now) {
        if (transitionToken !== myToken) return;
        const t = Math.min((now - startTS) / dur, 1);
        setCardVisual(panels[fromIdx],   1 - t);
        setCardVisual(panels[targetIdx], t);
        if (t < 1) {
          requestAnimationFrame(step);
        } else {
          setCardVisual(panels[fromIdx],   0);
          setCardVisual(panels[targetIdx], 1);
          isTransitioning = false;
          scrollUnlockAt  = Date.now() + 800;
        }
      })(performance.now());

    } else {
      // Three-phase: fade out text/blurs → scrub video → fade in text/blurs
      fadePanel(panels[fromIdx], 1, 0, 250, myToken, () => {
        if (transitionToken !== myToken) return;

        scrubToTime(endTime, isButtonClick, myToken, () => {
          if (transitionToken !== myToken) return;

          fadePanel(panels[targetIdx], 0, 1, 350, myToken, () => {
            if (transitionToken !== myToken) return;
            isTransitioning = false;
            setCardVisual(panels[fromIdx],   0);
            setCardVisual(panels[targetIdx], 1);
            scrollUnlockAt = Date.now() + 500;
          });
        });
      });
    }
  }

  // ─── SCROLL ───────────────────────────────────────────────────
  function setupScrollDetection() {
    window.addEventListener('wheel', (e) => {
      e.preventDefault();
      const now = Date.now();
      if (isTransitioning || now < scrollUnlockAt || now - lastScrollTime < SCROLL_DEBOUNCE) return;
      lastScrollTime = now;
      if (!hasScrolled) {
        hasScrolled = true;
        if (scrollHint) scrollHint.classList.add('hidden');
      }
      goToPin(e.deltaY > 0 ? currentPin + 1 : Math.max(currentPin - 1, 0), false);
    }, { passive: false });

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

  // ─── KEYBOARD ─────────────────────────────────────────────────
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

  // ─── NAV / DOT CLICKS ─────────────────────────────────────────
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

  // ─── INIT ─────────────────────────────────────────────────────
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
