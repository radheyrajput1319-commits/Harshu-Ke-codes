import Lenis from 'lenis';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { WEDDING_GALLERY } from '../data/galleryData.js';
import { isTouchOrMobile } from '../utils/device.js';

gsap.registerPlugin(ScrollTrigger);

// Re-export for any modules importing from ScrollExperience.js
export { isTouchOrMobile };

/**
 * ScrollExperience
 * Manages Lenis smooth momentum scrolling on desktop, unified RAF render ticker,
 * scroll-velocity damping via gsap.quickTo, section-based active nav tracking,
 * and per-photo entrance reveals.
 * 
 * On mobile/touch: Bypasses Lenis in favor of native compositor scrolling,
 * replaces heavy GSAP ScrollTrigger work with lightweight IntersectionObserver
 * and a single RAF-throttled scroll listener for nav/progress sync.
 */
export class ScrollExperience {
  constructor(exhibitionManager, modalManager) {
    this.exhibition = exhibitionManager;
    this.modal = modalManager;
    this.isMobile = this.isTouchOrMobile();

    this.initLenis();

    if (!this.isMobile) {
      // Desktop-only pipelines
      this.initVelocityTracking();
      this.initPhotoReveals();
      this.initSectionNavTracking();
      this.initGlobalProgress();
    } else {
      // Mobile-only lightweight native pipelines
      this.initPhotoReveals();
      this.initMobileScrollSync();
    }

    this.bindEvents();
  }

  isTouchOrMobile() {
    return isTouchOrMobile();
  }

  initLenis() {
    if (this.isMobile) {
      this.lenis = null;
      // Native mobile scrolling: relax lag smoothing and avoid per-scroll ScrollTrigger.update calls
      gsap.ticker.lagSmoothing(500, 33);
    } else {
      this.lenis = new Lenis({
        duration: 1.2,
        easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
        smoothWheel: true,
        wheelMultiplier: 1.0,
        touchMultiplier: 1.2,
        infinite: false
      });

      this.lenis.on('scroll', () => {
        ScrollTrigger.update();
      });

      gsap.ticker.lagSmoothing(0);
    }

    // Single unified RAF loop via gsap.ticker driving Lenis and Three.js (desktop only)
    gsap.ticker.add((time, deltaTime) => {
      if (this.lenis) {
        this.lenis.raf(time * 1000);
      }
      if (this.exhibition && !this.exhibition.isMobile) {
        this.exhibition.update(deltaTime / 1000);
      }
    });
  }

  initVelocityTracking() {
    this.velocityProxy = { val: 0 };
    this.onVelocityUpdate = null;

    this.quickVelocity = gsap.quickTo(this.velocityProxy, 'val', {
      duration: 0.5,
      ease: 'power2.out',
      onUpdate: () => {
        if (this.exhibition) {
          this.exhibition.setVelocity(this.velocityProxy.val);
        }
        if (this.onVelocityUpdate) {
          this.onVelocityUpdate(this.velocityProxy.val);
        }
      }
    });

    if (this.lenis) {
      this.lenis.on('scroll', (e) => {
        // Scale and clamp scroll velocity for shader curvature
        const rawVel = e.velocity || 0;
        const clampedVel = Math.max(-2.5, Math.min(2.5, rawVel * 0.04));
        this.quickVelocity(clampedVel);
      });
    } else {
      let lastScrollY = window.scrollY || window.pageYOffset || 0;
      let velocityResetTimeout = null;

      window.addEventListener('scroll', () => {
        const currentScrollY = window.scrollY || window.pageYOffset || 0;
        const deltaY = currentScrollY - lastScrollY;
        lastScrollY = currentScrollY;

        // Scale and clamp scroll velocity for shader curvature
        const clampedVel = Math.max(-2.5, Math.min(2.5, deltaY * 0.04));
        this.quickVelocity(clampedVel);

        clearTimeout(velocityResetTimeout);
        velocityResetTimeout = setTimeout(() => {
          this.quickVelocity(0);
        }, 100);
      }, { passive: true });
    }
  }

