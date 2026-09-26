/* ==========================================================================
   NextAvatar demo site — progressive enhancement.

   The page is complete without this file: every slide is already in the
   markup and the carousels page through hidden radios, so a browser with
   scripts disabled (the Anonymous GitHub mirror blocks them by default) still
   shows all cases and clips.  What this file adds on top:

     * the clips of the visible slide start together, so a comparison row reads
       as one synchronised take, and the green Play button replays the row;
     * hovering a clip resumes it, clicking it replays it;
     * the left/right arrow keys page the carousel under the pointer;
     * the nav highlights the section in view.

   Everything here is optional: if any of it fails, the static page stands.
   ========================================================================== */
(function () {
  "use strict";

  /* Tells the stylesheet that scripts run, which is what reveals the Play
     button (it would be a dead control otherwise). */
  document.documentElement.classList.add("js");

  /* ------------------------------------------------------------- helpers */

  function playVideo(video) {
    const p = video.play();
    if (p && p.catch) p.catch(function () {});
  }

  function pauseVideo(video) {
    if (!video.paused) video.pause();
  }

  /* A clip that reached its last frame is "finished": it keeps showing that
     frame until the viewer asks for another pass. */
  function isFinished(video) {
    if (video.ended) return true;
    return video.duration > 0 && video.currentTime >= video.duration - 0.05;
  }

  function replayVideo(video) {
    if (video.currentTime) {
      try { video.currentTime = 0; } catch (e) { /* not seekable yet */ }
    }
    playVideo(video);
  }

  /* Hover only ever *resumes* a clip that is still mid-pass — a finished clip
     is never restarted by the mouse. Clicking is the replay gesture. */
  function attachHoverPlay(video) {
    video.addEventListener("mouseenter", function () {
      if (!isFinished(video)) playVideo(video);
    });
    video.addEventListener("mouseleave", function () { pauseVideo(video); });
    video.addEventListener("click", function () {
      if (video.paused || isFinished(video)) replayVideo(video);
      else video.pause();
    });
  }

  /* ----------------------------------------------------------- carousel */

  /**
   * Enhance one radio-driven carousel.
   *
   * @param {Element} root  the .carousel element
   * @param {object} opts
   *   stripControls - drop the native control bars from the clips
   *   autoplay      - start the visible slide's clips together, so a comparison
   *                   row reads as one synchronised take
   *   hoverPlay     - let the pointer resume a clip that is still mid-pass
   */
  function initCarousel(root, opts) {
    const radios = Array.prototype.slice.call(root.querySelectorAll(".car-radio"));
    const slides = Array.prototype.slice.call(root.querySelectorAll(".car-slide"));
    if (!radios.length || radios.length !== slides.length) return;

    const clips = slides.map(function (slide) {
      const videos = Array.prototype.slice.call(slide.querySelectorAll("video"));
      if (opts.hoverPlay) videos.forEach(attachHoverPlay);
      if (opts.stripControls) {
        videos.forEach(function (v) { v.controls = false; });
      }
      return videos;
    });

    function index() {
      const i = radios.findIndex(function (r) { return r.checked; });
      return i < 0 ? 0 : i;
    }

    function show() {
      if (opts.autoplay) clips[index()].forEach(replayVideo);
    }

    function step(delta) {
      const i = (index() + delta + radios.length) % radios.length;
      radios[i].checked = true;
      show();
    }

    radios.forEach(function (r) { r.addEventListener("change", show); });

    slides.forEach(function (slide, i) {
      const play = slide.querySelector(".car-btn.play");
      if (play) {
        play.addEventListener("click", function () {
          clips[i].forEach(replayVideo);
        });
      }
    });

    /* Arrow keys when the carousel is hovered or holds focus. */
    let hot = false;
    root.addEventListener("pointerenter", function () { hot = true; });
    root.addEventListener("pointerleave", function () { hot = false; });
    document.addEventListener("keydown", function (e) {
      if (!hot || e.metaKey || e.ctrlKey || e.altKey) return;
      const tag = (e.target && e.target.tagName) || "";
      if (tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA") return;
      if (e.key === "ArrowLeft") { e.preventDefault(); step(-1); }
      else if (e.key === "ArrowRight") { e.preventDefault(); step(1); }
    });

    show();
  }

  /* ---------------------------------------------------------- nav state */

  function initNav() {
    const links = Array.prototype.slice.call(document.querySelectorAll("#navlinks a"));
    const sections = links
      .map(function (a) { return document.querySelector(a.getAttribute("href")); })
      .filter(Boolean);
    if (!sections.length || !("IntersectionObserver" in window)) return;

    const observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        links.forEach(function (a) {
          a.classList.toggle("active", a.getAttribute("href") === "#" + entry.target.id);
        });
      });
    }, { rootMargin: "-45% 0px -50% 0px" });

    sections.forEach(function (s) { observer.observe(s); });
  }

  /* -------------------------------------------------------------- boot */

  document.addEventListener("DOMContentLoaded", function () {
    initNav();

    /* The comparison grid drops the native control bars and starts the whole
       row together, so the seven methods read as one synchronised take. */
    const qual = document.getElementById("qual-carousel");
    if (qual) initCarousel(qual, { stripControls: true, autoplay: true, hoverPlay: true });

    /* The long sequences are watched one at a time rather than compared frame
       by frame, so they keep their control bars and never start on their own. */
    const more = document.getElementById("more-carousel");
    if (more) initCarousel(more, { stripControls: false, autoplay: false, hoverPlay: false });
  });
})();
