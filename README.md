# personal_site_v2

**Source for [shrishc.com](https://shrishc.com) — a scroll-driven personal site, hand-built with no framework.**

A static site: one HTML file, one stylesheet, one JavaScript file. No build step, no bundler, no dependencies. The interaction is scroll-linked video — the page's motion is driven by scroll position rather than autoplay, so the animation is something you move through rather than watch.

---

## Layout

```
index.html                    the page
style.css                     styles
main.js                       scroll-driven video behaviour
assets/
  website_horizontal.mp4      desktop background video
  website_vertical.mp4        mobile background video
  *_scrub.mp4                 scrub-optimized re-encodes
  resume.pdf
CNAME                         shrishc.com
robots.txt, sitemap.xml       indexing
```

**Why there are two encodes of each video.** Seeking to an arbitrary frame in normal H.264 means decoding forward from the previous keyframe, which by default can be seconds away — fine for playback, visibly stuttery when the frame is tied to scroll position. The `_scrub` variants are re-encoded with a short keyframe interval so any seek lands close to one. Separate horizontal and vertical cuts exist because letterboxing a 16:9 video into a portrait viewport wastes most of the screen.

The page ships `robots.txt`, `sitemap.xml`, and a description meta tag, since a personal site is only useful if it is findable.

## Running

```bash
python3 -m http.server 8000
```

No build step. Deployed as static hosting with the `CNAME` pointing at shrishc.com.
