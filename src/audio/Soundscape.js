/**
 * Background Soundscape Controller (Native HTMLAudioElement version)
 *
 * Why this replaced the YouTube iframe:
 *  - Mobile browsers (iOS Safari / Android Chrome) refuse to play embedded
 *    YouTube audio that is not started from a direct tap on the iframe itself,
 *    and the IFrame API cannot be unlocked reliably from page gestures.
 *  - A native HTMLAudioElement can be unlocked by the visitor's first real
 *    gesture anywhere on the page and then plays reliably for the entire session.
 *
 * Autoplay Strategy:
 *  1. On load, attempt audio.play() with sound unmuted.
 *  2. If blocked by browser policy, fall back to audio.play() with audio.muted = true
 *     (muted autoplay is always permitted by modern browsers).
 *  3. Display a subtle "♪ Tap anywhere for music" hint while unmuted autoplay is blocked.
 *  4. Listen for the first real user gesture (pointerup, touchend, click, keydown) on window.
 *  5. On first gesture, unmute and call audio.play(), then fade in to volume 0.5 over 1.5s.
 *  6. Clean up gesture listeners once audio becomes audible.
 *  7. Ignore gestures originating from #audio-toggle-btn to prevent double-toggling.
 *  8. If the visitor taps the toggle button to mute, remember that choice and never auto-start again.
 *
 * Lifecycle:
 *  - Pauses audio when tab/app is hidden (visibilitychange) and resumes only if previously playing.
 *  - Listens to audio 'pause' event to update button UI if an external interruption occurs
 *    (e.g., incoming phone call, headphones unplugged).
 *
 * Public API preserved for src/main.js:
 *  - init(), start(), stop(), toggle(), isPlaying
 *  - Keeps #audio-toggle-btn (.playing class, aria-pressed) and #audio-btn-label ('Mute' / 'Music') in sync.
 */

const AUDIO_SRC = `${import.meta.env.BASE_URL || './'}audio/leja.mp3`;
const TARGET_VOLUME = 0.5;
const FADE_MS = 1500;

// Browsers strictly require user activation for unmuted audio:
// pointerup, touchend, click, keydown count as activation.
// (touchstart, scroll, mousemove do NOT unlock audio on iOS and Chrome).
const GESTURE_EVENTS = ['pointerup', 'touchend', 'click', 'keydown'];

export class Soundscape {
  constructor() {
    this.isPlaying = false;          // True only when music is audibly playing
    this.audio = null;
    this.userPaused = false;         // Visitor explicitly clicked mute
    this.wasPlayingBeforeHide = false;
    this.fadeRaf = null;
    this.hintEl = null;
    this.gestureHandler = null;
    this.initDone = false;

    this.init();
  }

  init() {
    if (this.initDone) return;
    this.initDone = true;

    this.createAudio();
    this.createHint();
    this.bindEvents();
    this.tryAutoplay();
  }

  /* ---------- Audio & Hint DOM Setup ---------- */

  createAudio() {
    const audio = new Audio();
    audio.src = AUDIO_SRC;
    audio.loop = true;
    audio.preload = 'auto';
    audio.setAttribute('playsinline', '');
    audio.setAttribute('webkit-playsinline', '');
    audio.setAttribute('aria-hidden', 'true');
    try {
      audio.volume = 0;
    } catch (e) {}
    this.audio = audio;
  }

  createHint() {
    let hint = document.querySelector('.music-hint');
    if (!hint) {
      hint = document.createElement('div');
      hint.className = 'music-hint';
      hint.setAttribute('role', 'status');
      hint.setAttribute('aria-live', 'polite');
      hint.textContent = '♪ Tap anywhere for music';
      document.body.appendChild(hint);
    }
    this.hintEl = hint;
  }

  showHint(show) {
    if (!this.hintEl) return;
    this.hintEl.classList.toggle('show', !!show);
  }

  /* ---------- Autoplay Strategy ---------- */

  async tryAutoplay() {
    // a. On load, try audio.play() with sound
    try {
      this.audio.muted = false;
      try {
        this.audio.volume = 0;
      } catch (e) {}
      await this.audio.play();
      this.onAudible();
      return;
    } catch (err) {
      // Autoplay with sound blocked by browser policy (expected on mobile)
    }

    // b. Fall back to muted autoplay (always permitted by modern browsers)
    try {
      this.audio.muted = true;
      await this.audio.play();
    } catch (err) {
      // Muted autoplay blocked (e.g. Low Power Mode); first user gesture will start it
    }

    this.isPlaying = false;
    this.updateButtonUI();
    if (!this.userPaused) {
      this.showHint(true);
    }
  }

