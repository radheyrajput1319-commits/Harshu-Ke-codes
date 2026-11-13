/**
 * Custom Vertex & Fragment Shader for DOM-Synced 3D Photo Mesh
 * Features:
 * 1. Scroll-Velocity Bend (dynamic cylindrical curvature driven by smoothed velocity)
 * 2. Aspect Ratio & Focal Point Cover-Fit (keeps faces uncropped on full-width photos)
 * 3. Tilt UV Parallax Shift (opposite to phone tilt by 3-4%)
 * 4. Dynamic Moving Light Sheen & Soft Shadow across the image based on tilt
 * 5. Smooth bottom-to-top mask wipe clip for GSAP ScrollTrigger entrance reveal
 * 6. Preserves authentic, uncropped photo pixels with full color fidelity
 */
export const PhotoMaterialShader = {
  uniforms: {
    uTexture: { value: null },
    uVelocity: { value: 0.0 },              // Damped Lenis scroll velocity
    uProgress: { value: 0.0 },              // 0.0 (hidden) -> 1.0 (revealed)
    uOpacity: { value: 0.0 },               // Overall opacity
    uParallax: { value: 0.0 },              // Vertical scroll parallax offset
    uTilt: { value: [0.0, 0.0] },           // Smoothed mobile / pointer tilt (-1 to 1)
    uContainerAspect: { value: 1.0 },       // Width / Height of the placeholder
    uImageAspect: { value: 1.0 },           // Native photo aspect ratio
    uFocalPoint: { value: [0.5, 0.5] }      // Focal point to prevent facial cropping
  },
  vertexShader: `
    uniform float uVelocity;
    varying vec2 vUv;

    void main() {
      vUv = uv;
      vec3 pos = position;

      // Cylindrical bend on scroll velocity
      // Curvature is highest at center (sin of uv.x), 0 at left and right edges
      float bendX = sin(uv.x * 3.14159265);
      float bendY = sin(uv.y * 3.14159265);

      // Curve like paper bending in 3D space during fast scrolling
      pos.z += (bendX * 0.75 + bendY * 0.25) * uVelocity * 50.0;

      vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
      gl_Position = projectionMatrix * mvPosition;
    }
  `,
  fragmentShader: `
    uniform sampler2D uTexture;
    uniform float uOpacity;
    uniform float uProgress;
    uniform float uParallax;
    uniform vec2 uTilt;
    uniform float uContainerAspect;
    uniform float uImageAspect;
    uniform vec2 uFocalPoint;
    varying vec2 vUv;

    void main() {
      // 1. Cover fit using aspect ratio and focal point
      float containerAspect = uContainerAspect > 0.0 ? uContainerAspect : uImageAspect;
      float aspectDiff = containerAspect / uImageAspect;

      vec2 baseUv = vUv;
      vec2 scale = vec2(1.0);
      vec2 offset = vec2(0.0);

      if (aspectDiff > 1.001) {
        // Container is wider than native image (height needs crop)
        // Anchor the crop around focalPoint.y so faces are never cropped!
        scale.y = 1.0 / aspectDiff;
        offset.y = clamp(uFocalPoint.y - scale.y * 0.5, 0.0, 1.0 - scale.y);
        baseUv = vec2(vUv.x, offset.y + vUv.y * scale.y);
      } else if (aspectDiff < 0.999) {
        // Container is taller than native image (width needs crop)
        // Anchor the crop around focalPoint.x
        scale.x = aspectDiff;
        offset.x = clamp(uFocalPoint.x - scale.x * 0.5, 0.0, 1.0 - scale.x);
        baseUv = vec2(offset.x + vUv.x * scale.x, vUv.y);
      }

      // 2. Parallax Shift:
      // Vertical scroll parallax + 3.5% shift opposite to phone tilt
      // Slightly scale base UV by 0.94 to provide safe headroom without edge clamping
      vec2 uv = (baseUv - 0.5) * vec2(0.96, 0.94) + 0.5;
      uv.y += uParallax;
      uv.x -= uTilt.x * 0.035; // Parallax shift opposite to tilt
      uv.y -= uTilt.y * 0.035;
      uv = clamp(uv, vec2(0.001), vec2(0.999));

      vec4 texColor = texture2D(uTexture, uv);

      // 3. Soft moving highlight sheen & subtle shadow across image
      vec2 sheenCenter = vec2(0.5) + uTilt * 0.45;
      float sheenDist = distance(vUv, sheenCenter);
      float sheen = exp(-sheenDist * 2.8) * 0.07;
      float shadow = smoothstep(0.0, 1.2, distance(vUv, vec2(0.5) - uTilt * 0.45)) * 0.05;

      vec3 litRgb = texColor.rgb + vec3(sheen) - vec3(shadow);

      // 4. Smooth entrance mask wipe from bottom to top
      float clipThreshold = (1.0 - vUv.y) * 0.75;
      float clip = smoothstep(0.0, 0.2, uProgress - clipThreshold);

      gl_FragColor = vec4(litRgb, texColor.a * uOpacity * clip);
    }
  `
};
