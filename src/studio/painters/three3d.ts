import * as THREE from "three";

/**
 * Real-3D layer. Painters stay pure Canvas-2D; this renders a three.js scene to
 * ONE cached offscreen WebGL canvas and `drawImage`s it onto the 2D context —
 * the same seam the engine already uses to composite scenes, so the MediaRecorder
 * capture is unaffected (proven by the Wave-0 spike). Only one scene renders per
 * frame, so a single WebGL context is reused for every 3D scene (avoids the
 * browser's ~16-context ceiling).
 *
 * Determinism: every mesh/camera transform must be a pure function of the
 * `elapsedMs` passed to `render3D` — never Date.now()/Math.random(), same as the
 * 2D painters.
 */

let renderer: THREE.WebGLRenderer | null = null;
let glCanvas: HTMLCanvasElement | null = null;
let webglFailed = false;

function getRenderer(w: number, h: number): { renderer: THREE.WebGLRenderer; canvas: HTMLCanvasElement } | null {
  if (typeof document === "undefined" || webglFailed) return null;
  if (!renderer || !glCanvas) {
    try {
      glCanvas = document.createElement("canvas");
      renderer = new THREE.WebGLRenderer({ canvas: glCanvas, antialias: true, alpha: true, preserveDrawingBuffer: true });
      renderer.setClearColor(0x000000, 0);
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    } catch {
      webglFailed = true;
      return null;
    }
  }
  if (glCanvas.width !== w || glCanvas.height !== h) {
    glCanvas.width = w;
    glCanvas.height = h;
    renderer.setSize(w, h, false);
  }
  return { renderer, canvas: glCanvas };
}

export type ThreeBundle<T = any> = {
  scene: THREE.Scene;
  camera: THREE.Camera;
  /** Called every frame with scene-elapsed ms and the latest context to animate deterministically. */
  update: (elapsedMs: number, context: T) => void;
};

type CacheEntry = { bundle: ThreeBundle; lastUsed: number; capturedEnv?: object };
const cache = new Map<string, CacheEntry>();
const MAX_CACHE = 12;
let tick = 0;

function dispose(scene: THREE.Scene) {
  scene.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.geometry) m.geometry.dispose();
    const mat = m.material as THREE.Material | THREE.Material[] | undefined;
    if (Array.isArray(mat)) mat.forEach((x) => x.dispose());
    else if (mat) mat.dispose();
  });
}

/**
 * Drop every cached bundle. Geometry is built once per key from the FIRST rect it
 * saw, so rendering 9:16 and then 16:9 in one page reuses the wrong build. The
 * engine only ever renders one aspect per video; QA renders both, so it resets.
 */
export function resetThree3D() {
  for (const entry of cache.values()) dispose(entry.bundle.scene);
  cache.clear();
}

/**
 * Render a cached three.js scene into `rect` on the 2D context. `build` runs
 * once per `key` (cache its meshes); `update` runs every frame with the latest context.
 * Returns the camera used (so callers can project world points to 2D for labels),
 * or null if WebGL is unavailable — callers fall back to a 2D drawing.
 */
export function render3D<T = any>(
  ctx: CanvasRenderingContext2D,
  key: string,
  rect: { x: number; y: number; w: number; h: number },
  build: () => ThreeBundle<T>,
  elapsedMs: number,
  context?: T,
  /**
   * The painter's live PaintEnv. `build` runs ONCE per key and its `update`
   * closure captures whatever `env` object existed on that first frame — so
   * anything it reads (env.p, env.beats, enterT(env, …)) is frozen at that
   * frame forever, which silently kills the whole 3D layer for a scene that
   * starts at p=0. Passing env here refreshes the captured object in place.
   */
  liveEnv?: object
): THREE.Camera | null {
  const pw = Math.max(2, Math.round(rect.w));
  const ph = Math.max(2, Math.round(rect.h));
  const g = getRenderer(pw, ph);
  if (!g) return null;

  let entry = cache.get(key);
  if (!entry) {
    entry = { bundle: build(), lastUsed: 0, capturedEnv: liveEnv };
    cache.set(key, entry);
    if (cache.size > MAX_CACHE) {
      let oldestKey: string | null = null;
      let oldest = Infinity;
      for (const [k, e] of cache) if (e.lastUsed < oldest) { oldest = e.lastUsed; oldestKey = k; }
      if (oldestKey && oldestKey !== key) {
        dispose(cache.get(oldestKey)!.bundle.scene);
        cache.delete(oldestKey);
      }
    }
  }
  entry.lastUsed = ++tick;
  if (liveEnv && entry.capturedEnv && entry.capturedEnv !== liveEnv) {
    Object.assign(entry.capturedEnv, liveEnv);
  }

  const { scene, camera, update } = entry.bundle;
  if (camera instanceof THREE.PerspectiveCamera) {
    camera.aspect = pw / ph;
    camera.updateProjectionMatrix();
  }
  update(elapsedMs, context);
  g.renderer.setSize(pw, ph, false);
  g.renderer.render(scene, camera);
  ctx.drawImage(g.canvas, rect.x, rect.y, rect.w, rect.h);
  return camera;
}

/**
 * Visible half-width/half-height at the camera's focus plane for `rect`'s aspect.
 * Size world geometry from this, never from a literal: the frustum half-width is
 * `halfH * aspect`, so a block that fits 16:9 is ~2.5x too wide at 9:16 and hangs
 * off both edges. Assumes the camera looks at the origin (all painters here do).
 */
