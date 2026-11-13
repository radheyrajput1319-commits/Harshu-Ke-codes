import { weddingConfig } from './config/weddingConfig.js';
import { CinematicExhibitionManager } from './three/CinematicExhibitionManager.js';
import { FallingPetals } from './three/FallingPetals.js';
import { FlowerField } from './three/FlowerField.js';
import gsap from 'gsap';
import { ScrollExperience } from './ui/ScrollExperience.js';
import { ModalManager } from './ui/ModalManager.js';
import { RSVPManager } from './ui/RSVPManager.js';
import { InvitePdfViewer } from './ui/InvitePdfViewer.js';
import { Soundscape } from './audio/Soundscape.js';
import { DeviceOrientationManager } from './interaction/DeviceOrientationManager.js';
import { WEDDING_GALLERY } from './data/galleryData.js';
import { isTouchOrMobile } from './utils/device.js';

/**
 * Application Master Entry Point
 * Orchestrates:
 * 1. 3D Exhibition WebGL Engine with Custom Curvature Shader & Full-Width B&W Photos
 * 2. Mobile Gyroscope Parallax & Touch-Drag Orientation
 * 3. Lenis Smooth Momentum & GSAP ScrollTrigger Master Scrub
 * 4. Ambient Harp Web Audio Soundscape
 * 5. High-Res Photo Modal, RSVP, and Countdown to 30 November 2026
 * 6. Ambient Falling Petals (Full-Page Layer)
 * 7. Flower Finale Rolling Meadow & Fluid Interaction (#sec-flower-finale)
 */
document.addEventListener('DOMContentLoaded', async () => {
  // 0. Auto-create cards for any new family photos added in galleryData.js
  //    (must run BEFORE the 3D engine so the new photos get WebGL meshes)
  await renderExtraFamilyCards();

  const canvasContainer = document.getElementById('webgl-canvas-container') || document.getElementById('cinematic-canvas-holder');

  // 1. Initialize 3D Cinematic Exhibition WebGL Scene
  let exhibitionManager = null;
  if (canvasContainer) {
    exhibitionManager = new CinematicExhibitionManager(canvasContainer);
  }

  // 2. Initialize UI Managers & Sync Gallery Captions from Data
  syncGalleryCaptions();
  const modalManager = new ModalManager(exhibitionManager);
  const rsvpManager = new RSVPManager();

  let flowerField = null;

  // 3. Initialize Mobile Device Orientation & Parallax
  const motionBtn = document.getElementById('motion-toggle-btn');
  const motionLabel = document.getElementById('motion-btn-label');

  // Tilt only affects WebGL photo meshes. On mobile/touch, hide the tilt toggle button.
  if (isTouchOrMobile()) {
    if (motionBtn) motionBtn.style.display = 'none';
  } else {
    const deviceOrientationManager = new DeviceOrientationManager((tilt) => {
      if (exhibitionManager) {
        exhibitionManager.setTilt(tilt.x, tilt.y);
      }
      if (flowerField) {
        flowerField.setTilt(tilt.x, tilt.y);
      }
    });

    if (motionBtn) {
      motionBtn.addEventListener('click', async () => {
        const result = await deviceOrientationManager.toggle();
        if (result.active) {
          motionBtn.classList.add('active');
          if (motionLabel) motionLabel.textContent = 'Tilt On';
          modalManager.showToast('Tilt 3D On: Tilt phone to explore depth & light sheen!');
        } else {
          motionBtn.classList.remove('active');
          if (motionLabel) motionLabel.textContent = 'Tilt Off';
          if (result.error) {
            modalManager.showToast(result.error);
          } else {
            modalManager.showToast('Tilt 3D Off');
          }
        }
      });
    }
  }

  // 4. Initialize Ambient Soundscape
  const soundscape = new Soundscape();
  const audioBtn = document.getElementById('audio-toggle-btn');
  const audioLabel = document.getElementById('audio-btn-label');

  if (audioBtn) {
    audioBtn.addEventListener('click', () => {
      const isPlaying = soundscape.toggle();
      if (isPlaying) {
        audioBtn.classList.add('playing');
        if (audioLabel) audioLabel.textContent = 'Mute';
      } else {
        audioBtn.classList.remove('playing');
        if (audioLabel) audioLabel.textContent = 'Music';
      }
    });
  }

  const unlockAudio = () => {
    soundscape.init();
    window.removeEventListener('pointerdown', unlockAudio);
  };
  window.addEventListener('pointerdown', unlockAudio, { once: true });

  // 5. Initialize GSAP ScrollTrigger & Lenis Scroll Experience
  const scrollExperience = new ScrollExperience(exhibitionManager, modalManager);

  // 5.1 Initialize Wedding Invitation Card PDF Viewer
  const invitePdfViewer = new InvitePdfViewer({
    getLenis: () => (scrollExperience ? scrollExperience.lenis : null)
  });

  // 6. Initialize Ambient Falling Petals Layer (Always Active)
  const fallingPetals = new FallingPetals();
  gsap.ticker.add((time, deltaTime) => {
    fallingPetals.update(deltaTime / 1000);
  });

  if (scrollExperience) {
    scrollExperience.onVelocityUpdate = (vel) => {
      fallingPetals.setScrollVelocity(vel);
    };
  }

  // 7. Initialize Flower Finale (Bottom of Page #sec-flower-finale)
  const finaleElement = document.getElementById('sec-flower-finale');
  if (finaleElement) {
    flowerField = new FlowerField(finaleElement);

    // Wire state changes: fade out ambient petals when gathering starts
    flowerField.onStateChange((state) => {
      if (state === 'GATHERING') {
        fallingPetals.setIntensity(0.0);
      }
    });

    // Hook into the unified GSAP ticker
    gsap.ticker.add((time, deltaTime) => {
      flowerField.update(deltaTime / 1000);
    });
  }

  // 8. Navigation & Anchor Smooth Scrolling
  const anchorLinks = document.querySelectorAll('.nav-link, a[href^="#"]');
  anchorLinks.forEach(link => {
    link.addEventListener('click', (e) => {
      const targetId = link.getAttribute('href');
      if (!targetId || targetId === '#') return;
      const targetElem = document.querySelector(targetId);
      if (targetElem) {
        e.preventDefault();
        if (scrollExperience && scrollExperience.lenis) {
          scrollExperience.lenis.scrollTo(targetElem, { duration: 1.2 });
        } else {
          targetElem.scrollIntoView({ behavior: 'smooth' });
        }
      }
    });
  });
});

