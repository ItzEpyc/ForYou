(function () {
  "use strict";

  const body = document.body;
  const intro = document.getElementById("intro");
  const openBtn = document.getElementById("openBtn");
  const scene = document.getElementById("scene");
  const track = document.getElementById("track");
  const progress = document.getElementById("progress");
  const fill = document.querySelector("[data-progress]");
  const timeLabel = document.querySelector("[data-time]");
  const toggles = document.querySelectorAll("[data-toggle]");
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

  const lyricsViewport = document.getElementById("lyricsViewport");
  const lyricsTrack = document.getElementById("lyricsTrack");
  const lyricNodes = Array.prototype.slice.call(
    document.querySelectorAll(".lyric")
  );

  const postcard = document.getElementById("postcard");
  const note = document.getElementById("note");
  const noteClose = document.getElementById("noteClose");

  const FALLBACK_DURATION = 165.564;
  const TARGET_VOLUME = 0.82;
  const LYRIC_LEAD = 0.12;
  const NEAR_RANGE = 2;

  let fadeFrame = null;
  let dragging = false;

  /* ---------- Состояние текста ---------- */

  const lyrics = lyricNodes.map(function (el) {
    return {
      el: el,
      time: parseFloat(el.getAttribute("data-time")) || 0
    };
  });

  let activeIndex = -1;
  let lastFocus = null;

  function markActive(index) {
    activeIndex = index;

    lyrics.forEach(function (item, i) {
      item.el.classList.toggle("is-active", i === index);
      item.el.classList.toggle("is-near", Math.abs(i - index) <= NEAR_RANGE);
    });

    centerActive();
  }

  function centerActive() {
    if (!lyricsViewport || !lyricsTrack || activeIndex < 0) return;

    const viewportHeight = lyricsViewport.clientHeight;
    if (!viewportHeight) return;

    const line = lyrics[activeIndex].el;
    const lineCenter = line.offsetTop + line.offsetHeight / 2;
    const offset = lineCenter - viewportHeight / 2;

    lyricsTrack.style.transform = "translate3d(0, " + -offset.toFixed(1) + "px, 0)";
  }

  function syncLyrics(currentTime) {
    const time = (Number(currentTime) || 0) + LYRIC_LEAD;
    let index = 0;

    for (let i = 0; i < lyrics.length; i += 1) {
      if (lyrics[i].time <= time) index = i;
      else break;
    }

    if (index !== activeIndex) markActive(index);
  }

  /* ---------- Открытие ---------- */

  function openLetter() {
    if (body.classList.contains("is-open")) return;

    intro.classList.add("is-launch");
    body.classList.add("is-open");

    startAudio();

    window.setTimeout(function () {
      scene.removeAttribute("inert");
      intro.setAttribute("inert", "");
      syncLyrics(track ? track.currentTime : 0);
    }, 850);
  }

  if (openBtn) openBtn.addEventListener("click", openLetter);

  /* ---------- Звук ---------- */

  function fadeVolume(target, duration) {
    if (!track) return;
    if (fadeFrame) cancelAnimationFrame(fadeFrame);

    const from = track.volume;
    const started = performance.now();

    function step(now) {
      const p = Math.min((now - started) / duration, 1);
      const eased = 1 - Math.pow(1 - p, 3);
      track.volume = Math.min(1, Math.max(0, from + (target - from) * eased));
      if (p < 1) fadeFrame = requestAnimationFrame(step);
    }

    fadeFrame = requestAnimationFrame(step);
  }

  function startAudio() {
    if (!track) return;
    track.volume = 0;

    const started = track.play();
    if (started && typeof started.catch === "function") {
      started.catch(function () {
        track.volume = TARGET_VOLUME;
      });
    }

    fadeVolume(TARGET_VOLUME, 2600);
  }

  function togglePlayback() {
    if (!track) return;

    if (track.paused) {
      if (track.volume < 0.05) track.volume = TARGET_VOLUME;
      const started = track.play();
      if (started && typeof started.catch === "function") started.catch(function () {});
    } else {
      track.pause();
    }
  }

  toggles.forEach(function (btn) {
    btn.addEventListener("click", togglePlayback);
  });

  function syncToggleLabels() {
    if (!track) return;
    const paused = track.paused;
    toggles.forEach(function (btn) {
      btn.setAttribute("aria-label", paused ? "Воспроизвести" : "Пауза");
      btn.title = paused ? "Воспроизвести" : "Пауза";
    });
  }

  let lyricFrame = null;

  function lyricLoop() {
    if (!track) return;
    syncLyrics(track.currentTime);
    lyricFrame = requestAnimationFrame(lyricLoop);
  }

  function startLyricLoop() {
    if (lyricFrame) return;
    lyricFrame = requestAnimationFrame(lyricLoop);
  }

  function stopLyricLoop() {
    if (!lyricFrame) return;
    cancelAnimationFrame(lyricFrame);
    lyricFrame = null;
  }

  if (track) {
    track.addEventListener("play", function () {
      body.classList.add("is-playing");
      syncToggleLabels();
      startLyricLoop();
    });

    track.addEventListener("pause", function () {
      body.classList.remove("is-playing");
      syncToggleLabels();
      stopLyricLoop();
      syncLyrics(track.currentTime);
    });

    track.addEventListener("ended", function () {
      body.classList.remove("is-playing");
      stopLyricLoop();
      syncLyrics(track.duration || FALLBACK_DURATION);
      updateProgress(track.duration || FALLBACK_DURATION);
      syncToggleLabels();
    });

    track.addEventListener("timeupdate", function () {
      updateProgress(track.currentTime);
      if (track.paused) syncLyrics(track.currentTime);
    });

    track.addEventListener("seeked", function () {
      syncLyrics(track.currentTime);
    });

    track.addEventListener("loadedmetadata", function () {
      if (fill) fill.style.width = "0%";
      updateProgress(0);
      if (progress) {
        progress.setAttribute("aria-valuemax", String(Math.round(track.duration || FALLBACK_DURATION)));
      }
    });

    track.addEventListener("canplay", syncToggleLabels);
  }

  /* ---------- Время и перемотка ---------- */

  function formatTime(value) {
    if (!Number.isFinite(value) || value < 0) value = 0;
    const total = Math.floor(value + 0.0001);
    const minutes = Math.floor(total / 60);
    const seconds = total % 60;
    return minutes + ":" + (seconds < 10 ? "0" : "") + seconds;
  }

  function duration() {
    if (track && Number.isFinite(track.duration) && track.duration > 0) return track.duration;
    return FALLBACK_DURATION;
  }

  function updateProgress(currentTime) {
    const total = duration();
    const current = Math.min(Number(currentTime) || 0, total);
    const ratio = total > 0 ? current / total : 0;

    if (fill) fill.style.width = (ratio * 100).toFixed(3) + "%";
    if (timeLabel) timeLabel.textContent = formatTime(current) + " / " + formatTime(total);

    if (progress) {
      progress.setAttribute("aria-valuenow", String(Math.round(current)));
      progress.setAttribute("aria-valuemax", String(Math.round(total)));
      progress.setAttribute("aria-valuetext", formatTime(current) + " из " + formatTime(total));
    }
  }

  function seekToRatio(ratio) {
    if (!track) return;
    const clamped = Math.min(1, Math.max(0, ratio));
    const total = duration();
    try {
      track.currentTime = clamped * total;
      updateProgress(track.currentTime);
      syncLyrics(track.currentTime);
    } catch (error) {
      /* Метаданные ещё не готовы — пропускаем. */
    }
  }

  function seekFromPointer(event) {
    if (!progress) return;
    const rect = progress.getBoundingClientRect();
    if (!rect.width) return;
    seekToRatio((event.clientX - rect.left) / rect.width);
  }

  if (progress) {
    progress.addEventListener("pointerdown", function (event) {
      dragging = true;
      if (progress.setPointerCapture) {
        try { progress.setPointerCapture(event.pointerId); } catch (error) {}
      }
      seekFromPointer(event);
    });

    progress.addEventListener("pointermove", function (event) {
      if (dragging) seekFromPointer(event);
    });

    function stopDragging(event) {
      dragging = false;
      if (progress.releasePointerCapture) {
        try { progress.releasePointerCapture(event.pointerId); } catch (error) {}
      }
    }

    progress.addEventListener("pointerup", stopDragging);
    progress.addEventListener("pointercancel", stopDragging);

    progress.addEventListener("keydown", function (event) {
      const step = 5;
      const now = track ? track.currentTime : 0;
      if (event.key === "ArrowRight" || event.key === "ArrowUp") {
        event.preventDefault();
        seekToRatio((now + step) / duration());
      } else if (event.key === "ArrowLeft" || event.key === "ArrowDown") {
        event.preventDefault();
        seekToRatio((now - step) / duration());
      } else if (event.key === "Home") {
        event.preventDefault();
        seekToRatio(0);
      } else if (event.key === "End") {
        event.preventDefault();
        seekToRatio(1);
      }
    });
  }

  /* ---------- Открытка и признание ---------- */

  function openNote() {
    if (body.classList.contains("is-note")) return;

    lastFocus = document.activeElement;
    body.classList.add("is-note");

    if (postcard) postcard.setAttribute("aria-expanded", "true");
    if (note) {
      note.removeAttribute("inert");
      note.setAttribute("aria-hidden", "false");
    }

    window.requestAnimationFrame(function () {
      window.requestAnimationFrame(function () {
        if (noteClose) noteClose.focus({ preventScroll: true });
      });
    });
  }

  function closeNote(options) {
    if (!body.classList.contains("is-note")) return;

    body.classList.remove("is-note");

    if (postcard) postcard.setAttribute("aria-expanded", "false");

    // Сначала уводим фокус из письма, потом прячем его от скринридеров.
    const restore = !options || options.restoreFocus !== false;
    const target = lastFocus && document.contains(lastFocus) ? lastFocus : postcard;

    if (restore && target && target.focus) {
      target.focus({ preventScroll: true });
    }

    if (note) {
      note.setAttribute("inert", "");
      note.setAttribute("aria-hidden", "true");
    }

    window.requestAnimationFrame(function () {
      activeIndex = -1;
      syncLyrics(track ? track.currentTime : 0);

      if (restore && target && target.focus && document.activeElement !== target) {
        window.requestAnimationFrame(function () {
          target.focus({ preventScroll: true });
        });
      }
    });
  }

  if (postcard) {
    postcard.addEventListener("click", function () {
      openNote();
    });
  }

  if (noteClose) {
    noteClose.addEventListener("click", function () {
      closeNote();
    });
  }

  document.addEventListener("keydown", function (event) {
    if (event.key !== "Escape" && event.key !== "Esc") return;
    if (body.classList.contains("is-note")) {
      event.preventDefault();
      closeNote();
    }
  });

  /* ---------- Пересчёт при изменении размера ---------- */

  let resizeTimer = null;

  window.addEventListener("resize", function () {
    if (resizeTimer) clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function () {
      centerActive();
    }, 140);
  });

  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(function () {
      centerActive();
    });
  }

  /* ---------- Media Session ---------- */

  if ("mediaSession" in navigator && track) {
    try {
      navigator.mediaSession.metadata = new window.MediaMetadata({
        title: "Одной из",
        artist: "тёмный принц",
        album: "Одной из"
      });

      navigator.mediaSession.setActionHandler("play", function () {
        togglePlayback();
      });
      navigator.mediaSession.setActionHandler("pause", function () {
        togglePlayback();
      });
      navigator.mediaSession.setActionHandler("previoustrack", function () {
        seekToRatio(0);
      });
      navigator.mediaSession.setActionHandler("seekbackward", function () {
        seekToRatio((track.currentTime - 10) / duration());
      });
      navigator.mediaSession.setActionHandler("seekforward", function () {
        seekToRatio((track.currentTime + 10) / duration());
      });
    } catch (error) {
      /* Media Session не критичен. */
    }
  }

  /* ---------- Пылинки в воздухе ---------- */

  (function motes() {
    const canvas = document.getElementById("motes");
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let width = 0;
    let height = 0;
    let dots = [];
    let frame = null;
    let running = false;

    function build() {
      const count = Math.max(12, Math.min(30, Math.round(width / 52)));
      dots = [];

      for (let i = 0; i < count; i += 1) {
        dots.push({
          x: Math.random() * width,
          y: Math.random() * height,
          radius: 0.6 + Math.random() * 1.7,
          speed: 0.08 + Math.random() * 0.22,
          phase: Math.random() * Math.PI * 2,
          sway: 0.15 + Math.random() * 0.35,
          alpha: 0.1 + Math.random() * 0.3,
          warm: Math.random() > 0.45
        });
      }
    }

    function resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      canvas.style.width = width + "px";
      canvas.style.height = height + "px";
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      build();
    }

    function draw(now) {
      ctx.clearRect(0, 0, width, height);

      for (let i = 0; i < dots.length; i += 1) {
        const dot = dots[i];
        dot.y -= dot.speed;
        dot.x += Math.sin(now * 0.00035 + dot.phase) * dot.sway * 0.14;

        if (dot.y < -8) {
          dot.y = height + 8;
          dot.x = Math.random() * width;
        }
        if (dot.x < -8) dot.x = width + 8;
        if (dot.x > width + 8) dot.x = -8;

        ctx.beginPath();
        ctx.arc(dot.x, dot.y, dot.radius, 0, Math.PI * 2);
        ctx.fillStyle = dot.warm
          ? "rgba(217, 154, 166, " + dot.alpha + ")"
          : "rgba(243, 235, 229, " + dot.alpha * 0.7 + ")";
        ctx.fill();
      }

      frame = requestAnimationFrame(draw);
    }

    function start() {
      if (running || reduceMotion.matches) return;
      running = true;
      frame = requestAnimationFrame(draw);
    }

    function stop() {
      running = false;
      if (frame) cancelAnimationFrame(frame);
      frame = null;
    }

    resize();
    start();

    let motesTimer = null;
    window.addEventListener("resize", function () {
      if (motesTimer) clearTimeout(motesTimer);
      motesTimer = setTimeout(function () {
        resize();
        centerActive();
      }, 160);
    });

    document.addEventListener("visibilitychange", function () {
      if (document.hidden) {
        stop();
      } else {
        start();
      }
    });

    if (reduceMotion.addEventListener) {
      reduceMotion.addEventListener("change", function (event) {
        if (event.matches) {
          stop();
          ctx.clearRect(0, 0, width, height);
        } else {
          start();
        }
      });
    }
  })();

  /* ---------- Стартовое состояние ---------- */

  syncLyrics(0);
})();
