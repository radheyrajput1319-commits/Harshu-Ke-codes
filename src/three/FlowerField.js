import * as THREE from 'three';
import { getSharedFlowerAtlas } from './FlowerAtlas.js';
import { isTouchOrMobile } from '../utils/device.js';

/**
 * FLOWER FINALE CONFIGURATION
 * Tweak these parameters to adjust particle density, wave geometry,
 * gather speeds, pointer responsiveness, and colors.
 */
export const CONFIG = {
  // Density: Lusion-style ultra-dense small particle bed
  particleCountDesktop: 22000,   // ~22,000 for lavish desktop particle bed
  particleCountMobile: 4500,     // reduced to lowest count for lightweight mobile performance

  palette: [
    '#e8a33d', // marigold orange
    '#d9822b', // deep marigold
    '#e8a0a8', // rose pink
    '#f4c9c6', // blush
    '#fffaf0', // jasmine ivory
    '#b8975a', // gold accent
    '#a9b79a', // sage green
  ],

  // Small flower particle size (8-16px) with organic random variation
  flowerSizeRange: [8, 16],
  waveHeight: 26.0,              // rolling organic wave amplitude
  waveSpeed: 0.95,               // idle wave flow speed
  mouseRadius: 180.0,           // interaction radius for crater formation
  mouseStrength: 75.0,          // lateral push displacement strength
  damping: 0.92,                // pointer velocity damping & smooth spring-back

  // State Machine Timings
  gatherDuration: 4.0,          // total gather phase duration in seconds
  gatherHoldDuration: 0.4,      // hold in GATHERED before awaken ripple
  rippleDuration: 1.25,         // awaken ripple expansion duration
  intersectionThreshold: 0.35,  // starts GATHERING when ~35% visible

  fieldHeightPercent: 0.52      // flowers occupy bottom ~52% of the finale zone, leaving headline clear
};

export const STATES = {
  FALLING: 'FALLING',         // ambient petals active; finale hidden/waiting
  GATHERING: 'GATHERING',     // ambient fading out; flowers falling into pile
  GATHERED: 'GATHERED',       // flowers settled; undulating wave holding
  INTERACTIVE: 'INTERACTIVE'  // awakened ripple fired; pointer reactive
};

/**
 * FlowerField
 * Renders the 3D Flower Finale at #sec-flower-finale at the bottom of the page.
 * Manages the 4-phase state machine, GPU gather fall-in, awaken ripple,
 * and Lusion-style fluid pointer ribbons and splashes.
 */
export class FlowerField {
  constructor(containerElement, options = {}) {
    this.container = containerElement;
    this.options = { ...CONFIG, ...options };

    this.width = containerElement.clientWidth || window.innerWidth;
    this.height = containerElement.clientHeight || window.innerHeight;
    this.isMobile = isTouchOrMobile();
    this.reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    this.state = this.reducedMotion ? STATES.INTERACTIVE : STATES.FALLING;
    this.stateListeners = [];

    this.isActive = true;
    this.isVisible = true;
    this.isTabActive = !document.hidden;

    // Phase timers
    this.gatherTimer = 0;
    this.rippleTimer = 0;

    // Pointer trail uniform array (24 points)
    this.trailLength = 24;
    this.trailUniforms = [];
    this.metaUniforms = [];
    this.trailIndex = 0;

    for (let i = 0; i < this.trailLength; i++) {
      this.trailUniforms.push(new THREE.Vector4(0, 0, 0, 0)); // x, y, vx, vy
      this.metaUniforms.push(new THREE.Vector2(0, 0));       // age (0..1), active (0 or 1)
    }

    this.lastPointerX = null;
    this.lastPointerY = null;
    this.smoothedVx = 0;
    this.smoothedVy = 0;
    this.lastPointerTime = performance.now();
    this.timeSinceLastPointer = 0;

    // Breeze & tilt bias
    this.breezeTimer = 0;
    this.tiltBias = new THREE.Vector2(0, 0);

    // Three.js core
    this.canvas = null;
    this.renderer = null;
    this.scene = null;
    this.camera = null;
    this.geometry = null;
    this.material = null;
    this.instancedMesh = null;
    this.atlasTexture = null;

    // Sloped field plane for raycasting
    this.fieldPlane = new THREE.Plane();
    this.raycaster = new THREE.Raycaster();
    this._tempVec = new THREE.Vector3();

    this._onPointerMove = this.onPointerMove.bind(this);
    this._onTouchMove = this.onTouchMove.bind(this);
    this._onResize = this.resize.bind(this);
    this._onVisibilityChange = this.onVisibilityChange.bind(this);

    this.init();
  }