/**
 * Creates a Family Legacy card for every "family" entry in WEDDING_GALLERY
 * that does not already have a hand-written card in index.html.
 * Reads the real image size, so aspectRatio/focalPoint are optional in the data.
 */
function loadImageSize(src) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

async function renderExtraFamilyCards() {
  const grid = document.querySelector('.family-grid-container');
  if (!grid) return;

  const extras = WEDDING_GALLERY.filter(
    (p) => p.category === 'family' && !grid.querySelector(`.family-card[data-photo-id="${p.id}"]`)
  );

  for (const photo of extras) {
    if (!photo.aspectRatio) {
      const size = await loadImageSize(photo.src);
      photo.aspectRatio = size ? size.w / size.h : 1;
    }
    if (!photo.focalPoint) photo.focalPoint = { x: 0.5, y: 0.4 };

    const card = document.createElement('article');
    card.className = 'family-card';
    card.dataset.photoId = photo.id;
    card.innerHTML = `
          <figure class="photo-placeholder" style="--aspect-ratio: ${photo.aspectRatio.toFixed(3)};" data-photo-id="${photo.id}"></figure>
          <div class="photo-caption">
            <span class="caption-tag"></span>
            <h3 class="caption-title"></h3>
            <p class="caption-desc"></p>
            <div class="caption-actions">
              <button class="btn-inspect-3d" data-photo-id="${photo.id}">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
                <span>Inspect Original High-Res</span>
              </button>
              <span class="fidelity-pill">Unaltered Original</span>
            </div>
          </div>`;
    card.querySelector('.photo-placeholder').setAttribute('aria-label', photo.personName || photo.title || 'Family photo');
    // Text is filled in by syncGalleryCaptions() from the same data entry
    if (photo.pinFirst) {
      grid.prepend(card);
    } else {
      grid.appendChild(card);
    }
  }
}

/**
 * Synchronizes HTML photo captions with WEDDING_GALLERY data registry.
 * Enables single-point caption updates directly from galleryData.js.
 */
function syncGalleryCaptions() {
  const photos = weddingConfig.photos || [];
  document.querySelectorAll('[data-photo-id]').forEach((card) => {
    if (!card.classList.contains('photo-row') && !card.classList.contains('family-card')) return;
    const photoId = card.dataset.photoId;
    const photo = photos.find((p) => p.id === photoId);
    if (!photo) return;

    const tagEl = card.querySelector('.caption-tag');
    const titleEl = card.querySelector('.caption-title');
    const descEl = card.querySelector('.caption-desc');

    if (tagEl && photo.relationship) {
      tagEl.textContent = photo.relationship;
    }
    if (titleEl && (photo.personName || photo.title)) {
      titleEl.textContent = photo.personName || photo.title;
    }
    if (descEl && (photo.message || photo.description)) {
      descEl.textContent = photo.message || photo.description;
    }
  });
}
