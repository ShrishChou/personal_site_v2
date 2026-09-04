/* shrishc.com — gallery + lazy media. No dependencies. */
(function () {
  'use strict';

  /* ---------------- gallery ---------------- */
  var stage = document.getElementById('gal-stage');
  if (!stage) return;

  var slides = Array.prototype.slice.call(stage.querySelectorAll('.slide'));
  var capEl  = document.getElementById('gal-cap');
  var iEl    = document.getElementById('gal-i');
  var soundBtn = document.getElementById('gal-sound');
  var idx = 0;
  var muted = true;

  // Images carry a real src and native loading="lazy"; only the heavy videos
  // are attached on demand.
  function hydrate(slide) {
    if (!slide) return;
    var vid = slide.querySelector('video[data-src]');
    if (vid) { vid.src = vid.dataset.src; vid.removeAttribute('data-src'); vid.load(); }
  }

  function show(next) {
    var count = slides.length;
    next = ((next % count) + count) % count;

    var prevSlide = slides[idx];
    var prevVid = prevSlide.querySelector('video');
    if (prevVid) prevVid.pause();
    prevSlide.classList.remove('is-active');

    idx = next;
    var cur = slides[idx];
    hydrate(cur);
    hydrate(slides[(idx + 1) % count]); // prefetch the one after
    cur.classList.add('is-active');

    var vid = cur.querySelector('video');
    if (vid) {
      vid.muted = muted;
      var p = vid.play();
      if (p && p.catch) p.catch(function () { /* autoplay blocked — poster stays */ });
      soundBtn.hidden = false;
    } else {
      soundBtn.hidden = true;
    }

    capEl.textContent = cur.dataset.caption || '';
    iEl.textContent = String(idx + 1);
  }

  stage.addEventListener('click', function (e) {
    if (e.target.closest('.gal-nav') || e.target.closest('.gal-sound')) return;
    show(idx + 1);
  });

  document.getElementById('gal-next').addEventListener('click', function () { show(idx + 1); });
  document.getElementById('gal-prev').addEventListener('click', function () { show(idx - 1); });

  soundBtn.addEventListener('click', function () {
    muted = !muted;
    soundBtn.textContent = muted ? '🔇' : '🔊';
    soundBtn.setAttribute('aria-label', muted ? 'Unmute video' : 'Mute video');
    var vid = slides[idx].querySelector('video');
    if (vid) vid.muted = muted;
  });

  stage.addEventListener('keydown', function (e) {
    if (e.key === 'ArrowRight' || e.key === 'Enter' || e.key === ' ') {
      e.preventDefault(); show(idx + 1);
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault(); show(idx - 1);
    }
  });

  // Swipe on touch devices.
  var x0 = null;
  stage.addEventListener('touchstart', function (e) { x0 = e.changedTouches[0].clientX; }, { passive: true });
  stage.addEventListener('touchend', function (e) {
    if (x0 === null) return;
    var dx = e.changedTouches[0].clientX - x0;
    if (Math.abs(dx) > 45) show(idx + (dx < 0 ? 1 : -1));
    x0 = null;
  }, { passive: true });

  hydrate(slides[1]); // warm the next slide up front

  /* ---------------- work clips: play only while on screen ---------------- */
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var clips = document.querySelectorAll('.frame video[data-src]');

  if (!('IntersectionObserver' in window) || reduce) {
    // Posters alone are a fine fallback.
    return;
  }

  var io = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      var v = entry.target;
      if (entry.isIntersecting) {
        if (v.dataset.src) { v.src = v.dataset.src; delete v.dataset.src; }
        var p = v.play();
        if (p && p.catch) p.catch(function () {});
      } else {
        v.pause();
      }
    });
  }, { rootMargin: '80px', threshold: 0.25 });

  clips.forEach(function (v) { io.observe(v); });
})();
