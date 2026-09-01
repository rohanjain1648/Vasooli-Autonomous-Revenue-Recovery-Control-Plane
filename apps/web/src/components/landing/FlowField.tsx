"use client";

import { useMemo, useRef } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";

/**
 * The hero's centrepiece, and the only 3D on the page.
 *
 * It is not decoration: it is the pipeline. Each particle is one at-risk
 * payment flowing left to right. A fifth of them peel away into the lower
 * lane and are never touched — that is the holdout, and the fact that you
 * can watch revenue being deliberately left alone is the whole argument.
 * The rest reach the policy gate, where blocked actions stop dead and
 * fade, and approved ones carry on and settle to recovered.
 *
 * Everything is computed in the vertex shader from a time uniform, so
 * eight thousand particles cost nothing per frame on the CPU.
 */

const COUNT = 8000;
const HOLDOUT_SHARE = 0.2;
const GATE = 0.62;

const vertexShader = /* glsl */ `
  attribute float aSeed;
  attribute float aLane;   // 0 = holdout, 1 = treatment
  attribute float aFate;   // 1 = passes the gate, 0 = blocked by policy
  attribute float aPhase;

  uniform float uTime;
  uniform float uSize;
  uniform float uReveal;
  uniform float uPixelRatio;

  varying vec3 vColor;
  varying float vAlpha;

  const vec3 C_UPSTREAM  = vec3(0.72, 0.70, 0.78);
  const vec3 C_HOLDOUT   = vec3(0.44, 0.47, 0.55);
  const vec3 C_TREATMENT = vec3(0.88, 0.63, 0.23);
  const vec3 C_RECOVERED = vec3(0.20, 0.54, 0.45);
  const vec3 C_BLOCKED   = vec3(0.77, 0.25, 0.18);

  void main() {
    float speed = 0.055 + aSeed * 0.035;
    float p = fract(aPhase + uTime * speed);

    bool blocked = aLane > 0.5 && aFate < 0.5;

    // Blocked payments never travel past the gate. They stall there and
    // fade, which is exactly what a BLOCK verdict does to a case.
    float halted = blocked ? step(GATE, p) : 0.0;
    float pc = mix(p, GATE, halted);

    float x = (pc - 0.5) * 15.0;

    // The lanes are one stream until assignment splits them.
    float split = smoothstep(0.26, 0.52, pc);
    float laneY = mix(-1.75, 0.62, aLane);
    float spread = (aSeed - 0.5) * 1.25;
    float y = spread * (1.0 - split * 0.62) + laneY * split;
    y += sin(pc * 8.5 + aSeed * 6.283 + uTime * 0.55) * 0.11;
    y -= halted * pow(max(p - GATE, 0.0), 1.6) * 4.0; // blocked cases drop away

    float z = (fract(aSeed * 91.73) - 0.5) * 2.6;

    vec4 mv = modelViewMatrix * vec4(x, y, z, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = uSize * uPixelRatio * (1.0 / -mv.z) * (0.65 + aSeed * 0.6);

    // Colour tells the story: neutral upstream, then the cohort split,
    // then the verdict.
    vec3 c = mix(C_UPSTREAM, mix(C_HOLDOUT, C_TREATMENT, aLane), split);
    float settled = smoothstep(GATE, 0.94, pc);
    if (!blocked && aLane > 0.5) {
      c = mix(c, C_RECOVERED, settled);
    }
    c = mix(c, C_BLOCKED, halted);
    vColor = c;

    // Fade in at the source, out at the sink, and away when halted.
    float edge = smoothstep(0.0, 0.08, p) * (1.0 - smoothstep(0.9, 1.0, p));
    float haltFade = 1.0 - halted * smoothstep(0.0, 0.16, p - GATE);
    float depth = 0.55 + 0.45 * (1.0 - abs(z) / 1.3);
    vAlpha = edge * haltFade * depth * uReveal * mix(0.5, 1.0, aLane);
  }
`;

