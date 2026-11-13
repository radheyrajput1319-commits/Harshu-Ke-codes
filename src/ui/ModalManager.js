import { weddingConfig } from '../config/weddingConfig.js';

/**
 * Modal Manager
 * Handles High-Res Photo Inspector, Calendar Downloads (.ics & Google Calendar),
 * Venue Directions, and Toast Alerts.
 */
export class ModalManager {
  constructor(sceneManager) {
    this.sceneManager = sceneManager;
    this.photoModal = document.getElementById('photo-modal');
    this.photoModalImg = document.getElementById('photo-modal-img');
    this.photoModalTitle = document.getElementById('photo-modal-title');
    this.photoModalDesc = document.getElementById('photo-modal-desc');
    this.photoModalTag = document.getElementById('photo-modal-tag');

    this.bindEvents();
  }

  bindEvents() {
    // Close modal on click of close button or backdrop
    const closeBtn = document.getElementById('photo-modal-close');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => this.closePhotoModal());
    }

    if (this.photoModal) {
      this.photoModal.addEventListener('click', (e) => {
        if (e.target === this.photoModal) {
          this.closePhotoModal();
        }
      });
    }

    // Keyboard ESC to close
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        this.closePhotoModal();
      }
    });

    // Calendar Export Buttons
    const gCalBtn = document.getElementById('btn-google-cal');
    const icsBtn = document.getElementById('btn-ics-cal');

    if (gCalBtn) {
      gCalBtn.addEventListener('click', () => this.openGoogleCalendar());
    }
    if (icsBtn) {
      icsBtn.addEventListener('click', () => this.downloadIcsCalendar());
    }

    // Share Button
    const shareBtn = document.getElementById('btn-share-invite');
    if (shareBtn) {
      shareBtn.addEventListener('click', () => this.shareInvitation());
    }
  }

  openPhotoModal(photo) {
    if (!this.photoModal || !photo) return;

    this.photoModalImg.src = photo.src;
    this.photoModalImg.alt = photo.personName ? `${photo.personName} — ${photo.relationship}` : photo.title;
    this.photoModalTag.textContent = photo.relationship || 'Wedding Memory';
    this.photoModalTitle.textContent = photo.personName || photo.title;
    this.photoModalDesc.textContent = photo.message || photo.description;

    this.photoModal.classList.add('open');
    document.body.style.overflow = 'hidden';
  }

  closePhotoModal() {
    if (!this.photoModal) return;
    this.photoModal.classList.remove('open');
    document.body.style.overflow = '';
    if (this.sceneManager) {
      this.sceneManager.exitPhotoInspection();
    }
  }

  openGoogleCalendar() {
    const title = encodeURIComponent(`Wedding Celebration: ${weddingConfig.bride.firstName} & ${weddingConfig.groom.firstName}`);
    const details = encodeURIComponent(
      `Join us in celebrating the holy matrimony and wedding ceremonies of ${weddingConfig.bride.fullName} & ${weddingConfig.groom.fullName}.\n\n` +
      `Date: ${weddingConfig.weddingDateDisplay}\n` +
      `Venue: ${weddingConfig.venue.name}, ${weddingConfig.venue.address}`
    );
    const location = encodeURIComponent(`${weddingConfig.venue.name}, ${weddingConfig.venue.address}`);
    // 20261130T053000Z to 20261130T173000Z (UTC for Indian wedding day)
    const dates = '20261130T053000Z/20261130T173000Z';

    const url = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${title}&dates=${dates}&details=${details}&location=${location}`;
    window.open(url, '_blank');
  }

  downloadIcsCalendar() {
    const icsContent = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//Harsh Rajput//Anu Wedding 3D Invitation//EN',
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH',
      'BEGIN:VEVENT',
      'UID:wedding-anu-20261130@anukishadikacode',
      'DTSTART:20261130T053000Z',
      'DTEND:20261130T173000Z',
      `SUMMARY:Wedding Celebration: ${weddingConfig.bride.firstName} & ${weddingConfig.groom.firstName}`,
      `DESCRIPTION:Join us to celebrate the wedding ceremony of ${weddingConfig.bride.fullName} & ${weddingConfig.groom.fullName}.`,
      `LOCATION:${weddingConfig.venue.name}, ${weddingConfig.venue.address}`,
      'STATUS:CONFIRMED',
      'END:VEVENT',
      'END:VCALENDAR'
    ].join('\r\n');

    const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8' });
    const link = document.createElement('a');
    link.href = window.URL.createObjectURL(blob);
    link.setAttribute('download', 'Anu_Wedding_30Nov2026.ics');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    this.showToast('Event saved to calendar download (.ics)!');
  }

  async shareInvitation() {
    if (navigator.share) {
      try {
        await navigator.share({
          title: `Wedding Invitation — Anu & ${weddingConfig.groom.firstName}`,
          text: `You're warmly invited to the wedding celebration of Anu & ${weddingConfig.groom.firstName} on 30 November 2026!`,
          url: window.location.href
        });
      } catch (err) {
        // user cancelled or failed
      }
    } else {
      navigator.clipboard.writeText(window.location.href);
      this.showToast('Wedding invitation link copied to clipboard!');
    }
  }

  showToast(message) {
    const toast = document.getElementById('toast-notification');
    if (!toast) return;
    toast.textContent = message;
    toast.classList.add('show');
    setTimeout(() => {
      toast.classList.remove('show');
    }, 3500);
  }
}