export function frustumHalfExtent(
  camera: THREE.PerspectiveCamera,
  rect: { w: number; h: number }
): { halfW: number; halfH: number } {
  const halfH = Math.tan((camera.fov * Math.PI) / 360) * camera.position.length();
  return { halfW: halfH * (rect.w / rect.h), halfH };
}

/** Project a world-space point to 2D pixel coords inside `rect`. */
export function projectToRect(
  camera: THREE.Camera,
  world: THREE.Vector3,
  rect: { x: number; y: number; w: number; h: number }
): { x: number; y: number } {
  const v = world.clone().project(camera);
  return { x: rect.x + (v.x * 0.5 + 0.5) * rect.w, y: rect.y + (-v.y * 0.5 + 0.5) * rect.h };
}

/** Hex string ("#rrggbb") → THREE.Color. */
export function color3(hex: string): THREE.Color {
  return new THREE.Color(hex);
}

/** Isometric-feeling perspective camera looking at the origin. */
export function isoCamera(): THREE.PerspectiveCamera {
  const cam = new THREE.PerspectiveCamera(32, 1, 0.1, 100);
  cam.position.set(6.5, 5.2, 7.5);
  cam.lookAt(0, 0, 0);
  return cam;
}

/** Studio 3-point lighting tinted by the subject palette. */
export function studioLights(scene: THREE.Scene, accentHex: string, secondaryHex: string) {
  scene.add(new THREE.AmbientLight(0xffffff, 0.55));
  const key = new THREE.DirectionalLight(new THREE.Color(accentHex), 1.5);
  key.position.set(5, 8, 6);
  key.castShadow = true;
  key.shadow.mapSize.width = 1024;
  key.shadow.mapSize.height = 1024;
  key.shadow.bias = -0.001;
  scene.add(key);
  const rim = new THREE.DirectionalLight(new THREE.Color(secondaryHex), 0.9);
  rim.position.set(-6, 3, -4);
  rim.castShadow = true;
  rim.shadow.bias = -0.001;
  scene.add(rim);
  const fill = new THREE.DirectionalLight(0xffffff, 0.35);
  fill.position.set(0, -4, 3);
  scene.add(fill);
}

/** A beveled box with a bright edge wireframe — the ByteByteGo "solid block". */
export function makeBlock(w: number, h: number, d: number, faceHex: string, edgeHex: string): THREE.Group {
  const group = new THREE.Group();
  const geo = new THREE.BoxGeometry(w, h, d);
  const mat = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(faceHex),
    emissive: new THREE.Color(faceHex),
    emissiveIntensity: 0.1,
    metalness: 0.2,
    roughness: 0.15,
    clearcoat: 0.8,
    clearcoatRoughness: 0.2,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  group.add(mesh);
  const edges = new THREE.LineSegments(
    new THREE.EdgesGeometry(geo),
    new THREE.LineBasicMaterial({ color: new THREE.Color(edgeHex), transparent: true, opacity: 0.6 })
  );
  mesh.add(edges);
  return group;
}

/** An upright cylinder (database-like) with a rim edge. */
export function makeCylinder(radius: number, height: number, faceHex: string, edgeHex: string): THREE.Group {
  const group = new THREE.Group();
  const geo = new THREE.CylinderGeometry(radius, radius, height, 48);
  const mat = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(faceHex),
    emissive: new THREE.Color(faceHex),
    emissiveIntensity: 0.1,
    metalness: 0.25,
    roughness: 0.15,
    clearcoat: 0.8,
    clearcoatRoughness: 0.2,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  group.add(mesh);
  const rim = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.CylinderGeometry(radius, radius, height, 48, 1, false)),
    new THREE.LineBasicMaterial({ color: new THREE.Color(edgeHex), transparent: true, opacity: 0.6 })
  );
  mesh.add(rim);
  return group;
}

/** A stacked 3D cylinder database with rings and accent disk caps. */
export function makeDatabaseStack(radius: number, height: number, faceHex: string, accentHex: string): THREE.Group {
  const group = new THREE.Group();
  const mainGeo = new THREE.CylinderGeometry(radius, radius, height, 32);
  const mainMat = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(faceHex),
    emissive: new THREE.Color(faceHex),
    emissiveIntensity: 0.1,
    metalness: 0.3,
    roughness: 0.15,
    clearcoat: 0.8,
    clearcoatRoughness: 0.2,
  });
  const mainMesh = new THREE.Mesh(mainGeo, mainMat);
  mainMesh.castShadow = true;
  mainMesh.receiveShadow = true;
  group.add(mainMesh);

  // Stack groove rings
  const ringGeo = new THREE.TorusGeometry(radius + 0.02, 0.03, 16, 32);
  const ringMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(accentHex), emissive: new THREE.Color(accentHex), emissiveIntensity: 0.6 });
  [-height * 0.25, 0, height * 0.25].forEach((y) => {
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = y;
    ring.castShadow = true;
    ring.receiveShadow = true;
    group.add(ring);
  });

  return group;
}

/** A 3D server rack with glowing slot lights. */
export function makeServerRack(w: number, h: number, d: number, faceHex: string, accentHex: string): THREE.Group {
  const rack = makeBlock(w, h, d, faceHex, accentHex);
  const lightGeo = new THREE.SphereGeometry(0.04, 8, 8);
  const lightMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(accentHex) });
  for (let i = 0; i < 4; i++) {
    const light = new THREE.Mesh(lightGeo, lightMat);
    light.position.set(-w * 0.35 + i * 0.2, h * 0.3, d * 0.51);
    rack.add(light);
  }
  return rack;
}

