import * as THREE from 'three';
import { WEDDING_GALLERY } from '../data/galleryData.js';
import { PhotoMaterialShader } from './CinematicShader.js';
import { isTouchOrMobile } from '../utils/device.js';

/**
 * CinematicExhibitionManager
 * High-performance Three.js orchestrator that syncs WebGL meshes 1:1 to DOM placeholders.
 * 
 * 3D Effects:
 * 1. Full-width B&W photos (bride-01, bride-02): 100vw, aspect ratio & focalPoint cover-fit
 * 2. Scroll-velocity bend (vertex shader cylinder curve)
 * 3. Depth tilt & Z-push (eased to 0 at center)
 * 4. Mobile Tilt 3D: max 8° rotation, 3-4% UV parallax, moving light sheen
 * 5. GSAP ScrollTrigger entrance reveal
 * 6. Responsive performance: pixelRatio max 1.5 on mobile, 16x16 segments, off-screen culling
 */
export class CinematicExhibitionManager {
  constructor(canvasContainer) {
    this.container = canvasContainer;
    this.width = window.innerWidth;
    this.height = window.innerHeight;
    this.isMobile = isTouchOrMobile();
    this.reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.isVisible = true;
    this.isTabActive = !document.hidden;

    this.velocity = 0;
    this.globalTilt = { x: 0, y: 0, targetX: 0, targetY: 0 };
    this.photoNodes = [];
    this.photoMap = new Map();

    // On touch/mobile: completely bypass WebGL canvas, meshes, and RAF loop.
    // Mount native DOM images directly inside placeholders for locked 60fps scrolling.
    if (this.isMobile) {
      this.initMobileDOMPhotos();
      return;
    }

    this.initScene();
    this.initCamera();
    this.initRenderer();
    this.createMeshes();
    this.bindEvents();
  }

  /**
   * Mobile native DOM image renderer:
   * Mounts real <img> elements inside placeholders with precise aspect ratios
   * and focal points matching the desktop shader's cover-fit.
   */
  initMobileDOMPhotos() {
    const placeholders = document.querySelectorAll('.photo-placeholder');

    placeholders.forEach((placeholder) => {
      const photoId = placeholder.dataset.photoId;
      const photo = WEDDING_GALLERY.find((p) => p.id === photoId);
      if (!photo) return;

      // Ensure explicit placeholder aspect-ratio CSS variable
      if (photo.aspectRatio) {
        placeholder.style.setProperty('--aspect-ratio', photo.aspectRatio.toFixed(3));
      }

      // Render native image element if not already injected
      if (!placeholder.querySelector('img')) {
        const img = document.createElement('img');
        img.src = photo.src;
        img.alt = photo.personName || photo.title || 'Wedding photo';
        img.loading = 'lazy';
        img.decoding = 'async';

        // Intrinsic dimensions to reserve layout space and prevent cumulative layout shift (CLS)
        const baseWidth = 1000;
        const baseHeight = Math.round(baseWidth / (photo.aspectRatio || 1));
        img.width = baseWidth;
        img.height = baseHeight;

        // Replicate desktop shader cover-fit and focal-point pinning
        const focalX = (photo.focalPoint?.x ?? 0.5) * 100;
        const focalY = (photo.focalPoint?.y ?? 0.5) * 100;
        img.style.objectFit = 'cover';
        img.style.objectPosition = `${focalX}% ${focalY}%`;
        img.style.width = '100%';
        img.style.height = '100%';
        img.style.display = 'block';
        img.style.borderRadius = 'inherit';

        placeholder.appendChild(img);
      }

      const node = {
        id: photo.id,
        photo: photo,
        placeholder: placeholder,
        mesh: null
      };

      this.photoNodes.push(node);
      this.photoMap.set(photo.id, node);
    });
  }

  initScene() {
    this.scene = new THREE.Scene();
    this.scene.background = null;
  }

