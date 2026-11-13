import { isTouchOrMobile } from '../utils/device.js';

/**
 * InvitePdfViewer
 * Manages the "Your Invitation Card" PDF preview modal and trigger behavior.
 * 
 * - On desktop: Opens a high-fidelity modal viewer with an embedded iframe,
 *   lazy-loading the PDF on demand to prevent heavy initial page payload.
 *   Handles body scroll locking, Lenis pausing, focus trapping, and Esc/backdrop dismiss.
 * - On mobile/touch devices: Bypasses the iframe (which iOS/Android render poorly)
 *   and opens the PDF directly in a new browser tab.
 */
export class InvitePdfViewer {
  constructor(options = {}) {
    this.pdfUrl = options.pdfUrl || '/docs/Anita_Kanwar_Wedding.pdf';
    this.lenisGetter = options.getLenis || (options.lenis ? () => options.lenis : null);

    this.triggerBtn = document.getElementById('open-invite-pdf');
    this.modal = document.getElementById('invite-pdf-modal');
    this.closeBtn = document.getElementById('invite-pdf-close');
    this.iframe = document.getElementById('invite-pdf-iframe');
    this.dialog = this.modal ? this.modal.querySelector('.invite-pdf-dialog') : null;

    this.isOpen = false;
    this.previousFocusedElement = null;
    this.boundHandleKeydown = this.handleKeydown.bind(this);

    this.init();
  }

  init() {
    if (!this.triggerBtn) return;

    this.triggerBtn.addEventListener('click', (e) => {
      e.preventDefault();
      if (isTouchOrMobile()) {
        window.open(this.pdfUrl, '_blank', 'noopener,noreferrer');
      } else {
        this.openModal();
      }
    });

    if (this.closeBtn) {
      this.closeBtn.addEventListener('click', () => this.closeModal());
    }

    if (this.modal) {
      this.modal.addEventListener('click', (e) => {
        // Close when clicking directly on the overlay backdrop
        if (e.target === this.modal) {
          this.closeModal();
        }
      });
    }
  }

  openModal() {
    if (!this.modal || this.isOpen) return;

    this.previousFocusedElement = document.activeElement;
    this.isOpen = true;

    // 1. Lazy-load PDF only when the modal opens
    if (this.iframe && !this.iframe.src.includes(this.pdfUrl)) {
      this.iframe.src = `${this.pdfUrl}#view=FitH&toolbar=1`;
    }

    // 2. Open animation & accessibility state
    this.modal.classList.add('open');
    this.modal.setAttribute('aria-hidden', 'false');

    // 3. Lock scroll & pause Lenis smooth momentum
    document.body.style.overflow = 'hidden';
    const lenis = this.getLenis();
    if (lenis && typeof lenis.stop === 'function') {
      lenis.stop();
    }

    // 4. Trap keyboard focus inside dialog
    window.addEventListener('keydown', this.boundHandleKeydown);

    // Focus close button initially
    if (this.closeBtn) {
      setTimeout(() => this.closeBtn.focus(), 50);
    }
  }

  closeModal() {
    if (!this.modal || !this.isOpen) return;

    this.isOpen = false;

    // 1. Close animation & accessibility state
    this.modal.classList.remove('open');
    this.modal.setAttribute('aria-hidden', 'true');

    // 2. Restore scroll & resume Lenis
    document.body.style.overflow = '';
    const lenis = this.getLenis();
    if (lenis && typeof lenis.start === 'function') {
      lenis.start();
    }

    // 3. Clear iframe src to release memory and stop any background download
    if (this.iframe) {
      this.iframe.src = 'about:blank';
    }

    // 4. Remove key listener
    window.removeEventListener('keydown', this.boundHandleKeydown);

    // 5. Restore focus to trigger button
    if (this.previousFocusedElement && typeof this.previousFocusedElement.focus === 'function') {
      this.previousFocusedElement.focus();
    }
  }

  handleKeydown(e) {
    if (!this.isOpen) return;

    if (e.key === 'Escape') {
      e.preventDefault();
      this.closeModal();
      return;
    }

    if (e.key === 'Tab') {
      this.trapFocus(e);
    }
  }

  trapFocus(e) {
    if (!this.dialog) return;

    const focusables = this.dialog.querySelectorAll(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    if (!focusables.length) return;

    const first = focusables[0];
    const last = focusables[focusables.length - 1];

    if (e.shiftKey) {
      if (document.activeElement === first) {
        e.preventDefault();
        last.focus();
      }
    } else {
      if (document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  }

  getLenis() {
    if (this.lenisGetter) {
      return this.lenisGetter();
    }
    return null;
  }
}

