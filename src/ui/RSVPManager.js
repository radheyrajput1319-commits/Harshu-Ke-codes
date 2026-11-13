import confetti from 'canvas-confetti';
import { weddingConfig } from '../config/weddingConfig.js';

/**
 * Safely escapes HTML special characters to prevent Cross-Site Scripting (XSS).
 */
function escapeHTML(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * RSVP and Live Countdown Manager
 * Handles guest blessings, local persistence, confetti burst, and live countdown timer.
 */
export class RSVPManager {
  constructor() {
    this.countdownDays = document.getElementById('cd-days');
    this.countdownHours = document.getElementById('cd-hours');
    this.countdownMinutes = document.getElementById('cd-minutes');
    this.countdownSeconds = document.getElementById('cd-seconds');
    this.form = document.getElementById('rsvp-form');
    this.statusContainer = document.getElementById('rsvp-status');
    this.blessingsList = document.getElementById('blessings-stream');

    this.initCountdown();
    this.initRSVPForm();
    this.renderStoredBlessings();
  }

  initCountdown() {
    const targetDate = new Date(weddingConfig.targetDateISO).getTime();

    const updateTimer = () => {
      const now = new Date().getTime();
      const diff = targetDate - now;

      if (diff <= 0) {
        if (this.countdownDays) this.countdownDays.textContent = '00';
        if (this.countdownHours) this.countdownHours.textContent = '00';
        if (this.countdownMinutes) this.countdownMinutes.textContent = '00';
        if (this.countdownSeconds) this.countdownSeconds.textContent = '00';
        return;
      }

      const days = Math.floor(diff / (1000 * 60 * 60 * 24));
      const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((diff % (1000 * 60)) / 1000);

      if (this.countdownDays) this.countdownDays.textContent = String(days).padStart(2, '0');
      if (this.countdownHours) this.countdownHours.textContent = String(hours).padStart(2, '0');
      if (this.countdownMinutes) this.countdownMinutes.textContent = String(minutes).padStart(2, '0');
      if (this.countdownSeconds) this.countdownSeconds.textContent = String(seconds).padStart(2, '0');
    };

    updateTimer();
    setInterval(updateTimer, 1000);
  }

  initRSVPForm() {
    if (!this.form) return;

    this.form.addEventListener('submit', async (e) => {
      e.preventDefault();

      // 1. Anti-spam honeypot check: reject if filled
      const honeypot = document.getElementById('rsvp-website')?.value || '';
      if (honeypot.trim() !== '') {
        return; // Silently drop bot submissions
      }

      // 2. Client-side rate limit: 30s cooldown between submissions from the same browser
      const RATE_LIMIT_SECONDS = 30;
      const lastSubmit = parseInt(localStorage.getItem('wedding_rsvp_last_submit') || '0', 10);
      const now = Date.now();
      if (now - lastSubmit < RATE_LIMIT_SECONDS * 1000) {
        const remaining = Math.ceil((RATE_LIMIT_SECONDS * 1000 - (now - lastSubmit)) / 1000);
        if (this.statusContainer) {
          this.statusContainer.innerHTML = `
            <div class="rsvp-error-card">
              <p>Please wait <strong>${remaining} seconds</strong> before submitting another RSVP.</p>
            </div>
          `;
          this.statusContainer.classList.add('visible');
        }
        return;
      }

      // 3. Form input extraction
      const name = document.getElementById('rsvp-name').value.trim();
      const attendance = document.querySelector('input[name="attendance"]:checked')?.value || 'Attending';
      const guests = document.getElementById('rsvp-guests')?.value || '1';
      const message = document.getElementById('rsvp-message').value.trim();

      if (!name) return;

      const submitBtn = this.form.querySelector('.btn-submit-rsvp') || this.form.querySelector('button[type="submit"]');
      const originalBtnText = submitBtn ? submitBtn.textContent : 'Send RSVP & Blessings';

      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = 'Sending...';
      }

      // Clear any previous status
      if (this.statusContainer) {
        this.statusContainer.innerHTML = '';
        this.statusContainer.classList.remove('visible');
      }

      const endpoint = import.meta.env.VITE_RSVP_ENDPOINT;

      try {
        if (!endpoint || endpoint.includes('YOUR_APPS_SCRIPT_DEPLOYMENT_ID')) {
          throw new Error('RSVP endpoint is not configured. Please set VITE_RSVP_ENDPOINT in your environment.');
        }

        // POST with text/plain to avoid CORS preflight OPTIONS that Apps Script cannot answer
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'text/plain;charset=utf-8'
          },
          body: JSON.stringify({
            name,
            attendance,
            guests,
            message,
            website: honeypot
          })
        });

        if (!response.ok) {
          throw new Error(`Server returned status ${response.status}`);
        }

        const result = await response.json();
        if (!result || !result.ok) {
          throw new Error(result?.error || 'Unable to record your RSVP');
        }

        // Success: update rate limit timestamp
        localStorage.setItem('wedding_rsvp_last_submit', Date.now().toString());

        const blessing = {
          name,
          attendance,
          guests,
          message: message || "Wishing you both a lifetime of love and joy!",
          timestamp: new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
        };

        // Store in LocalStorage so the Blessings Wall still shows the guest's own blessing
        const saved = JSON.parse(localStorage.getItem('wedding_blessings') || '[]');
        saved.unshift(blessing);
        localStorage.setItem('wedding_blessings', JSON.stringify(saved));

        // Trigger Confetti Celebration (Gold, Blush, Champagne)
        this.fireConfetti();

        // Show Confirmation with XSS sanitization
        if (this.statusContainer) {
          const safeName = escapeHTML(name);
          this.statusContainer.innerHTML = `
            <div class="rsvp-success-card">
              <div class="rsvp-icon">✨</div>
              <h4>Thank You, ${safeName}!</h4>
              <p>Your blessings and response have been warmly received. We eagerly look forward to celebrating together on 30 November 2026!</p>
            </div>
          `;
          this.statusContainer.classList.add('visible');
        }

        this.form.reset();
        this.renderStoredBlessings();
      } catch (err) {
        // Failure: keep form content, do not fire confetti, show friendly retry error
        if (this.statusContainer) {
          const safeError = escapeHTML(err.message || 'Please check your internet connection.');
          this.statusContainer.innerHTML = `
            <div class="rsvp-error-card">
              <p><strong>Could not send RSVP:</strong> ${safeError}. Please try again. Your entered text has been preserved.</p>
            </div>
          `;
          this.statusContainer.classList.add('visible');
        }
      } finally {
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.textContent = originalBtnText;
        }
      }
    });
  }

  fireConfetti() {
    const end = Date.now() + 2 * 1000;
    const colors = ['#dfc4a1', '#f5ded7', '#ffffff', '#c5a880', '#e8b4b8'];

    (function frame() {
      confetti({
        particleCount: 4,
        angle: 60,
        spread: 55,
        origin: { x: 0 },
        colors: colors
      });
      confetti({
        particleCount: 4,
        angle: 120,
        spread: 55,
        origin: { x: 1 },
        colors: colors
      });

      if (Date.now() < end) {
        requestAnimationFrame(frame);
      }
    })();
  }

  renderStoredBlessings() {
    if (!this.blessingsList) return;

    const saved = JSON.parse(localStorage.getItem('wedding_blessings') || '[]');
    if (saved.length === 0) {
      // Default seed warm blessing
      const defaultBlessings = [
        {
          name: "Rajput Family",
          message: "Heartiest congratulations to our dearest Anu! Wishing you a wonderful lifetime of togetherness and happiness.",
          timestamp: "Blessings"
        },
        {
          name: "Close Friends & Family",
          message: "Can't wait to dance at the Sangeet and celebrate this magnificent union on November 30th!",
          timestamp: "Blessings"
        }
      ];
      this.blessingsList.innerHTML = defaultBlessings.map(b => this.createBlessingHTML(b)).join('');
      return;
    }

    this.blessingsList.innerHTML = saved.slice(0, 6).map(b => this.createBlessingHTML(b)).join('');
  }

  createBlessingHTML(b) {
    const safeMessage = escapeHTML(b.message);
    const safeName = escapeHTML(b.name);
    const safeDate = escapeHTML(b.timestamp);
    return `
      <div class="blessing-card">
        <p class="blessing-text">“${safeMessage}”</p>
        <div class="blessing-author">
          <span class="blessing-name">${safeName}</span>
          <span class="blessing-date">${safeDate}</span>
        </div>
      </div>
    `;
  }
}