  init() {
    if (!this.container) return;

    this.createCanvas();
    this.initScene();
    this.initCamera();
    this.initRenderer();
    this.updateFieldPlane();
    this.loadTextureAtlas();
    this.createInstancedField();
    this.bindEvents();
  }

  createCanvas() {
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'flower-finale-canvas';
    this.canvas.setAttribute('aria-hidden', 'true');
    this.container.appendChild(this.canvas);
  }

  initScene() {
    this.scene = new THREE.Scene();
    this.scene.background = null;
  }

  initCamera() {
    // Perspective camera looking across the sloped flower meadow
    const cameraZ = 1000;
    const fov = 2 * Math.atan((this.height / 2) / cameraZ) * (180 / Math.PI);

    this.camera = new THREE.PerspectiveCamera(fov, this.width / this.height, 1, 3500);
    this.camera.position.set(0, this.height * 0.12, cameraZ);
    this.camera.lookAt(0, -this.height * 0.22, 0);
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

  updateFieldPlane() {
    const bottomY = -this.height * 0.54;
    const topY = this.height * (this.options.fieldHeightPercent - 0.5);

    const p1 = new THREE.Vector3(0, bottomY, 70);
    const p2 = new THREE.Vector3(0, topY, -320);
    const p3 = new THREE.Vector3(this.width * 0.5, bottomY, 70);

    this.fieldPlane.setFromCoplanarPoints(p1, p2, p3);
  }

  loadTextureAtlas() {
    const atlasData = getSharedFlowerAtlas();
    this.atlasTexture = atlasData.texture;
    this.atlasCols = atlasData.cols;
    this.atlasRows = atlasData.rows;
    this.atlasTotalTypes = atlasData.totalTypes;
  }

  createInstancedField() {
    const count = this.isMobile
      ? this.options.particleCountMobile
      : this.options.particleCountDesktop;
    this.particleCount = count;

    this.geometry = new THREE.PlaneGeometry(1, 1, 1, 1);

    const instancePos = new Float32Array(count * 3);
    const instanceScale = new Float32Array(count * 2);
    const instanceRot = new Float32Array(count * 3);
    const instanceRandom = new Float32Array(count * 4);
    const atlasUV = new Float32Array(count * 4);
    const instanceColor = new Float32Array(count * 3);

    // Attributes for GATHER fall-in
    const gatherTiming = new Float32Array(count * 2); // delay, duration
    const spawnOffset = new Float32Array(count * 3);  // offsetX, offsetY, offsetZ

    const paletteColors = this.options.palette.map(hex => new THREE.Color(hex));
    const bottomY = -this.height * 0.54;
    const topY = this.height * (this.options.fieldHeightPercent - 0.5);
    // Extra generous width bleed to eliminate any box or rectangular edge shape
    const fieldW = this.width * 1.55;

    const [minSize, maxSize] = this.options.flowerSizeRange;

    for (let i = 0; i < count; i++) {
      const i3 = i * 3;
      const i2 = i * 2;
      const i4 = i * 4;

      // X spans wide across [-fieldW/2, fieldW/2]
      const px = (Math.random() - 0.5) * fieldW;

      // Top surface silhouette: multi-frequency undulating hill curves
      // This prevents ANY flat or rectangular ceiling line
      const hill1 = Math.sin(px * 0.0022) * 48.0;
      const hill2 = Math.cos(px * 0.0051 + 1.2) * 26.0;
      const hill3 = Math.sin(px * 0.0094 - 0.7) * 14.0;
      const localTopY = topY + (hill1 + hill2 + hill3);

      // Density distribution: power curve concentrates ~80%+ of flowers
      // at the bottom bed, thinning smoothly toward the top wave crest
      const yNorm = Math.pow(Math.random(), 2.3);
      const layerY = (Math.random() - 0.5) * 24.0;
      const py = THREE.MathUtils.lerp(bottomY, localTopY, yNorm) + layerY;

      // Volumetric 3D depth layering: physical bedding in Z
      const layerDepth = (Math.random() - 0.5) * 85.0;
      const pz = THREE.MathUtils.lerp(85.0, -320.0, yNorm) + layerDepth;

      instancePos[i3 + 0] = px;
      instancePos[i3 + 1] = py;
      instancePos[i3 + 2] = pz;

      // Delicate small botanical scale (8-16px) with organic random variation
      const sizeNorm = Math.pow(Math.random(), 1.2);
      const baseSize = THREE.MathUtils.lerp(minSize, maxSize, sizeNorm);
      // Subtle depth perspective scaling
      const distScale = THREE.MathUtils.lerp(1.15, 0.78, yNorm);
      instanceScale[i2 + 0] = baseSize * distScale;
      instanceScale[i2 + 1] = baseSize * distScale;

      // Natural resting 3D rotations
      instanceRot[i3 + 0] = (Math.random() - 0.5) * 0.45;
      instanceRot[i3 + 1] = (Math.random() - 0.5) * 0.45;
      instanceRot[i3 + 2] = Math.random() * Math.PI * 2;

      // Random factors for per-particle harmonic offsets
      instanceRandom[i4 + 0] = Math.random();
      instanceRandom[i4 + 1] = Math.random();
      instanceRandom[i4 + 2] = Math.random();
      instanceRandom[i4 + 3] = Math.random();

      // Gather fall-in: staggered entrance
      gatherTiming[i2 + 0] = Math.random() * 2.3;
      gatherTiming[i2 + 1] = 1.3 + Math.random() * 0.6;

      // Spawn location high above the top of the zone
      spawnOffset[i3 + 0] = (Math.random() - 0.5) * 100;
      spawnOffset[i3 + 1] = 220 + Math.random() * 160;
      spawnOffset[i3 + 2] = (Math.random() - 0.5) * 80;

      // Atlas sprite
      const spriteType = Math.floor(Math.random() * this.atlasTotalTypes);
      const col = spriteType % this.atlasCols;
      const row = Math.floor(spriteType / this.atlasCols);
      const uScale = 1.0 / this.atlasCols;
      const vScale = 1.0 / this.atlasRows;
      atlasUV[i4 + 0] = col * uScale;
      atlasUV[i4 + 1] = 1.0 - (row + 1) * vScale;
      atlasUV[i4 + 2] = uScale;
      atlasUV[i4 + 3] = vScale;

      // Color tint from wedding palette
      const chosenColor = paletteColors[Math.floor(Math.random() * paletteColors.length)];
      instanceColor[i3 + 0] = chosenColor.r;
      instanceColor[i3 + 1] = chosenColor.g;
      instanceColor[i3 + 2] = chosenColor.b;
    }

    this.geometry.setAttribute('aInstancePos', new THREE.InstancedBufferAttribute(instancePos, 3));
    this.geometry.setAttribute('aInstanceScale', new THREE.InstancedBufferAttribute(instanceScale, 2));
    this.geometry.setAttribute('aInstanceRot', new THREE.InstancedBufferAttribute(instanceRot, 3));
    this.geometry.setAttribute('aInstanceRandom', new THREE.InstancedBufferAttribute(instanceRandom, 4));
    this.geometry.setAttribute('aAtlasUV', new THREE.InstancedBufferAttribute(atlasUV, 4));
    this.geometry.setAttribute('aInstanceColor', new THREE.InstancedBufferAttribute(instanceColor, 3));
    this.geometry.setAttribute('aGatherTiming', new THREE.InstancedBufferAttribute(gatherTiming, 2));
    this.geometry.setAttribute('aSpawnOffset', new THREE.InstancedBufferAttribute(spawnOffset, 3));

    // Custom ShaderMaterial with 100% GPU vertex calculations
    this.material = new THREE.ShaderMaterial({
      uniforms: {
        uTexture: { value: this.atlasTexture },
        uTime: { value: 0.0 },
        uWaveHeight: { value: this.isMobile ? this.options.waveHeight * 0.7 : this.options.waveHeight },
        uWaveSpeed: { value: this.options.waveSpeed },
        uMouseRadius: { value: this.isMobile ? this.options.mouseRadius * 0.8 : this.options.mouseRadius },
        uMouseStrength: { value: this.isMobile ? this.options.mouseStrength * 0.8 : this.options.mouseStrength },
        uPointerTrail: { value: this.trailUniforms },
        uPointerMeta: { value: this.metaUniforms },
        uFieldBounds: {
          value: new THREE.Vector4(-fieldW * 0.5, fieldW * 0.5, bottomY, topY)
        },
        uBreezeProgress: { value: 0.0 },
        uBreezeStrength: { value: 0.0 },
        uTiltBias: { value: this.tiltBias },
        uReducedMotion: { value: this.reducedMotion ? 1.0 : 0.0 },

        // State Machine Uniforms
        uState: { value: this.reducedMotion ? 3.0 : 0.0 }, // 0=FALLING, 1=GATHERING, 2=GATHERED, 3=INTERACTIVE
        uGatherTime: { value: 0.0 },
        uRippleProgress: { value: 0.0 }
      },
      vertexShader: `
        attribute vec3 aInstancePos;
        attribute vec2 aInstanceScale;
        attribute vec3 aInstanceRot;
        attribute vec4 aInstanceRandom;
        attribute vec4 aAtlasUV;
        attribute vec3 aInstanceColor;
        attribute vec2 aGatherTiming; // delay, duration
        attribute vec3 aSpawnOffset;

        uniform float uTime;
        uniform float uWaveHeight;
        uniform float uWaveSpeed;
        uniform float uMouseRadius;
        uniform float uMouseStrength;
        uniform vec4 uPointerTrail[24];
        uniform vec2 uPointerMeta[24];
        uniform vec4 uFieldBounds;
        uniform float uBreezeProgress;
        uniform float uBreezeStrength;
        uniform vec2 uTiltBias;
        uniform float uReducedMotion;
        uniform float uState;
        uniform float uGatherTime;
        uniform float uRippleProgress;

        varying vec2 vUv;
        varying vec3 vColor;
        varying float vAlpha;
        varying float vTopFade;

        void main() {
          vUv = aAtlasUV.xy + uv * aAtlasUV.zw;
          vColor = aInstanceColor;

          vec3 basePos = aInstancePos;
          float fieldHeight = max(uFieldBounds.w - uFieldBounds.z, 1.0);
          float normY = clamp((basePos.y - uFieldBounds.z) / fieldHeight, 0.0, 1.0);

          // 1. Idle Harmonic Wave: Organic Rolling Swells
          float speedMul = uReducedMotion > 0.5 ? 0.2 : 1.0;
          float t = uTime * uWaveSpeed * speedMul;

          float wave1 = sin(basePos.x * 0.0028 + t * 0.9 + aInstanceRandom.x * 2.0) * cos(basePos.y * 0.0035 + t * 0.7);
          float wave2 = sin(basePos.x * 0.0062 - t * 0.55 + aInstanceRandom.y * 3.14) * 0.5;
          float wave3 = cos(basePos.x * 0.0016 + basePos.y * 0.0022 + t * 0.4) * 0.35;

          // Rolling swell amplitude increases toward the upper wave surface
          float surfaceFactor = 0.55 + 0.65 * smoothstep(0.1, 0.9, normY);
          float waveZ = (wave1 + wave2 + wave3) * uWaveHeight * surfaceFactor;
          float waveY = cos(basePos.x * 0.0032 + t * 0.5) * (uWaveHeight * 0.3 * surfaceFactor);
          float waveX = sin(basePos.y * 0.0038 + t * 0.4) * (uWaveHeight * 0.2 * surfaceFactor);

          vec3 restingPos = basePos + vec3(waveX, waveY, waveZ);

          // 2. Gather Phase Interpolation & Staggered Descent
          vec3 worldPos = restingPos;
          float spawnAlpha = 1.0;
          float fallTumble = 0.0;

          if (uReducedMotion < 0.5) {
            if (uState < 0.5) {
              // FALLING phase: finale particles waiting hidden above
              spawnAlpha = 0.0;
              worldPos.y += 700.0;
            } else if (uState < 2.5) {
              // GATHERING / GATHERED: particles fall into bed with staggered delay
              float delay = aGatherTiming.x;
              float duration = aGatherTiming.y;
              float localTime = uGatherTime - delay;

              if (localTime <= 0.0) {
                spawnAlpha = 0.0;
                worldPos.y += 700.0;
              } else {
                float progress = clamp(localTime / duration, 0.0, 1.0);
                spawnAlpha = smoothstep(0.0, 0.25, progress);

                vec3 spawnPos = vec3(basePos.x + aSpawnOffset.x, uFieldBounds.w + aSpawnOffset.y + 100.0, -220.0 + aSpawnOffset.z);

                // Cubic ease-out landing with soft damped settle
                float cubicOut = 1.0 - pow(1.0 - progress, 3.0);
                float bounce = sin(progress * 3.14159) * (1.0 - progress) * 0.14;

                worldPos = mix(spawnPos, restingPos, cubicOut);
                worldPos.z += bounce * 50.0;
                worldPos.y += bounce * 14.0;

                fallTumble = (1.0 - progress) * 2.8;
              }
            }
          }

          // 3. Awaken Ripple (INTERACTIVE entrance wave)
          if (uRippleProgress > 0.001 && uRippleProgress < 1.0 && uReducedMotion < 0.5) {
            float fieldW = uFieldBounds.y - uFieldBounds.x;
            vec2 rippleCenter = vec2(0.0, uFieldBounds.z + fieldHeight * 0.3);
            float dist = length(worldPos.xy - rippleCenter);
            float currentRadius = uRippleProgress * (fieldW * 0.65);
            float diff = abs(dist - currentRadius);

            float rippleAmp = sin((dist - currentRadius) * 0.038) * exp(-diff * 0.014);
            float fadeRipple = (1.0 - uRippleProgress);
            worldPos.z += rippleAmp * fadeRipple * 55.0;
            worldPos.y += rippleAmp * fadeRipple * 16.0;
          }

          // 4. Ambient Breeze Sweep & Tilt
          if (uReducedMotion < 0.5 && uState > 1.5) {
            float fieldW = uFieldBounds.y - uFieldBounds.x;
            float normX = (basePos.x - uFieldBounds.x) / max(fieldW, 1.0);
            float breezeDist = abs(normX - uBreezeProgress);
            float breezeGust = smoothstep(0.25, 0.0, breezeDist) * uBreezeStrength;
            worldPos.x += breezeGust * 22.0 + uTiltBias.x * 30.0;
            worldPos.y += breezeGust * 10.0 + uTiltBias.y * 18.0;
            worldPos.z += breezeGust * 28.0;
          }

          // 5. Pointer Interaction: Lusion-Style Crater with Raised Rim
          vec3 pointerDisp = vec3(0.0);
          float totalDisturb = 0.0;

          if (uState > 2.5 && uReducedMotion < 0.5) {
            float radius = max(uMouseRadius, 10.0);

            for (int i = 0; i < 24; i++) {
              if (uPointerMeta[i].y > 0.5) {
                vec2 trailPos = uPointerTrail[i].xy;
                vec2 trailVel = uPointerTrail[i].zw;
                float age = uPointerMeta[i].x; // 0 (fresh) -> 1 (expired)

                // Smooth cubic decay over lifetime (spring back smoothly when pointer leaves)
                float ageDecay = (1.0 - age) * (1.0 - age);

                vec2 diff = worldPos.xy - trailPos;
                float dist = length(diff);
                float rNorm = dist / radius;

                if (rNorm < 2.3) {
                  vec2 pushDir = (dist > 0.001) ? (diff / dist) : vec2(0.0, 1.0);
                  float speed = length(trailVel);
                  float speedFactor = clamp(1.0 + speed * 0.025, 1.0, 2.8);

                  // 1. Crater Radial Clearance:
                  // Radial push outward from center to rim.
                  // Peaks around rNorm ~ 0.55..0.75, pushing flowers outward toward rim
                  float radialPush = rNorm * exp(-rNorm * rNorm * 1.5) * uMouseStrength * speedFactor * ageDecay;

                  // Organic directional curl along cursor velocity
                  vec2 curl = vec2(-pushDir.y, pushDir.x) * sin(rNorm * 4.2 + aInstanceRandom.z * 6.28) * 0.22;
                  pointerDisp.xy += (pushDir + curl) * radialPush;

                  // 2. Crater Hollow (-Z, -Y) & Raised Rim (+Z, +Y):
                  // Center cavity: deep depression inside the hollow
                  float hollow = -exp(-rNorm * rNorm * 3.0) * (uMouseStrength * 0.45);
                  // Raised rim: crest around rNorm ~ 0.75..1.3 where displaced flowers pile up
                  float rim = sin(clamp((rNorm - 0.25) / 1.0, 0.0, 1.0) * 3.14159) * (uMouseStrength * 0.65);
                  float zProfile = (hollow + rim) * ageDecay * speedFactor;

                  pointerDisp.z += zProfile * 1.6;
                  pointerDisp.y += zProfile * 0.35;

                  totalDisturb += exp(-rNorm * rNorm) * ageDecay * speedFactor;
                }
              }
            }
          }

          worldPos += pointerDisp;

          // 6. Local Quad 3D Rotation & Tumbling
          vec3 localVertex = vec3(position.xy * aInstanceScale, 0.0);

          float rotX = aInstanceRot.x;
          float rotY = aInstanceRot.y;
          float rotZ = aInstanceRot.z;

          if (uReducedMotion < 0.5) {
            // Idle organic sway
            rotX += sin(t * 0.65 + aInstanceRandom.x * 6.28) * 0.12;
            rotY += cos(t * 0.55 + aInstanceRandom.y * 6.28) * 0.14;
            rotZ += sin(t * 0.45 + aInstanceRandom.z * 6.28) * 0.18;

            // Gathering descent tumble
            rotX += fallTumble * sin(uGatherTime * 2.0 + aInstanceRandom.w * 6.28);
            rotY += fallTumble * cos(uGatherTime * 1.8 + aInstanceRandom.x * 6.28);

            // Pointer disturbance tilt & tumble
            float tumbleScale = clamp(totalDisturb * 2.2, 0.0, 4.5);
            rotX += tumbleScale * sin(uTime * 3.5 + aInstanceRandom.w * 8.0);
            rotY += tumbleScale * cos(uTime * 3.0 + aInstanceRandom.x * 8.0);
            rotZ += tumbleScale * sin(uTime * 4.0 + aInstanceRandom.y * 8.0);
          }

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

          vec3 finalPos = worldPos + localVertex;

          // Soft organic fade into background cream - density thins out gracefully near top
          // Starts thinning from normY 0.40 up to 0.98 with an organic curve
          float organicNormY = normY + sin(basePos.x * 0.003 + aInstanceRandom.z * 3.14) * 0.08;
          vTopFade = smoothstep(0.98, 0.40, organicNormY);

          vAlpha = spawnAlpha;

          gl_Position = projectionMatrix * modelViewMatrix * vec4(finalPos, 1.0);
        }
      `,
      fragmentShader: `
        uniform sampler2D uTexture;
        varying vec2 vUv;
        varying vec3 vColor;
        varying float vAlpha;
        varying float vTopFade;

        void main() {
          vec4 texColor = texture2D(uTexture, vUv);

          if (texColor.a < 0.03) {
            discard;
          }

          vec3 blendedColor = mix(texColor.rgb, texColor.rgb * vColor, 0.28);
          float finalAlpha = texColor.a * vAlpha * vTopFade;

          gl_FragColor = vec4(blendedColor, finalAlpha);
        }
      `,
      transparent: true,
      depthWrite: false,
      depthTest: true,
      blending: THREE.NormalBlending,
      side: THREE.DoubleSide
    });

    this.instancedMesh = new THREE.InstancedMesh(this.geometry, this.material, count);
    this.instancedMesh.frustumCulled = false;
    this.scene.add(this.instancedMesh);
  }

  bindEvents() {
    window.addEventListener('pointermove', this._onPointerMove, { passive: true });
    window.addEventListener('touchmove', this._onTouchMove, { passive: true });
    window.addEventListener('resize', this._onResize, { passive: true });
    document.addEventListener('visibilitychange', this._onVisibilityChange);

    // IntersectionObserver triggers GATHERING when ~35% visible
    this.intersectionObserver = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        this.isVisible = entry.isIntersecting;

        if (entry.intersectionRatio >= this.options.intersectionThreshold || entry.isIntersecting) {
          if (this.state === STATES.FALLING) {
            this.transitionTo(STATES.GATHERING);
          }
        }
      });
    }, {
      rootMargin: '100px',
      threshold: [0.01, 0.2, 0.35, 0.5]
    });

    this.intersectionObserver.observe(this.container);
  }

  onStateChange(fn) {
    if (typeof fn === 'function') {
      this.stateListeners.push(fn);
    }
  }

  getState() {
    return this.state;
  }

  transitionTo(newState) {
    if (this.state === newState) return;
    this.state = newState;

    if (this.material && this.material.uniforms.uState) {
      const stateMap = {
        [STATES.FALLING]: 0.0,
        [STATES.GATHERING]: 1.0,
        [STATES.GATHERED]: 2.0,
        [STATES.INTERACTIVE]: 3.0
      };
      this.material.uniforms.uState.value = stateMap[newState] ?? 0.0;
    }

    this.stateListeners.forEach(listener => {
      try {
        listener(newState);
      } catch (e) {
        console.error('FlowerField state listener error:', e);
      }
    });
  }

  onPointerMove(e) {
    if (this.state !== STATES.INTERACTIVE) return;
    this.recordPointerInteraction(e.clientX, e.clientY);
  }

  onTouchMove(e) {
    if (this.state !== STATES.INTERACTIVE) return;
    if (e.touches && e.touches[0]) {
      this.recordPointerInteraction(e.touches[0].clientX, e.touches[0].clientY);
    }
  }

  recordPointerInteraction(clientX, clientY) {
    if (!this.container || !this.camera) return;

    const now = performance.now();
    const dt = Math.max((now - this.lastPointerTime) / 1000, 0.008);

    if (this.lastPointerX !== null) {
      const vx = (clientX - this.lastPointerX) / dt;
      const vy = (clientY - this.lastPointerY) / dt;
      this.smoothedVx = this.smoothedVx * 0.65 + vx * 0.35;
      this.smoothedVy = this.smoothedVy * 0.65 + vy * 0.35;
    }

    this.lastPointerX = clientX;
    this.lastPointerY = clientY;
    this.lastPointerTime = now;
    this.timeSinceLastPointer = 0;

    const rect = this.container.getBoundingClientRect();
    const ndcX = ((clientX - rect.left) / rect.width) * 2 - 1;
    const ndcY = -(((clientY - rect.top) / rect.height) * 2 - 1);

    this.raycaster.setFromCamera({ x: ndcX, y: ndcY }, this.camera);
    const hit = this.raycaster.ray.intersectPlane(this.fieldPlane, this._tempVec);

    if (hit) {
      const idx = this.trailIndex % this.trailLength;
      this.trailIndex++;

      const worldScale = (this.width / rect.width) * 0.15;
      this.trailUniforms[idx].set(
        hit.x,
        hit.y,
        this.smoothedVx * worldScale,
        -this.smoothedVy * worldScale
      );
      this.metaUniforms[idx].set(0.0, 1.0);
    }
  }

  setTilt(tiltX, tiltY) {
    this.tiltBias.set(tiltX * 0.8, -tiltY * 0.8);
    if (this.material && this.material.uniforms.uTiltBias) {
      this.material.uniforms.uTiltBias.value.copy(this.tiltBias);
    }
  }

  onVisibilityChange() {
    this.isTabActive = !document.hidden;
  }

  resize() {
    if (!this.container || !this.renderer || !this.camera) return;

    this.width = this.container.clientWidth || window.innerWidth;
    this.height = this.container.clientHeight || window.innerHeight;
    this.isMobile = isTouchOrMobile();

    this.renderer.setSize(this.width, this.height, false);
    const maxRatio = this.isMobile ? 1.0 : 2.0;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, maxRatio));

    const cameraZ = 1000;
    const fov = 2 * Math.atan((this.height / 2) / cameraZ) * (180 / Math.PI);
    this.camera.fov = fov;
    this.camera.aspect = this.width / this.height;
    this.camera.position.set(0, this.height * 0.12, cameraZ);
    this.camera.lookAt(0, -this.height * 0.22, 0);
    this.camera.updateProjectionMatrix();

    this.updateFieldPlane();

    if (this.material && this.material.uniforms.uFieldBounds) {
      const bottomY = -this.height * 0.54;
      const topY = this.height * (this.options.fieldHeightPercent - 0.5);
      const fieldW = this.width * 1.55;
      this.material.uniforms.uFieldBounds.value.set(-fieldW * 0.5, fieldW * 0.5, bottomY, topY);
    }
  }

  update(deltaTime) {
    if (!this.isActive || !this.isVisible || document.hidden || !this.isTabActive) return;

    const dt = Math.min(deltaTime || 0.016, 0.05);

    // Advance time uniform
    if (this.material && this.material.uniforms.uTime) {
      this.material.uniforms.uTime.value += dt;
    }

    // State machine driver
    if (this.state === STATES.GATHERING) {
      this.gatherTimer += dt;
      if (this.material && this.material.uniforms.uGatherTime) {
        this.material.uniforms.uGatherTime.value = this.gatherTimer;
      }

      if (this.gatherTimer >= this.options.gatherDuration) {
        this.transitionTo(STATES.GATHERED);
        this.gatherHoldTimer = 0;
      }
    } else if (this.state === STATES.GATHERED) {
      this.gatherHoldTimer = (this.gatherHoldTimer || 0) + dt;
      if (this.gatherHoldTimer >= this.options.gatherHoldDuration) {
        this.transitionTo(STATES.INTERACTIVE);
        this.rippleTimer = 0;
      }
    } else if (this.state === STATES.INTERACTIVE) {
      if (this.rippleTimer < this.options.rippleDuration) {
        this.rippleTimer += dt;
        const progress = Math.min(1.0, this.rippleTimer / this.options.rippleDuration);
        if (this.material && this.material.uniforms.uRippleProgress) {
          this.material.uniforms.uRippleProgress.value = progress;
        }
      }
    }

    // Age pointer trail points (smooth spring-back damping when pointer stops or leaves)
    for (let i = 0; i < this.trailLength; i++) {
      if (this.metaUniforms[i].y > 0.5) {
        this.metaUniforms[i].x += dt * 1.6;
        if (this.metaUniforms[i].x >= 1.0) {
          this.metaUniforms[i].y = 0.0;
        }
      }
    }

    // Mobile ambient breeze
    this.timeSinceLastPointer += dt;
    this.breezeTimer += dt;
    const breezePeriod = 5.0;
    const breezeProgress = (this.breezeTimer % breezePeriod) / breezePeriod;
    const isMobileBreeze = this.isMobile || this.timeSinceLastPointer > 2.0;
    const breezeStrength = isMobileBreeze ? Math.sin(breezeProgress * Math.PI) * 0.85 : 0.0;

    if (this.material) {
      if (this.material.uniforms.uBreezeProgress) {
        this.material.uniforms.uBreezeProgress.value = breezeProgress;
      }
      if (this.material.uniforms.uBreezeStrength) {
        this.material.uniforms.uBreezeStrength.value = breezeStrength;
      }
    }

    this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    window.removeEventListener('pointermove', this._onPointerMove);
    window.removeEventListener('touchmove', this._onTouchMove);
    window.removeEventListener('resize', this._onResize);
    document.removeEventListener('visibilitychange', this._onVisibilityChange);

    if (this.intersectionObserver) {
      this.intersectionObserver.disconnect();
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
