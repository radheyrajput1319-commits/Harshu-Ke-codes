import * as THREE from 'three';
import { getSharedFlowerAtlas } from './FlowerAtlas.js';
import { isTouchOrMobile } from '../utils/device.js';

export const FALLING_PETALS_CONFIG = {
  // Petal density counts (tweak these values to adjust ambient drift density)
  desktopCount: 150,              // raised from 48 to 150 for lush, continuous ambient drift
  mobileCount: 22,                // reduced from 70 to 22 for lightweight mobile drift
  sizeRangeDesktop: [14, 28],     // graceful petal sizes
  sizeRangeMobile: [10, 22],
  opacityRange: [0.55, 0.92],     // rich botanical visibility
  fallDurationRange: [7.5, 15.0], // gentle drifting fall duration (seconds)
  swayAmpRange: [20, 58],         // organic lateral sway amplitude
  swayFreqRange: [0.6, 1.4],      // sway oscillation speed
  spinSpeedRange: [0.4, 1.8],     // 3D tumble speed
  palette: [
    '#e8a33d', // marigold orange
    '#d9822b', // deep marigold
    '#e8a0a8', // rose pink
    '#f4c9c6', // blush
    '#fffaf0', // jasmine ivory
    '#b8975a', // gold accent
    '#a9b79a', // sage green
  ]
};

/**
 * FallingPetals
 * Full-viewport, subtle ambient petal layer that drifts gently across the page.
 * Uses an OrthographicCamera and an InstancedMesh with 100% vertex shader motion.
 */
export class FallingPetals {
  constructor(options = {}) {
    this.options = { ...FALLING_PETALS_CONFIG, ...options };
    this.width = window.innerWidth;
    this.height = window.innerHeight;
    this.isMobile = isTouchOrMobile();
    this.reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    this.isActive = !this.reducedMotion;
    this.isPaused = false;
    this.isVisible = true;
    this.isTabActive = !document.hidden;

    // Active scroll detection on mobile: pause rendering during swipe to free up 100% compositor thread
    this.isScrolling = false;
    this.scrollStopTimeout = null;
    this._onScrollActivity = null;

    if (this.isMobile) {
      this._onScrollActivity = () => {
        this.isScrolling = true;
        clearTimeout(this.scrollStopTimeout);
        this.scrollStopTimeout = setTimeout(() => {
          this.isScrolling = false;
        }, 90);
      };
      window.addEventListener('scroll', this._onScrollActivity, { passive: true });
    }

    // Intensity fades out to 0 during GATHERING
    this.intensity = 1.0;
    this.targetIntensity = 1.0;
    this.intensityLerpSpeed = 1.2;

    this.scrollVelocity = 0;

    this.canvas = null;
    this.renderer = null;
    this.scene = null;
    this.camera = null;
    this.mesh = null;
    this.material = null;
    this.geometry = null;

    this._onResize = this.resize.bind(this);
    this._onVisibilityChange = this.onVisibilityChange.bind(this);

    this.init();
  }

  init() {
    if (this.reducedMotion) return;

    this.createCanvas();
    this.initScene();
    this.initCamera();
    this.initRenderer();
    this.createPetals();
    this.bindEvents();
  }

  createCanvas() {
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'ambient-falling-petals-canvas';
    this.canvas.setAttribute('aria-hidden', 'true');
    document.body.appendChild(this.canvas);
  }

  initScene() {
    this.scene = new THREE.Scene();
    this.scene.background = null;
  }

  initCamera() {
    // Orthographic camera in CSS pixel coordinates centered at (0, 0)
    const halfW = this.width / 2;
    const halfH = this.height / 2;
    this.camera = new THREE.OrthographicCamera(-halfW, halfW, halfH, -halfH, -1000, 1000);
    this.camera.position.set(0, 0, 100);
    this.camera.lookAt(0, 0, 0);
  }

