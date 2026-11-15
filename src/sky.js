import * as THREE from 'three';

const vertexShader = /* glsl */ `
  varying vec3 vDirection;
  void main() {
    vDirection = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    gl_Position.z = gl_Position.w;
  }
`;

const fragmentShader = /* glsl */ `
  uniform sampler2D noiseMap;
  uniform vec3 sunDirection;
  uniform vec3 horizonColor;
  uniform float time;
  uniform float coverage;
  uniform float sunDisc;
  varying vec3 vDirection;

  float fbm(vec2 p) {
    float sum = 0.0;
    float amplitude = 0.5;
    for (int i = 0; i < 4; i++) {
      sum += amplitude * texture2D(noiseMap, p).r;
      p = p * 2.07 + 13.7;
      amplitude *= 0.5;
    }
    return sum / 0.9375;
  }

  void main() {
    vec3 dir = normalize(vDirection);
    float up = clamp(dir.y, 0.0, 1.0);

    vec3 color = mix(horizonColor, vec3(0.40, 0.60, 0.98), smoothstep(0.0, 0.28, up));
    color = mix(color, vec3(0.11, 0.30, 0.78), smoothstep(0.18, 1.0, up));

    float sun = max(dot(dir, sunDirection), 0.0);
    vec3 glow = vec3(1.0, 0.86, 0.64);
    // Warm haze low in the sky on the side of the sun.
    color = mix(color, vec3(1.25, 1.0, 0.72), pow(sun, 3.0) * (1.0 - smoothstep(0.0, 0.45, up)) * 0.55);
    color += glow * (0.3 * pow(sun, 10.0) + 1.1 * pow(sun, 260.0) * sunDisc);
    color += vec3(40.0, 36.0, 28.0) * smoothstep(0.99955, 0.9998, sun) * sunDisc;

    vec2 base = dir.xz / (dir.y + 0.1) * 0.34 + vec2(time * 0.006, time * 0.002);
    float density = fbm(base) + (fbm(base * 3.1 + 4.0) - 0.5) * 0.32;
    float cover = smoothstep(coverage, coverage + 0.15, density);
    float towardSun = fbm(base + normalize(sunDirection.xz) * 0.07);
    float lit = clamp(0.55 + (density - towardSun) * 4.5, 0.0, 1.0);
    vec3 cloud = mix(vec3(0.60, 0.67, 0.80), vec3(1.55, 1.50, 1.44), lit);
    cloud *= mix(1.0, 0.8, smoothstep(0.35, 1.0, cover) * (1.0 - lit));
    cloud += glow * pow(sun, 24.0) * 0.6;
    cloud = mix(horizonColor, cloud, smoothstep(0.02, 0.3, dir.y));
    float alpha = cover * smoothstep(0.015, 0.14, dir.y);

    gl_FragColor = vec4(mix(color, cloud, alpha), 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

export function createSky(noiseMap, sunDirection, horizonColor) {
  const uniforms = {
    noiseMap: { value: noiseMap },
    sunDirection: { value: sunDirection.clone() },
    horizonColor: { value: horizonColor.clone() },
    time: { value: 0 },
    coverage: { value: 0.5 },
    sunDisc: { value: 1 },
  };
  const material = new THREE.ShaderMaterial({ uniforms, vertexShader, fragmentShader, side: THREE.BackSide, depthWrite: false, fog: false });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(5000, 48, 24), material);
  mesh.frustumCulled = false;
  return { mesh, uniforms };
}