  initCamera() {
    // Matched frustum perspective camera at z = 1000
    // At z = 0, exactly 1 Three.js unit = 1 CSS pixel
    const cameraZ = 1000;
    const fov = 2 * Math.atan((this.height / 2) / cameraZ) * (180 / Math.PI);

    this.camera = new THREE.PerspectiveCamera(
      fov,
      this.width / this.height,
      0.1,
      3000
    );
    this.camera.position.set(0, 0, cameraZ);
    this.camera.lookAt(0, 0, 0);
  }

  initRenderer() {
    this.renderer = new THREE.WebGLRenderer({
      alpha: true,
      antialias: !this.isMobile,
      powerPreference: 'high-performance'
    });
    this.renderer.setSize(this.width, this.height);
    // Performance: pixelRatio max 1.0 on mobile, max 2 on desktop
    const maxRatio = this.isMobile ? 1.0 : 2.0;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, maxRatio));
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    this.container.appendChild(this.renderer.domElement);
  }

  createMeshes() {
    const textureLoader = new THREE.TextureLoader();
    // Segments: 16x16 on mobile for smooth performance, 32x32 on desktop
    const segments = this.isMobile ? 16 : 32;
    this.geometry = new THREE.PlaneGeometry(1, 1, segments, segments);

    const placeholders = document.querySelectorAll('.photo-placeholder');

    placeholders.forEach((placeholder) => {
      const photoId = placeholder.dataset.photoId;
      const photo = WEDDING_GALLERY.find(p => p.id === photoId);
      if (!photo) return;

      const isFullWidth = photo.id === 'bride-01' || photo.id === 'bride-02';

      // Load texture with crisp filtering
      const maxAnisotropy = this.renderer.capabilities.getMaxAnisotropy();
      const texture = textureLoader.load(photo.src, (tex) => {
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.magFilter = THREE.LinearFilter;
        if (this.isMobile) {
          tex.generateMipmaps = false;
          tex.minFilter = THREE.LinearFilter;
          tex.anisotropy = 1;
        } else {
          tex.minFilter = THREE.LinearMipmapLinearFilter;
          tex.generateMipmaps = true;
          tex.anisotropy = maxAnisotropy;
        }
        tex.needsUpdate = true;
      });
      texture.anisotropy = this.isMobile ? 1 : maxAnisotropy;

      const uniforms = {
        uTexture: { value: texture },
        uVelocity: { value: 0.0 },
        uProgress: { value: 0.0 },
        uOpacity: { value: 0.0 },
        uParallax: { value: 0.0 },
        uTilt: { value: [0.0, 0.0] },
        uContainerAspect: { value: photo.aspectRatio },
        uImageAspect: { value: photo.aspectRatio },
        uFocalPoint: { value: [photo.focalPoint?.x ?? 0.5, photo.focalPoint?.y ?? 0.5] }
      };

      const material = new THREE.ShaderMaterial({
        vertexShader: PhotoMaterialShader.vertexShader,
        fragmentShader: PhotoMaterialShader.fragmentShader,
        uniforms: uniforms,
        transparent: true,
        depthWrite: false,
        side: THREE.FrontSide
      });

      const mesh = new THREE.Mesh(this.geometry, material);
      mesh.name = `mesh-${photo.id}`;
      mesh.visible = false;
      this.scene.add(mesh);

      const node = {
        id: photo.id,
        photo: photo,
        placeholder: placeholder,
        mesh: mesh,
        material: material,
        uniforms: uniforms,
        isFullWidth: isFullWidth,
        revealState: {
          progress: 0.0,
          opacity: 0.0,
          yOffset: 60,
          rotXOffset: 25 * (Math.PI / 180)
        },
        hover: {
          x: 0,
          y: 0,
          targetX: 0,
          targetY: 0
        }
      };

      if (!this.isMobile && !this.reducedMotion) {
        this.bindHover(node);
      }

      this.photoNodes.push(node);
      this.photoMap.set(photo.id, node);
    });
  }

  bindHover(node) {
    const el = node.placeholder;
    el.addEventListener('pointermove', (e) => {
      if (e.pointerType === 'touch') return;
      const rect = el.getBoundingClientRect();
      const px = ((e.clientX - rect.left) / rect.width - 0.5) * 2;
      const py = ((e.clientY - rect.top) / rect.height - 0.5) * 2;
      node.hover.targetX = px * 0.08;
      node.hover.targetY = -py * 0.08;
    }, { passive: true });

    el.addEventListener('pointerleave', () => {
      node.hover.targetX = 0;
      node.hover.targetY = 0;
    }, { passive: true });
  }

  getPhotoNode(id) {
    return this.photoMap.get(id);
  }

  setVelocity(v) {
    this.velocity = v;
  }

  setTilt(x, y) {
    this.globalTilt.targetX = x;
    this.globalTilt.targetY = y;
  }

  bindEvents() {
    this._onResize = () => this.onResize();
    window.addEventListener('resize', this._onResize, { passive: true });

    this._onMotionChange = (e) => {
      this.reducedMotion = e.matches;
    };
    this._motionMedia = window.matchMedia('(prefers-reduced-motion: reduce)');
    this._motionMedia.addEventListener('change', this._onMotionChange);

    this._onVisibilityChange = () => {
      this.isTabActive = !document.hidden;
    };
    document.addEventListener('visibilitychange', this._onVisibilityChange);

    if (window.IntersectionObserver && this.container) {
      this.intersectionObserver = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
          this.isVisible = entry.isIntersecting;
        });
      }, { rootMargin: '100px' });
      this.intersectionObserver.observe(this.container);
    }
  }

  onResize() {
    this.width = window.innerWidth;
    this.height = window.innerHeight;
    this.isMobile = isTouchOrMobile();
    if (this.isMobile || !this.renderer || !this.camera) return;

    const cameraZ = 1000;
    this.camera.fov = 2 * Math.atan((this.height / 2) / cameraZ) * (180 / Math.PI);
    this.camera.aspect = this.width / this.height;
    this.camera.updateProjectionMatrix();

    this.renderer.setSize(this.width, this.height);
    const maxRatio = this.isMobile ? 1.0 : 2.0;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, maxRatio));
  }

  /**
   * Called on every frame from the unified RAF loop (gsap.ticker)
   */
  update(deltaTime = 0.016) {
    // When on mobile/touch, completely skip the getBoundingClientRect reposition loop and WebGL renders
    if (this.isMobile || !this.isVisible || document.hidden || !this.isTabActive) return;

    const dt = Math.min(deltaTime || 0.016, 0.05);

    // Smooth global mobile/pointer tilt
    this.globalTilt.x += (this.globalTilt.targetX - this.globalTilt.x) * 0.08;
    this.globalTilt.y += (this.globalTilt.targetY - this.globalTilt.y) * 0.08;

    const vhHalf = this.height / 2;
    const vwHalf = this.width / 2;
    const maxTilt = this.reducedMotion ? 0 : (12 * Math.PI / 180);
    const mobileTiltAngle = this.reducedMotion ? 0 : (8 * Math.PI / 180); // Max ~8deg for mobile gyro

    let hasVisibleMesh = false;

    for (let i = 0; i < this.photoNodes.length; i++) {
      const node = this.photoNodes[i];
      const rect = node.placeholder.getBoundingClientRect();

      // Viewport culling: pause rendering for off-screen meshes
      if (rect.bottom < -80 || rect.top > this.height + 80) {
        if (node.mesh.visible) {
          node.mesh.visible = false;
        }
        continue;
      }

      node.mesh.visible = true;
      hasVisibleMesh = true;

      // 1. Position sync to DOM placeholder center
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const threeX = cx - vwHalf;
      const threeY = -(cy - vhHalf) + node.revealState.yOffset;

      // 2. Viewport center distance calculation
      const normY = (cy - vhHalf) / vhHalf;
      const normX = (cx - vwHalf) / vwHalf;
      const centerFactor = Math.max(0, 1 - Math.min(1, Math.abs(normY)));

      // 3. Scale:
      // For full-width photos (bride-01, bride-02), scale is clamped to 1.0 so it never exceeds 100vw!
      // For normal photos, gentle scale up to 1.04 when centered
      const scaleMultiplier = node.isFullWidth ? 1.0 : (1.0 + (centerFactor * 0.04));
      node.mesh.scale.set(
        rect.width * scaleMultiplier,
        rect.height * scaleMultiplier,
        1.0
      );

      // 4. Subtle Z push toward camera when centered
      const zPush = centerFactor * (node.isFullWidth ? 15 : 25);
      node.mesh.position.set(threeX, threeY, zPush);

      // 5. Depth tilt:
      const easedY = Math.sign(normY) * Math.pow(Math.abs(normY), 1.1);
      let rotX = this.reducedMotion ? 0 : (-easedY * maxTilt * 0.7);
      // For full-width photos, suppress rotY so edges never exceed viewport bounds
      let rotY = this.reducedMotion ? 0 : (normX * maxTilt * (node.isFullWidth ? 0.15 : 0.6));

      // Entrance reveal tilt
      rotX += node.revealState.rotXOffset;

      // Desktop hover tilt
      if (!this.isMobile && !this.reducedMotion) {
        node.hover.x += (node.hover.targetX - node.hover.x) * 0.1;
        node.hover.y += (node.hover.targetY - node.hover.y) * 0.1;
        rotX += node.hover.y;
        rotY += node.hover.x * (node.isFullWidth ? 0.2 : 1.0);
      }

      // Mobile tilt (max 8deg)
      if (!this.reducedMotion) {
        rotX += this.globalTilt.y * mobileTiltAngle;
        rotY += this.globalTilt.x * (node.isFullWidth ? mobileTiltAngle * 0.25 : mobileTiltAngle);
      }

      node.mesh.rotation.set(rotX, rotY, 0);

      // 6. Shader uniforms
      node.uniforms.uVelocity.value = this.reducedMotion ? 0 : this.velocity;
      node.uniforms.uOpacity.value = node.revealState.opacity;
      node.uniforms.uProgress.value = node.revealState.progress;
      node.uniforms.uParallax.value = this.reducedMotion ? 0 : (normY * 0.035);

      // Dynamic tilt vector for UV parallax (3-4% opposite to tilt) and moving light sheen
      const sharedTiltX = this.globalTilt.x + (node.hover.x * 4.0);
      const sharedTiltY = this.globalTilt.y - (node.hover.y * 4.0);
      node.uniforms.uTilt.value = [sharedTiltX, sharedTiltY];

      // Update aspect ratios and focal point dynamically for full-width support
      node.uniforms.uContainerAspect.value = rect.width / (rect.height || 1);
      node.uniforms.uImageAspect.value = node.photo.aspectRatio;
      node.uniforms.uFocalPoint.value = [
        node.photo.focalPoint?.x ?? 0.5,
        node.photo.focalPoint?.y ?? 0.5
      ];
    }

    if (hasVisibleMesh) {
      this.renderer.render(this.scene, this.camera);
    }
  }

  dispose() {
    if (this.intersectionObserver) {
      this.intersectionObserver.disconnect();
      this.intersectionObserver = null;
    }
    if (this._onResize) {
      window.removeEventListener('resize', this._onResize);
    }
    if (this._onMotionChange && this._motionMedia) {
      this._motionMedia.removeEventListener('change', this._onMotionChange);
    }
    if (this._onVisibilityChange) {
      document.removeEventListener('visibilitychange', this._onVisibilityChange);
    }
    if (this.renderer) {
      this.renderer.dispose();
      if (this.renderer.domElement && this.renderer.domElement.parentNode) {
        this.renderer.domElement.parentNode.removeChild(this.renderer.domElement);
      }
    }
  }
}