const fragmentShader = /* glsl */ `
  precision mediump float;
  varying vec3 vColor;
  varying float vAlpha;

  void main() {
    vec2 uv = gl_PointCoord - 0.5;
    float d = length(uv);
    if (d > 0.5) discard;
    float core = 1.0 - smoothstep(0.0, 0.5, d);
    gl_FragColor = vec4(vColor, vAlpha * core * core);
  }
`;

function Particles({ reveal }: { reveal: number }) {
  const material = useRef<THREE.ShaderMaterial>(null);
  const { viewport, size } = useThree();

  const geometry = useMemo(() => {
    const geo = new THREE.BufferGeometry();
    const positions = new Float32Array(COUNT * 3); // placeholder: shader owns position
    const seed = new Float32Array(COUNT);
    const lane = new Float32Array(COUNT);
    const fate = new Float32Array(COUNT);
    const phase = new Float32Array(COUNT);

    for (let i = 0; i < COUNT; i++) {
      seed[i] = Math.random();
      // A fifth held out, matching the engine's default holdoutPercent.
      lane[i] = Math.random() < HOLDOUT_SHARE ? 0 : 1;
      // Roughly one treated case in seven is stopped by the policy gate.
      fate[i] = Math.random() < 0.14 ? 0 : 1;
      phase[i] = Math.random();
    }

    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geo.setAttribute("aSeed", new THREE.BufferAttribute(seed, 1));
    geo.setAttribute("aLane", new THREE.BufferAttribute(lane, 1));
    geo.setAttribute("aFate", new THREE.BufferAttribute(fate, 1));
    geo.setAttribute("aPhase", new THREE.BufferAttribute(phase, 1));
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 12);
    return geo;
  }, []);

  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uSize: { value: 260 },
      uReveal: { value: 0 },
      uPixelRatio: { value: 1 },
    }),
    [],
  );

  useFrame((state, delta) => {
    if (!material.current) return;
    const u = material.current.uniforms;
    u.uTime.value += delta;
    u.uReveal.value += (reveal - u.uReveal.value) * 0.05;
    u.uPixelRatio.value = Math.min(state.gl.getPixelRatio(), 2);

    // Gentle parallax toward the pointer. Small enough to read as depth
    // rather than as a thing reacting to you.
    const px = (state.pointer.x || 0) * 0.4;
    const py = (state.pointer.y || 0) * 0.25;
    state.camera.position.x += (px - state.camera.position.x) * 0.03;
    state.camera.position.y += (py - state.camera.position.y) * 0.03;
    state.camera.lookAt(0, -0.35, 0);
  });

  const scale = Math.min(1, size.width / 900);
  void viewport;

  return (
    <points geometry={geometry} scale={[scale, scale, 1]} frustumCulled={false}>
      <shaderMaterial
        ref={material}
        uniforms={uniforms}
        vertexShader={vertexShader}
        fragmentShader={fragmentShader}
        transparent
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </points>
  );
}

/** The policy gate itself — a vertical seam the treated stream must cross. */
function Gate() {
  const ref = useRef<THREE.Mesh>(null);
  useFrame((state) => {
    if (!ref.current) return;
    const m = ref.current.material as THREE.MeshBasicMaterial;
    m.opacity = 0.13 + Math.sin(state.clock.elapsedTime * 1.4) * 0.05;
  });
  const x = (GATE - 0.5) * 15;
  return (
    <mesh ref={ref} position={[x, -0.3, 0]}>
      <planeGeometry args={[0.035, 6.4]} />
      <meshBasicMaterial color="#e0a03a" transparent opacity={0.15} depthWrite={false} />
    </mesh>
  );
}

export function FlowField({ reveal = 1 }: { reveal?: number }) {
  return (
    <Canvas
      dpr={[1, 2]}
      camera={{ position: [0, 0, 9.2], fov: 42 }}
      gl={{ antialias: false, alpha: true, powerPreference: "high-performance" }}
      style={{ pointerEvents: "none" }}
    >
      <Particles reveal={reveal} />
      <Gate />
    </Canvas>
  );
}

export default FlowField;
