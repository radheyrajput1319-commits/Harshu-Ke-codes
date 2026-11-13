/**
 * DeviceOrientationManager
 * Handles mobile gyroscope/accelerometer phone tilt interactions.
 * - Toggles listening on tap of "Tilt 3D".
 * - Offsets beta by initial angle at activation so current hold angle is neutral.
 * - Clamps gamma (±25°) and adjusted beta (±25°).
 * - Smooth exponential interpolation (lerp ~0.08).
 * - Removes listeners when toggled off and when the tab is hidden.
 * - Fallback to touch-drag parallax on photos when the sensor is unavailable.
 * - Desktop keeps mouse hover tilt.
 */
export class DeviceOrientationManager {
  constructor(onTiltUpdate) {
    this.onTiltUpdate = onTiltUpdate;
    this.isActive = false;
    this.isSupported = typeof window !== 'undefined' && 'DeviceOrientationEvent' in window;
    this.requiresPermission = typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function';

    this.initialBeta = null;
    this.targetTiltX = 0; // Roll / left-right (-1 to 1)
    this.targetTiltY = 0; // Pitch / forward-back (-1 to 1)
    this.smoothedTiltX = 0;
    this.smoothedTiltY = 0;

    this.reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.wasActiveBeforeHidden = false;

    this.handleOrientation = this.handleOrientation.bind(this);
    this.init();
  }

  init() {
    this.bindVisibilityHandler();
    this.bindTouchDragFallback();
    this.bindDesktopPointerHover();
    this.startSmoothingLoop();
  }

  async toggle() {
    if (this.reducedMotion) {
      return { active: false, error: 'Reduced motion is enabled in system settings.' };
    }

    if (this.isActive) {
      this.stopListening();
      return { active: false };
    } else {
      return await this.start();
    }
  }

  async start() {
    if (this.reducedMotion) {
      return { active: false, error: 'Reduced motion active' };
    }

    if (this.requiresPermission) {
      try {
        const response = await DeviceOrientationEvent.requestPermission();
        if (response === 'granted') {
          this.startListening();
          return { active: true };
        } else {
          return { active: false, error: 'Permission denied for motion sensors.' };
        }
      } catch (err) {
        return { active: false, error: 'Motion sensor permission error.' };
      }
    } else if (this.isSupported) {
      this.startListening();
      return { active: true };
    } else {
      return { active: false, error: 'Gyroscope sensor unavailable. Drag photo to tilt.' };
    }
  }

  startListening() {
    if (this.isActive) return;
    this.initialBeta = null;
    window.addEventListener('deviceorientation', this.handleOrientation, { passive: true });
    this.isActive = true;
  }

  stopListening() {
    if (!this.isActive) return;
    window.removeEventListener('deviceorientation', this.handleOrientation);
    this.isActive = false;
    this.initialBeta = null;
    this.targetTiltX = 0;
    this.targetTiltY = 0;
  }

  handleOrientation(e) {
    if (this.reducedMotion) return;
    if (e.gamma === null || e.beta === null) return;

    // Offset beta by initial angle at activation so current hold position is neutral
    if (this.initialBeta === null) {
      this.initialBeta = e.beta;
    }

    // Gamma: Left to right roll. Clamp to [-25, 25] degrees
    const clampedGamma = Math.max(-25, Math.min(25, e.gamma));
    this.targetTiltX = clampedGamma / 25; // Normalized -1 to +1

    // Beta: Front to back pitch. Offset by activation angle and clamp to [-25, 25] degrees
    const deltaBeta = e.beta - this.initialBeta;
    const clampedBeta = Math.max(-25, Math.min(25, deltaBeta));
    this.targetTiltY = clampedBeta / 25; // Normalized -1 to +1
  }

  bindVisibilityHandler() {
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        if (this.isActive) {
          this.wasActiveBeforeHidden = true;
          this.stopListening();
        }
      } else {
        if (this.wasActiveBeforeHidden) {
          this.wasActiveBeforeHidden = false;
          this.startListening();
        }
      }
    });
  }

  bindTouchDragFallback() {
    // Touch-drag parallax on photos when orientation sensor is inactive or unavailable
    let touchStartX = 0;
    let touchStartY = 0;
    let isDragging = false;

    window.addEventListener('touchstart', (e) => {
      if (this.isActive || this.reducedMotion) return;
      const target = e.target.closest('.photo-placeholder');
      if (target && e.touches.length === 1) {
        touchStartX = e.touches[0].clientX;
        touchStartY = e.touches[0].clientY;
        isDragging = true;
      }
    }, { passive: true });

    window.addEventListener('touchmove', (e) => {
      if (!isDragging || this.isActive || this.reducedMotion) return;
      if (e.touches.length === 1) {
        const dx = (e.touches[0].clientX - touchStartX) / 80;
        const dy = (e.touches[0].clientY - touchStartY) / 80;
        this.targetTiltX = Math.max(-1, Math.min(1, dx));
        this.targetTiltY = Math.max(-1, Math.min(1, dy));
      }
    }, { passive: true });

    const endTouch = () => {
      if (isDragging) {
        isDragging = false;
        if (!this.isActive) {
          this.targetTiltX = 0;
          this.targetTiltY = 0;
        }
      }
    };
    window.addEventListener('touchend', endTouch, { passive: true });
    window.addEventListener('touchcancel', endTouch, { passive: true });
  }

  bindDesktopPointerHover() {
    // Desktop mouse pointer movement fallback
    window.addEventListener('pointermove', (e) => {
      if (e.pointerType === 'touch') return;
      if (this.isActive || this.reducedMotion) return;

      const normX = (e.clientX / window.innerWidth) * 2 - 1;
      const normY = (e.clientY / window.innerHeight) * 2 - 1;

      this.targetTiltX = Math.max(-1, Math.min(1, normX * 0.7));
      this.targetTiltY = Math.max(-1, Math.min(1, normY * 0.7));
    }, { passive: true });
  }

  startSmoothingLoop() {
    const loop = () => {
      requestAnimationFrame(loop);

      if (this.reducedMotion) {
        this.smoothedTiltX = 0;
        this.smoothedTiltY = 0;
        if (this.onTiltUpdate) {
          this.onTiltUpdate({ x: 0, y: 0, isActive: false });
        }
        return;
      }

      // Exponential smoothing (lerp ~0.08)
      const smoothingFactor = 0.08;
      this.smoothedTiltX += (this.targetTiltX - this.smoothedTiltX) * smoothingFactor;
      this.smoothedTiltY += (this.targetTiltY - this.smoothedTiltY) * smoothingFactor;

      if (this.onTiltUpdate) {
        this.onTiltUpdate({
          x: this.smoothedTiltX,
          y: this.smoothedTiltY,
          isActive: this.isActive
        });
      }
    };

    requestAnimationFrame(loop);
  }
}