  initPhotoReveals() {
    const placeholders = document.querySelectorAll('.photo-placeholder');

    // Mobile / touch branch: lightweight IntersectionObserver toggling CSS class .revealed
    if (this.isMobile) {
      const reducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      const revealAll = () => {
        placeholders.forEach((el) => el.classList.add('revealed'));
      };

      if (reducedMotion || !window.IntersectionObserver) {
        revealAll();
        return;
      }

      const revealObserver = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('revealed');
            revealObserver.unobserve(entry.target);
          }
        });
      }, { rootMargin: '0px 0px -10% 0px' });

      placeholders.forEach((el) => revealObserver.observe(el));

      // Safety fallback: ensure all photos are revealed even if observer never triggers
      setTimeout(revealAll, 2000);
      return;
    }

    // Desktop branch: GSAP ScrollTrigger 3D mesh reveals
    placeholders.forEach((el) => {
      const photoId = el.dataset.photoId;
      const node = this.exhibition ? this.exhibition.getPhotoNode(photoId) : null;
      if (!node) return;

      // Animate entry state: rotateX 25° -> 0, y 60px -> 0, opacity 0 -> 1, progress 0 -> 1
      gsap.fromTo(node.revealState,
        {
          progress: 0.0,
          opacity: 0.0,
          yOffset: 60,
          rotXOffset: 25 * (Math.PI / 180)
        },
        {
          progress: 1.0,
          opacity: 1.0,
          yOffset: 0,
          rotXOffset: 0,
          duration: 1.1,
          ease: 'power3.out',
          scrollTrigger: {
            trigger: el,
            start: 'top 88%',
            once: true
          }
        }
      );
    });
  }

  /**
   * Lightweight mobile scroll coordinator.
   * Runs single RAF-throttled passive scroll listener to update both
   * the scroll progress bar and the active section nav highlight.
   */
  initMobileScrollSync() {
    const sections = [
      'sec-intro',
      'sec-bride',
      'sec-couple',
      'sec-itinerary',
      'sec-family',
      'sec-venue',
      'sec-rsvp'
    ];
    const navLinks = document.querySelectorAll('.nav-link');
    const fill = document.getElementById('scroll-progress-fill');
    const txt = document.getElementById('scroll-percent');
    const navPills = document.querySelector('.nav-pills');

    let currentActiveSecId = 'sec-intro';

    const updateActivePill = (secId) => {
      if (currentActiveSecId === secId) return;
      currentActiveSecId = secId;

      navLinks.forEach((link) => {
        const href = link.getAttribute('href');
        if (href === `#${secId}`) {
          link.classList.add('current');
          // Keep active pill visible: update scrollLeft only when section changes, with behavior: auto
          if (navPills) {
            const linkLeft = link.offsetLeft;
            const linkWidth = link.offsetWidth;
            const containerWidth = navPills.clientWidth;
            navPills.scrollLeft = linkLeft - (containerWidth / 2) + (linkWidth / 2);
          }
        } else {
          link.classList.remove('current');
        }
      });
    };

    const updateProgressAndNav = () => {
      const scrollY = window.scrollY || window.pageYOffset || 0;
      const maxScroll = document.documentElement.scrollHeight - window.innerHeight;
      const progress = maxScroll > 0 ? Math.max(0, Math.min(1, scrollY / maxScroll)) : 0;
      const pct = Math.round(progress * 100);

      if (fill) fill.style.width = `${pct}%`;
      if (txt) txt.textContent = `${pct}%`;

      // If near bottom of the page, activate the last section (sec-rsvp)
      if (scrollY + window.innerHeight >= document.documentElement.scrollHeight - 60) {
        updateActivePill('sec-rsvp');
        return;
      }

      // 45% viewport trigger line
      const checkLine = scrollY + window.innerHeight * 0.45;
      let activeId = sections[0];
      for (let i = 0; i < sections.length; i++) {
        const el = document.getElementById(sections[i]);
        if (el && el.offsetTop <= checkLine) {
          activeId = sections[i];
        }
      }
      updateActivePill(activeId);
    };

    let rafId = null;
    const onScroll = () => {
      if (!rafId) {
        rafId = requestAnimationFrame(() => {
          updateProgressAndNav();
          rafId = null;
        });
      }
    };

    window.addEventListener('scroll', onScroll, { passive: true });
    updateProgressAndNav();
  }

  initSectionNavTracking() {
    const sections = [
      'sec-intro',
      'sec-bride',
      'sec-couple',
      'sec-itinerary',
      'sec-family',
      'sec-venue',
      'sec-rsvp'
    ];
    const navLinks = document.querySelectorAll('.nav-link');

    sections.forEach((secId) => {
      const sectionEl = document.getElementById(secId);
      if (!sectionEl) return;

      const isLast = secId === 'sec-rsvp';

      ScrollTrigger.create({
        trigger: sectionEl,
        start: 'top 45%',
        end: isLast ? 'max' : 'bottom 45%',
        onToggle: (self) => {
          if (self.isActive) {
            navLinks.forEach((link) => {
              const href = link.getAttribute('href');
              if (href === `#${secId}`) {
                link.classList.add('current');
                // Auto-scroll active pill into view in the horizontally scrollable nav bar
                link.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
              } else {
                link.classList.remove('current');
              }
            });
          }
        }
      });
    });
  }

  initGlobalProgress() {
    const fill = document.getElementById('scroll-progress-fill');
    const txt = document.getElementById('scroll-percent');

    const updateProgress = (scrollPos) => {
      const maxScroll = document.documentElement.scrollHeight - window.innerHeight;
      const progress = maxScroll > 0 ? Math.max(0, Math.min(1, scrollPos / maxScroll)) : 0;
      const pct = Math.round(progress * 100);

      if (fill) fill.style.width = `${pct}%`;
      if (txt) txt.textContent = `${pct}%`;
    };

    if (this.lenis) {
      this.lenis.on('scroll', (e) => {
        updateProgress(e.scroll);
      });
    } else {
      window.addEventListener('scroll', () => {
        const scrollY = window.scrollY || window.pageYOffset || 0;
        updateProgress(scrollY);
      }, { passive: true });
    }

    // Initialize progress on mount
    updateProgress(window.scrollY || window.pageYOffset || 0);
  }

  scrollTo(target, options = {}) {
    if (this.lenis) {
      this.lenis.scrollTo(target, options);
    } else {
      const elem = typeof target === 'string' ? document.querySelector(target) : target;
      if (elem && elem.scrollIntoView) {
        elem.scrollIntoView({ behavior: 'smooth' });
      } else if (typeof target === 'number') {
        window.scrollTo({ top: target, behavior: 'smooth' });
      }
    }
  }

  bindEvents() {
    // Inspect button opens modal
    document.addEventListener('click', (e) => {
      const btn = e.target.closest('.btn-inspect-3d');
      if (btn) {
        const photoId = btn.dataset.photoId;
        const photo = WEDDING_GALLERY.find(p => p.id === photoId);
        if (photo && this.modal) {
          this.modal.openPhotoModal(photo);
        }
      }
    });

    window.addEventListener('resize', () => {
      this.isMobile = this.isTouchOrMobile();
      if (!this.isMobile) {
        ScrollTrigger.refresh();
      }
    }, { passive: true });
  }
}
