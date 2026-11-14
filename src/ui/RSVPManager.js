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
 * Generates a unique submission ID matching /^[A-Za-z0-9_-]{8,64}$/.
 * Uses crypto.randomUUID() where available, with cryptographic or pseudorandom fallbacks.
 */
function generateSubmissionId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    bytes[6] = (bytes[6] & 0x0f) | 0x40; // UUID version 4
    bytes[8] = (bytes[8] & 0x3f) | 0x80; // UUID variant
    const hex = Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }
  return 'rsvp_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 12);
}

/**
 * Calculates exponential backoff delay with random jitter, clamped between 1000ms and 4000ms.
 */
function calculateBackoffDelay(attemptIndex) {
  const base = 1000 * Math.pow(1.5, attemptIndex);
  const jitter = Math.random() * 1000;
  const delay = Math.round(base + jitter);
  return Math.min(4000, Math.max(1000, delay));
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
    this.isSubmitting = false;

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

      // In-memory guard to prevent concurrent submission processing
      if (this.isSubmitting) {
        return;
      }

      // 1. Anti-spam honeypot check: reject if filled
      const honeypot = document.getElementById('rsvp-website')?.value || '';
      if (honeypot.trim() !== '') {
        return; // Silently drop bot submissions
      }

      // 2. Client-side rate limits & cooldowns
      const now = Date.now();

      // 2a. Success cooldown: 30s after a successful submission
      const SUCCESS_COOLDOWN_SECONDS = 30;
      const lastSubmit = parseInt(localStorage.getItem('wedding_rsvp_last_submit') || '0', 10);
      if (now - lastSubmit < SUCCESS_COOLDOWN_SECONDS * 1000) {
        const remaining = Math.ceil((SUCCESS_COOLDOWN_SECONDS * 1000 - (now - lastSubmit)) / 1000);
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

      // 2b. Final failure cooldown: 5s after exhausted retries
      const FAILURE_COOLDOWN_SECONDS = 5;
      const lastFailure = parseInt(localStorage.getItem('wedding_rsvp_last_failure') || '0', 10);
      if (now - lastFailure < FAILURE_COOLDOWN_SECONDS * 1000) {
        const remaining = Math.ceil((FAILURE_COOLDOWN_SECONDS * 1000 - (now - lastFailure)) / 1000);
        if (this.statusContainer) {
          this.statusContainer.innerHTML = `
            <div class="rsvp-error-card">
              <p>Please wait <strong>${remaining} seconds</strong> before trying again.</p>
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

      this.isSubmitting = true;
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
          console.error('RSVP endpoint is not configured. Please set VITE_RSVP_ENDPOINT in your environment.');
          throw {
            type: 'NOT_CONFIGURED',
            userMessage: "We couldn't send your RSVP just now. Please try again later. Your details are still filled in."
          };
        }

        // Idempotency: obtain or generate submissionId, persisted in sessionStorage
        const PENDING_ID_KEY = 'wedding_rsvp_pending_id';
        let submissionId = sessionStorage.getItem(PENDING_ID_KEY);
        if (!submissionId) {
          submissionId = generateSubmissionId();
          sessionStorage.setItem(PENDING_ID_KEY, submissionId);
        }

        // Retry & Timeout Configuration
        const MAX_RETRIES = 3; // 4 attempts total (initial attempt 0 + up to 3 retries)
        const PER_ATTEMPT_TIMEOUT_MS = 35000; // 35 seconds per attempt
        const TOTAL_TIME_BUDGET_MS = 120000; // 120 seconds maximum total duration
        const startTime = Date.now();

        let successResult = null;
        let lastFailureReason = null;

        for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
          if (attempt > 0 && (Date.now() - startTime) >= TOTAL_TIME_BUDGET_MS) {
            lastFailureReason = {
              type: 'TIMEOUT',
              userMessage: "We couldn't send your RSVP just now. Please check your connection and try again in a moment. Your details are still filled in."
            };
            break;
          }

          if (attempt > 0 && this.statusContainer) {
            this.statusContainer.innerHTML = `
              <div class="rsvp-error-card">
                <p>Your RSVP is still being submitted. Please wait...</p>
              </div>
            `;
            this.statusContainer.classList.add('visible');
          }

          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), PER_ATTEMPT_TIMEOUT_MS);

          let isRetryable = false;
          let failureInfo = null;

          try {
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
                website: honeypot,
                submissionId
              }),
              signal: controller.signal
            });

            if (!response.ok) {
              failureInfo = {
                type: 'HTTP_ERROR',
                status: response.status,
                userMessage: "We couldn't send your RSVP just now. Please check your connection and try again in a moment. Your details are still filled in."
              };
              isRetryable = true;
            } else {
              let result;
              try {
                result = await response.json();
              } catch (parseErr) {
                failureInfo = {
                  type: 'PARSE_ERROR',
                  userMessage: "We couldn't send your RSVP just now. Please check your connection and try again in a moment. Your details are still filled in."
                };
                isRetryable = true;
              }

              if (result) {
                if (result.ok) {
                  successResult = result;
                  break;
                } else {
                  const retryable = result.retryable !== undefined
                    ? Boolean(result.retryable)
                    : Boolean(result.error && typeof result.error === 'string' && /busy/i.test(result.error));

                  if (retryable) {
                    failureInfo = {
                      type: 'SERVER_RETRYABLE',
                      code: result.code,
                      userMessage: "We couldn't send your RSVP just now. Please check your connection and try again in a moment. Your details are still filled in."
                    };
                    isRetryable = true;
                  } else {
                    const guestMessage = result.message || result.error || 'Please check your inputs and try again.';
                    failureInfo = {
                      type: 'VALIDATION',
                      code: result.code || 'VALIDATION',
                      userMessage: guestMessage
                    };
                    isRetryable = false;
                  }
                }
              }
            }
          } catch (fetchErr) {
            const isTimeout = fetchErr && fetchErr.name === 'AbortError';
            failureInfo = {
              type: isTimeout ? 'TIMEOUT' : 'NETWORK_ERROR',
              originalError: fetchErr,
              userMessage: "We couldn't send your RSVP just now. Please check your connection and try again in a moment. Your details are still filled in."
            };
            isRetryable = true;
          } finally {
            clearTimeout(timeoutId);
          }

          lastFailureReason = failureInfo;

          // Non-retryable: break out immediately and clear pending submission ID
          if (!isRetryable) {
            sessionStorage.removeItem(PENDING_ID_KEY);
            break;
          }

          // Delay before next retry if budget permits
          if (attempt < MAX_RETRIES) {
            const remainingBudget = TOTAL_TIME_BUDGET_MS - (Date.now() - startTime);
            if (remainingBudget <= 1000) {
              break;
            }
            const delay = Math.min(calculateBackoffDelay(attempt), remainingBudget);
            await new Promise(resolve => setTimeout(resolve, delay));
          }
        }

        if (!successResult || !successResult.ok) {
          throw lastFailureReason || {
            type: 'UNKNOWN',
            userMessage: "We couldn't send your RSVP just now. Please check your connection and try again in a moment. Your details are still filled in."
          };
        }

        // Success: clear pending submission ID and update success rate limit timestamp
        sessionStorage.removeItem(PENDING_ID_KEY);
        localStorage.setItem('wedding_rsvp_last_submit', Date.now().toString());

        const blessing = {
          name,
          attendance,
          guests,
          message: message || "Wishing you both a lifetime of love and joy!",
          timestamp: new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
        };

        const saved = JSON.parse(localStorage.getItem('wedding_blessings') || '[]');
        saved.unshift(blessing);
        localStorage.setItem('wedding_blessings', JSON.stringify(saved));

        this.fireConfetti();

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
        // Log technical failure details for developers (without personal data)
        console.error('RSVP submission failure:', err);

        // Apply 5-second failure cooldown for transient/retryable failures (retries exhausted)
        if (err && err.type !== 'VALIDATION' && err.type !== 'NOT_CONFIGURED') {
          localStorage.setItem('wedding_rsvp_last_failure', Date.now().toString());
        }

        // Render clean, guest-safe message using existing card styling
        if (this.statusContainer) {
          const safeMsg = escapeHTML(err && err.userMessage
            ? err.userMessage
            : "We couldn't send your RSVP just now. Please check your connection and try again in a moment. Your details are still filled in.");

          this.statusContainer.innerHTML = `
            <div class="rsvp-error-card">
              <p>${safeMsg}</p>
            </div>
          `;
          this.statusContainer.classList.add('visible');
        }
      } finally {
        this.isSubmitting = false;
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