  onAudible() {
    this.isPlaying = true;
    this.showHint(false);
    this.cleanupGesture();
    this.updateButtonUI();
    this.fadeTo(TARGET_VOLUME, FADE_MS);
  }

  /* ---------- Public Controls ---------- */

  start() {
    this.userPaused = false;
    this.audio.muted = false;
    try {
      this.audio.volume = 0;
    } catch (e) {}

    const done = () => this.onAudible();

    try {
      const p = this.audio.play();
      if (p && typeof p.then === 'function') {
        p.then(done).catch((err) => {
          console.warn('Playback could not start yet:', err);
          this.isPlaying = false;
          this.updateButtonUI();
        });
      } else {
        done();
      }
    } catch (err) {
      console.warn('Playback call failed:', err);
      this.isPlaying = false;
      this.updateButtonUI();
    }
  }

  stop() {
    this.cancelFade();
    this.isPlaying = false;
    if (this.audio) {
      this.audio.pause();
    }
    this.updateButtonUI();
  }

  toggle() {
    if (this.isPlaying) {
      this.userPaused = true;
      this.stop();
      this.showHint(false);
      this.cleanupGesture();
      return false;
    }
    this.start();
    return true;
  }

  /* ---------- Volume Fade via requestAnimationFrame ---------- */

  cancelFade() {
    if (this.fadeRaf) {
      cancelAnimationFrame(this.fadeRaf);
      this.fadeRaf = null;
    }
  }

  fadeTo(target, ms) {
    this.cancelFade();
    if (!this.audio) return;

    let from = 0;
    try {
      from = typeof this.audio.volume === 'number' ? this.audio.volume : 0;
    } catch (e) {
      from = 0;
    }

    const t0 = performance.now();
    const step = (now) => {
      const k = Math.min(1, (now - t0) / ms);
      try {
        this.audio.volume = from + (target - from) * k;
      } catch (e) {}
      if (k < 1) {
        this.fadeRaf = requestAnimationFrame(step);
      } else {
        this.fadeRaf = null;
      }
    };
    this.fadeRaf = requestAnimationFrame(step);
  }

  /* ---------- UI Button Synchronization ---------- */

  updateButtonUI() {
    const btn = document.getElementById('audio-toggle-btn');
    const label = document.getElementById('audio-btn-label');
    if (!btn) return;

    btn.classList.toggle('playing', this.isPlaying);
    btn.setAttribute('aria-pressed', String(this.isPlaying));
    if (label) {
      label.textContent = this.isPlaying ? 'Mute' : 'Music';
    }
  }

  /* ---------- Event Bindings & Lifecycle ---------- */

  bindEvents() {
    // c, d, e: First real user gesture on window (pointerup, touchend, click, keydown)
    this.gestureHandler = (e) => {
      // Ignore gestures originating from the toggle button to avoid double toggle
      if (e.target && e.target.closest && e.target.closest('#audio-toggle-btn')) {
        return;
      }
      // If visitor explicitly muted or music is already playing, do nothing
      if (this.userPaused || this.isPlaying) {
        return;
      }
      this.start();
    };

    GESTURE_EVENTS.forEach((evt) => {
      window.addEventListener(evt, this.gestureHandler, { passive: true });
    });

    // 5. Lifecycle: Tab/App visibility change
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        if (this.isPlaying) {
          this.wasPlayingBeforeHide = true;
          this.cancelFade();
          this.audio.pause();
        }
      } else if (this.wasPlayingBeforeHide) {
        this.wasPlayingBeforeHide = false;
        try {
          const p = this.audio.play();
          if (p && typeof p.then === 'function') {
            p.then(() => {
              this.isPlaying = true;
              this.updateButtonUI();
            }).catch((err) => {
              console.warn('Resume on visibility error caught:', err);
              this.isPlaying = false;
              this.updateButtonUI();
            });
          } else {
            this.isPlaying = true;
            this.updateButtonUI();
          }
        } catch (e) {
          this.isPlaying = false;
          this.updateButtonUI();
        }
      }
    });

    // 5. Lifecycle: External pause (phone call, headphones unplugged)
    this.audio.addEventListener('pause', () => {
      if (!document.hidden && this.isPlaying && !this.audio.ended) {
        this.isPlaying = false;
        this.updateButtonUI();
      }
    });

    // Handle seamless track looping safeguard
    this.audio.addEventListener('ended', () => {
      if (this.audio.loop) {
        this.audio.currentTime = 0;
        this.audio.play().catch(() => {});
      }
    });
  }

  cleanupGesture() {
    if (!this.gestureHandler) return;
    GESTURE_EVENTS.forEach((evt) => {
      window.removeEventListener(evt, this.gestureHandler);
    });
    this.gestureHandler = null;
  }
}