  initRenderer() {
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      alpha: true,
      antialias: false,
      powerPreference: 'high-performance'
    });
    this.renderer.setSize(this.width, this.height, false);
    const maxRatio = this.isMobile ? 1.0 : 2.0;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, maxRatio));
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
  }

  createPetals() {
    const count = this.isMobile ? this.options.mobileCount : this.options.desktopCount;
    this.count = count;
    this.geometry = new THREE.PlaneGeometry(1, 1, 1, 1);

    const atlasData = getSharedFlowerAtlas();
    this.atlasTexture = atlasData.texture;

    const spawnPos = new Float32Array(count * 2);    // x, y initial
    const petalScale = new Float32Array(count * 2);  // w, h
    const motionParams = new Float32Array(count * 4);// speed, swayAmp, swayFreq, swayPhase
    const spinParams = new Float32Array(count * 4);  // spinX, spinY, spinZ, baseRotZ
    const atlasUV = new Float32Array(count * 4);     // uOff, vOff, uScale, vScale
    const colorTint = new Float32Array(count * 4);   // r, g, b, alpha

    const [minSize, maxSize] = this.isMobile
      ? this.options.sizeRangeMobile
      : this.options.sizeRangeDesktop;

    const [minDur, maxDur] = this.options.fallDurationRange;
    const paletteColors = this.options.palette.map(hex => new THREE.Color(hex));

    const cols = atlasData.cols;
    const rows = atlasData.rows;
    const totalTypes = atlasData.totalTypes;

    for (let i = 0; i < count; i++) {
      const i2 = i * 2;
      const i4 = i * 4;

      // Depth layer: 0 = far, 1 = mid, 2 = near
      const depthLayer = i % 3;
      const depthFactor = depthLayer === 0 ? 0.72 : depthLayer === 1 ? 0.90 : 1.12;

      // Spawn distribution across screen
      spawnPos[i2 + 0] = (Math.random() - 0.5) * this.width;
      spawnPos[i2 + 1] = (Math.random() - 0.5) * (this.height + 120);

      // Petal size
      const sizeNorm = Math.random();
      const baseSize = THREE.MathUtils.lerp(minSize, maxSize, sizeNorm) * depthFactor;
      // Slight aspect ratio variations for organic feel
      const aspect = 0.9 + Math.random() * 0.25;
      petalScale[i2 + 0] = baseSize;
      petalScale[i2 + 1] = baseSize * aspect;

      // Fall speed: px per second
      const fallDur = THREE.MathUtils.lerp(minDur, maxDur, Math.random()) / depthFactor;
      const speed = this.height / fallDur;

      const swayAmp = THREE.MathUtils.lerp(
        this.options.swayAmpRange[0],
        this.options.swayAmpRange[1],
        Math.random()
      ) * depthFactor;

      const swayFreq = THREE.MathUtils.lerp(
        this.options.swayFreqRange[0],
        this.options.swayFreqRange[1],
        Math.random()
      );

      const swayPhase = Math.random() * Math.PI * 2;

      motionParams[i4 + 0] = speed;
      motionParams[i4 + 1] = swayAmp;
      motionParams[i4 + 2] = swayFreq;
      motionParams[i4 + 3] = swayPhase;

      // 3D tumble rates
      const [minSpin, maxSpin] = this.options.spinSpeedRange;
      spinParams[i4 + 0] = (Math.random() - 0.5) * 2 * THREE.MathUtils.lerp(minSpin, maxSpin, Math.random());
      spinParams[i4 + 1] = (Math.random() - 0.5) * 2 * THREE.MathUtils.lerp(minSpin, maxSpin, Math.random());
      spinParams[i4 + 2] = (Math.random() - 0.5) * 2 * THREE.MathUtils.lerp(minSpin, maxSpin, Math.random());
      spinParams[i4 + 3] = Math.random() * Math.PI * 2;

      // Choose flower / petal sprite
      // Single loose petal (type 2) or small blossoms (type 0, 3, 5) preferred for drifting
      const preferredTypes = [0, 2, 2, 2, 3, 4, 5];
      const spriteType = preferredTypes[Math.floor(Math.random() * preferredTypes.length)] % totalTypes;
      const col = spriteType % cols;
      const row = Math.floor(spriteType / cols);
      const uScale = 1.0 / cols;
      const vScale = 1.0 / rows;
      atlasUV[i4 + 0] = col * uScale;
      atlasUV[i4 + 1] = 1.0 - (row + 1) * vScale;
      atlasUV[i4 + 2] = uScale;
      atlasUV[i4 + 3] = vScale;

      // Color tint & base alpha
      const color = paletteColors[Math.floor(Math.random() * paletteColors.length)];
      const baseAlpha = THREE.MathUtils.lerp(
        this.options.opacityRange[0],
        this.options.opacityRange[1],
        Math.random()
      ) * (depthLayer === 0 ? 0.75 : depthLayer === 1 ? 0.88 : 1.0);

      colorTint[i4 + 0] = color.r;
      colorTint[i4 + 1] = color.g;
      colorTint[i4 + 2] = color.b;
      colorTint[i4 + 3] = baseAlpha;
    }

    this.geometry.setAttribute('aSpawnPos', new THREE.InstancedBufferAttribute(spawnPos, 2));
    this.geometry.setAttribute('aPetalScale', new THREE.InstancedBufferAttribute(petalScale, 2));
    this.geometry.setAttribute('aMotionParams', new THREE.InstancedBufferAttribute(motionParams, 4));
    this.geometry.setAttribute('aSpinParams', new THREE.InstancedBufferAttribute(spinParams, 4));
    this.geometry.setAttribute('aAtlasUV', new THREE.InstancedBufferAttribute(atlasUV, 4));
    this.geometry.setAttribute('aColorTint', new THREE.InstancedBufferAttribute(colorTint, 4));

    this.material = new THREE.ShaderMaterial({
      uniforms: {
        uTexture: { value: this.atlasTexture },
        uTime: { value: 0.0 },
        uViewport: { value: new THREE.Vector2(this.width, this.height) },
        uScrollVelocity: { value: 0.0 },
        uIntensity: { value: 1.0 }
      },
      vertexShader: `
        attribute vec2 aSpawnPos;
        attribute vec2 aPetalScale;
        attribute vec4 aMotionParams; // speed, swayAmp, swayFreq, swayPhase
        attribute vec4 aSpinParams;   // spinX, spinY, spinZ, baseRotZ
        attribute vec4 aAtlasUV;
        attribute vec4 aColorTint;    // r, g, b, alpha

        uniform float uTime;
        uniform vec2 uViewport;
        uniform float uScrollVelocity;
        uniform float uIntensity;

        varying vec2 vUv;
        varying vec4 vColor;
        varying vec2 vWorldPos;

        void main() {
          vUv = aAtlasUV.xy + uv * aAtlasUV.zw;
          vColor = aColorTint;

          float speed = aMotionParams.x;
          float swayAmp = aMotionParams.y;
          float swayFreq = aMotionParams.z;
          float swayPhase = aMotionParams.w;

          float margin = 70.0;
          float totalTravel = uViewport.y + margin * 2.0;

          // Continuous downward fall with wrapping
          float dist = uTime * speed;
          float topEdge = uViewport.y * 0.5 + margin;
          float rawY = topEdge - mod(dist + aSpawnPos.y, totalTravel);

          // Horizontal sway + subtle scroll parallax nudge
          float rawX = aSpawnPos.x + sin(uTime * swayFreq + swayPhase) * swayAmp;
          rawX += uScrollVelocity * 8.0;

          // Wrap X if drifting too far offscreen
          float halfW = uViewport.x * 0.5 + margin;
          float totalW = halfW * 2.0;
          rawX = mod(rawX + halfW, totalW) - halfW;

          vWorldPos = vec2(rawX, rawY);

          // 3D tumble rotation of local quad
          vec3 localVertex = vec3(position.xy * aPetalScale, 0.0);

          float rotX = uTime * aSpinParams.x;
          float rotY = uTime * aSpinParams.y;
          float rotZ = uTime * aSpinParams.z + aSpinParams.w;

          // Pitch (X)
          float cx = cos(rotX);
          float sx = sin(rotX);
          localVertex.yz = mat2(cx, -sx, sx, cx) * localVertex.yz;

          // Yaw (Y)
          float cy = cos(rotY);
          float sy = sin(rotY);
          localVertex.xz = mat2(cy, sy, -sy, cy) * localVertex.xz;

          // Roll (Z)
          float cz = cos(rotZ);
          float sz = sin(rotZ);
          localVertex.xy = mat2(cz, -sz, sz, cz) * localVertex.xy;

          vec3 finalPos = vec3(rawX, rawY, 0.0) + localVertex;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(finalPos, 1.0);
        }
      `,
      fragmentShader: `
        uniform sampler2D uTexture;
        uniform vec2 uViewport;
        uniform float uIntensity;

        varying vec2 vUv;
        varying vec4 vColor;
        varying vec2 vWorldPos;

        void main() {
          vec4 texColor = texture2D(uTexture, vUv);

          if (texColor.a < 0.04) {
            discard;
          }

          // Soft fade in/out at top and bottom edges of viewport
          float normY = (vWorldPos.y + uViewport.y * 0.5) / uViewport.y;
          float edgeFade = smoothstep(0.0, 0.08, normY) * smoothstep(1.0, 0.92, normY);

          // Subtly tint procedural sprite with festive wedding tone
          vec3 blendedRgb = mix(texColor.rgb, texColor.rgb * vColor.rgb, 0.28);
          float finalAlpha = texColor.a * vColor.a * uIntensity * edgeFade;

          gl_FragColor = vec4(blendedRgb, finalAlpha);
        }
      `,
      transparent: true,
      depthWrite: false,
      depthTest: false,
      blending: THREE.NormalBlending
    });

    this.mesh = new THREE.InstancedMesh(this.geometry, this.material, count);
    this.mesh.frustumCulled = false;
    this.scene.add(this.mesh);
  }

  bindEvents() {
    window.addEventListener('resize', this._onResize, { passive: true });
    document.addEventListener('visibilitychange', this._onVisibilityChange);
  }

  setIntensity(val) {
    // Target intensity (0..1)
    this.targetIntensity = Math.max(0.0, Math.min(1.0, val));
  }

  setScrollVelocity(vel) {
    this.scrollVelocity = vel;
  }

  setPaused(paused) {
    this.isPaused = Boolean(paused);
  }

  onVisibilityChange() {
    this.isTabActive = !document.hidden;
  }

  resize() {
    if (!this.canvas || !this.renderer || !this.camera) return;

    this.width = window.innerWidth;
    this.height = window.innerHeight;
    this.isMobile = isTouchOrMobile();

    this.renderer.setSize(this.width, this.height, false);
    const maxRatio = this.isMobile ? 1.0 : 2.0;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, maxRatio));

    const halfW = this.width / 2;
    const halfH = this.height / 2;
    this.camera.left = -halfW;
    this.camera.right = halfW;
    this.camera.top = halfH;
    this.camera.bottom = -halfH;
    this.camera.updateProjectionMatrix();

    if (this.material && this.material.uniforms.uViewport) {
      this.material.uniforms.uViewport.value.set(this.width, this.height);
    }
  }

  update(deltaTime) {
    if (!this.isActive || this.isPaused || !this.isTabActive || !this.isVisible || document.hidden) return;

    // Skip rendering updates while user is actively scrolling on mobile to keep 60fps native compositor speed
    if (this.isMobile && this.isScrolling) return;

    const dt = Math.min(deltaTime || 0.016, 0.05);

    // Smooth lerp to target intensity
    if (Math.abs(this.intensity - this.targetIntensity) > 0.001) {
      this.intensity += (this.targetIntensity - this.intensity) * Math.min(dt * this.intensityLerpSpeed, 1.0);
    } else {
      this.intensity = this.targetIntensity;
    }

    // When fully faded out, skip GPU rendering completely
    if (this.intensity <= 0.002) return;

    if (this.material) {
      this.material.uniforms.uTime.value += dt;
      this.material.uniforms.uIntensity.value = this.intensity;
      // Gently damp scroll velocity influence
      this.scrollVelocity *= 0.92;
      this.material.uniforms.uScrollVelocity.value = this.scrollVelocity;
    }

    this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    window.removeEventListener('resize', this._onResize);
    document.removeEventListener('visibilitychange', this._onVisibilityChange);
    clearTimeout(this.scrollStopTimeout);
    if (this._onScrollActivity) {
      window.removeEventListener('scroll', this._onScrollActivity);
    }

    if (this.geometry) this.geometry.dispose();
    if (this.material) this.material.dispose();
    if (this.renderer) {
      this.renderer.dispose();
      if (this.canvas && this.canvas.parentNode) {
        this.canvas.parentNode.removeChild(this.canvas);
      }
    }

    this.scene = null;
    this.camera = null;
    this.renderer = null;
  }
}
