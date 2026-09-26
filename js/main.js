/* ==========================================================================
   NextAvatar demo site — rendering + interactions
   ========================================================================== */
(function () {
  "use strict";

  /* ------------------------------------------------------------- helpers */

  function el(tag, cls, text) {
    const node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text != null) node.textContent = text;
    return node;
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  function pad2(n) { return String(n).padStart(2, "0"); }

  /**
   * Build a <video> element that stays unloaded until it scrolls into view.
   * Clips run a single pass by default (`loop` is opt-in): once a clip reaches
   * its last frame it stays there, and replaying takes an explicit click.
   */
  function makeVideo(src, poster, opts) {
    const v = document.createElement("video");
    v.muted = true;
    v.loop = !!(opts && opts.loop);
    v.playsInline = true;
    v.preload = "none";
    if (poster) v.poster = poster;
    v.dataset.src = src;
    if (opts && opts.controls) v.controls = true;
    return v;
  }

  /* Lazily assign `src` the first time a video approaches the viewport, so a
     page holding many clips does not open every request on load. */
  const lazyObserver = "IntersectionObserver" in window
    ? new IntersectionObserver(function (entries, obs) {
        entries.forEach(function (entry) {
          if (!entry.isIntersecting) return;
          const v = entry.target;
          if (v.dataset.src && !v.src) v.src = v.dataset.src;
          obs.unobserve(v);
        });
      }, { rootMargin: "300px 0px" })
    : null;

  function ensureSrc(video) {
    if (!video.src && video.dataset.src) video.src = video.dataset.src;
  }

  function playVideo(video) {
    ensureSrc(video);
    const p = video.play();
    if (p && p.catch) p.catch(function () {});
  }

  function observeLazy(video) {
    if (lazyObserver) lazyObserver.observe(video);
    else ensureSrc(video);
  }

  function pauseVideo(video, reset) {
    if (!video.paused) video.pause();
    if (reset && video.currentTime) {
      try { video.currentTime = 0; } catch (e) { /* not seekable yet */ }
    }
  }

  /* A clip that reached its last frame is "finished": it keeps showing that
     frame until the viewer asks for another pass. */
  function isFinished(video) {
    if (video.ended) return true;
    return video.duration > 0 && video.currentTime >= video.duration - 0.05;
  }

  function replayVideo(video) {
    ensureSrc(video);
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

  /* ------------------------------------------------------------ carousel */

  /**
   * Slide-based carousel that renders only the active slide, so a set of 30
   * cases never keeps 200+ <video> elements alive at once.
   *
   * @param {object} opts
   *   host      - container element
   *   count     - number of slides
   *   render    - (index, stage, controls) => void, builds the slide body;
   *               `controls` carries the prev/next arrows, the counter and the
   *               optional play button, and must be placed into the slide's own
   *               header row
   *   onChange  - optional (index) => void
   *   onPlayAll - optional () => void; adds a green play button to `controls`
   *   playTitle - optional tooltip for that button
   *
   * Slides only change on an explicit user action (arrows or left/right
   * keys): nothing ever advances on a timer.
   */
  function createCarousel(opts) {
    const host = opts.host;
    const count = opts.count;
    let index = 0;

    host.innerHTML = "";

    const root = el("div", "carousel");

    /* The arrows, counter and play button all travel with the slide, so each
       section can drop them into its own header row. */
    const controls = el("div", "car-controls");

    const prev = el("button", "car-btn", "\u2039");
    const counter = el("span", "car-counter");
    const next = el("button", "car-btn", "\u203a");
    prev.type = "button";
    next.type = "button";
    prev.title = "Previous (left arrow)";
    next.title = "Next (right arrow)";
    controls.appendChild(prev);
    controls.appendChild(counter);
    controls.appendChild(next);

    /* One green button restarts the current slide's clips together, so the
       comparison stays frame-synchronised. */
    if (opts.onPlayAll) {
      const play = el("button", "car-btn play", "\u25b6 Play");
      play.type = "button";
      play.title = opts.playTitle || "Play from the start";
      play.addEventListener("click", function () { opts.onPlayAll(); });
      controls.appendChild(play);
    }

    /* -------------------------------------------------------------- stage */
    const stage = el("div", "car-stage");
    root.appendChild(stage);
    host.appendChild(root);

    /* ------------------------------------------------------------ helpers */
    function renderSlide() {
      stage.innerHTML = "";
      const inner = el("div", "car-fade");
      opts.render(index, inner, controls);
      stage.appendChild(inner);
      counter.textContent = pad2(index + 1) + " / " + pad2(count);
      if (opts.onChange) opts.onChange(index);
    }

    function go(i) {
      index = (i + count) % count;
      renderSlide();
    }

    prev.addEventListener("click", function () { go(index - 1); });
    next.addEventListener("click", function () { go(index + 1); });

    /* Arrow keys when the carousel is hovered or holds focus. */
    let hot = false;
    root.addEventListener("pointerenter", function () { hot = true; });
    root.addEventListener("pointerleave", function () { hot = false; });
    document.addEventListener("keydown", function (e) {
      if (!hot || e.metaKey || e.ctrlKey || e.altKey) return;
      const tag = (e.target && e.target.tagName) || "";
      if (tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA") return;
      if (e.key === "ArrowLeft") { e.preventDefault(); go(index - 1); }
      else if (e.key === "ArrowRight") { e.preventDefault(); go(index + 1); }
    });

    renderSlide();

    return { go: go, root: root };
  }

  /* ------------------------------------------------ qualitative carousel */

  function renderQualitative(data) {
    const host = document.getElementById("qual-carousel");
    if (!host || !data) return;

    const groups = data.groups;
    /* Videos of the slide currently on screen, so the header's play button can
       restart the whole row at once. */
    let current = [];

    createCarousel({
      host: host,
      count: groups.length,
      playTitle: "Play all clips in this case from the start",
      onPlayAll: function () { current.forEach(replayVideo); },
      render: function (i, stage, controls) {
        const g = groups[i];

        /* -- badge row (controls aligned with it) above the instruction -- */
        const head = el("div", "case-head");
        const top = el("div", "case-head-top");
        top.appendChild(el("div", "case-idx", "CASE " + pad2(i + 1)));
        top.appendChild(controls);
        head.appendChild(top);

        const cAct = el("div", "chip");
        cAct.innerHTML = "<b>Action</b>" + escapeHtml(g.action);
        head.appendChild(cAct);
        stage.appendChild(head);

        /* -- reference first, then the seven methods: two rows of four -- */
        const grid = el("div", "clip-grid");
        const videos = [];

        const refBox = el("div", "clip ref");
        const refImg = el("img");
        refImg.src = g.ref;
        refImg.alt = "reference image";
        refImg.loading = "lazy";
        refBox.appendChild(refImg);
        refBox.appendChild(el("div", "clip-label", "Reference"));
        grid.appendChild(refBox);

        g.clips.forEach(function (clip) {
          const box = el("div", "clip" + (clip.kind === "ours" ? " ours" : ""));
          const v = makeVideo(clip.src, clip.poster);
          observeLazy(v);
          attachHoverPlay(v);
          videos.push(v);
          box.appendChild(v);
          box.appendChild(el("div", "clip-label", clip.label));
          grid.appendChild(box);
        });
        stage.appendChild(grid);

        /* Start the whole row once, so the comparison reads as a synchronized
           side-by-side. Each clip plays a single pass and holds its last
           frame; clicking a clip replays it, and the header's green button
           replays the entire row together. */
        current = videos;
        videos.forEach(function (v) { playVideo(v); });
      },
    });
  }

  /* ------------------------------------------------- more-results carousel */

  function renderMore(data) {
    const host = document.getElementById("more-carousel");
    if (!host || !data) return;

    const videos = data.videos;
    /* The single clip of the slide on screen, so the header's play button can
       restart it from the first frame. */
    let current = null;

    createCarousel({
      host: host,
      count: videos.length,
      playTitle: "Play this sequence from the start",
      onPlayAll: function () { if (current) replayVideo(current); },
      render: function (i, stage, controls) {
        const item = videos[i];

        const head = el("div", "sequence-head");
        head.appendChild(el("div", "num", pad2(i + 1)));
        head.appendChild(el("div", "title", item.prompts.length + " sequential expression\u2013action instructions"));
        head.appendChild(el("div", "meta", item.prompts.length + " prompts \u00b7 24 fps"));
        head.appendChild(controls);
        stage.appendChild(head);

        const body = el("div", "sequence-body");

        /* -- left: the ordered instruction list (01..04) -- */
        const panel = el("div", "prompt-panel");
        const panelHead = el("div", "prompt-panel-head");
        panelHead.appendChild(el("span", null, "Prompts"));
        panelHead.appendChild(el("span", "spacer", "01 \u2013 " + pad2(item.prompts.length)));
        panel.appendChild(panelHead);

        const list = el("div", "prompt-list");
        item.prompts.forEach(function (p) {
          const row = el("div", "prompt-item");
          const inner = el("div", "row");
          inner.appendChild(el("div", "pnum", pad2(p.index)));

          const sum = el("div", "sum");
          const aLine = el("div", "act");
          aLine.innerHTML = '<span class="lab">Action</span>' + escapeHtml(p.action);
          sum.appendChild(aLine);

          inner.appendChild(sum);
          row.appendChild(inner);
          list.appendChild(row);
        });
        panel.appendChild(list);
        body.appendChild(panel);

        /* -- right: reference image and video, matched frame size -- */
        const media = el("div", "media-col");

        const refBox = el("div", "seq-ref");
        const refImg = el("img");
        refImg.src = item.ref;
        refImg.alt = "reference image";
        refImg.loading = "lazy";
        refBox.appendChild(refImg);
        refBox.appendChild(el("div", "cap", "Reference"));
        media.appendChild(refBox);

        const videoBox = el("div", "seq-video");
        /* Single pass, no loop: the native control bar or the header's play
           button restarts it. */
        const v = makeVideo(item.src, item.poster, { controls: true });
        v.preload = "metadata";
        v.src = item.src;
        current = v;
        videoBox.appendChild(v);
        videoBox.appendChild(el("div", "cap", "Generated sequence"));
        media.appendChild(videoBox);

        body.appendChild(media);
        stage.appendChild(body);
      },
    });
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
    /* The payloads arrive as globals from data/*.js, not via fetch(): the
       Anonymous GitHub mirror sandboxes the page without allow-same-origin,
       which turns any fetch() into a blocked cross-origin request. */
    renderQualitative(window.NEXTAVATAR_QUALITATIVE);
    renderMore(window.NEXTAVATAR_MORE);
  });
})();
