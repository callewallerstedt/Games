// Physics dice. The server decides the roll; every screen then runs a real
// rigid-body throw (cannon-es) and re-labels the die faces so the face that
// physically ends up on top shows the server's number. Rendered with three.js.

const THREE_URL = "three";
const CANNON_URL = "https://cdn.jsdelivr.net/npm/cannon-es@0.20.0/dist/cannon-es.js";
const ROUNDED_URL = "https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/geometries/RoundedBoxGeometry.js";

let libs = null;
function load() {
  libs ||= Promise.all([import(THREE_URL), import(CANNON_URL), import(ROUNDED_URL)]);
  return libs;
}
export function preloadDice() { load().catch(() => { libs = null; }); }

// BoxGeometry face order: +x, -x, +y, -y, +z, -z. Opposite faces sum to 7.
const NORMALS = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
const BASE_VALUES = [1, 6, 2, 5, 3, 4];
const PIPS = {
  1: [[0.5, 0.5]],
  2: [[0.28, 0.28], [0.72, 0.72]],
  3: [[0.27, 0.27], [0.5, 0.5], [0.73, 0.73]],
  4: [[0.28, 0.28], [0.72, 0.28], [0.28, 0.72], [0.72, 0.72]],
  5: [[0.27, 0.27], [0.73, 0.27], [0.5, 0.5], [0.27, 0.73], [0.73, 0.73]],
  6: [[0.28, 0.24], [0.72, 0.24], [0.28, 0.5], [0.72, 0.5], [0.28, 0.76], [0.72, 0.76]],
};

const texCache = new Map();
function faceTexture(THREE, n) {
  if (texCache.has(n)) return texCache.get(n);
  const c = document.createElement("canvas");
  c.width = c.height = 256;
  const g = c.getContext("2d");
  const grad = g.createLinearGradient(0, 0, 256, 256);
  grad.addColorStop(0, "#ffffff");
  grad.addColorStop(1, "#ebe6da");
  g.fillStyle = grad;
  g.fillRect(0, 0, 256, 256);
  for (const [x, y] of PIPS[n]) {
    const r = n === 1 ? 30 : 23;
    const pg = g.createRadialGradient(x * 256 - 5, y * 256 - 5, 2, x * 256, y * 256, r);
    pg.addColorStop(0, n === 1 ? "#e0453a" : "#3a414c");
    pg.addColorStop(1, n === 1 ? "#a3241b" : "#11151b");
    g.fillStyle = pg;
    g.beginPath();
    g.arc(x * 256, y * 256, r, 0, Math.PI * 2);
    g.fill();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  texCache.set(n, tex);
  return tex;
}

// Which local face points up for a body orientation (cannon quaternion)?
function topFace(CANNON, q) {
  let best = 0, bestY = -Infinity;
  NORMALS.forEach((n, k) => {
    const v = q.vmult(new CANNON.Vec3(...n));
    if (v.y > bestY) { bestY = v.y; best = k; }
  });
  return best;
}
// Relabel faces so face `k` shows `target` while keeping opposite faces summing to 7.
function relabel(k, target) {
  const v = BASE_VALUES.slice();
  const j = v.indexOf(target);
  if (j === k) return v;
  const opp = (i) => i ^ 1;
  if (j === opp(k)) { [v[k], v[j]] = [v[j], v[k]]; return v; }
  const old = v[k];
  v[k] = target; v[opp(k)] = 7 - target;
  v[j] = old; v[opp(j)] = 7 - old;
  return v;
}

const rnd = (a, b) => a + Math.random() * (b - a);

// Throws two dice across `host` (an element); resolves once they've settled.
export async function rollDice3D(host, values) {
  const [THREE, CANNON, { RoundedBoxGeometry }] = await load();
  const rect = host.getBoundingClientRect();
  const W = Math.max(200, rect.width), H = Math.max(200, rect.height);
  const halfZ = 5, halfX = halfZ * (W / H);
  const SIZE = 1.25;

  // ---- simulate first, record every frame ----
  const world = new CANNON.World({ gravity: new CANNON.Vec3(0, -32, 0) });
  const floorMat = new CANNON.Material("floor");
  const diceMat = new CANNON.Material("dice");
  world.addContactMaterial(new CANNON.ContactMaterial(floorMat, diceMat, { friction: 0.14, restitution: 0.42 }));
  world.addContactMaterial(new CANNON.ContactMaterial(diceMat, diceMat, { friction: 0.08, restitution: 0.5 }));
  const plane = (pos, axis, angle) => {
    const b = new CANNON.Body({ mass: 0, material: floorMat, shape: new CANNON.Plane() });
    b.position.set(...pos);
    b.quaternion.setFromAxisAngle(new CANNON.Vec3(...axis), angle);
    world.addBody(b);
  };
  plane([0, 0, 0], [1, 0, 0], -Math.PI / 2);
  plane([-halfX, 0, 0], [0, 1, 0], Math.PI / 2);
  plane([halfX, 0, 0], [0, 1, 0], -Math.PI / 2);
  plane([0, 0, -halfZ], [0, 1, 0], 0);
  plane([0, 0, halfZ], [0, 1, 0], Math.PI);

  // Throw from a random side toward the middle.
  const fromLeft = Math.random() < 0.5;
  const dir = fromLeft ? 1 : -1;
  const bodies = values.map((_, k) => {
    const b = new CANNON.Body({ mass: 1, material: diceMat, shape: new CANNON.Box(new CANNON.Vec3(SIZE / 2, SIZE / 2, SIZE / 2)) });
    b.position.set(-dir * (halfX - 1.4), rnd(3.5, 5.5) + k, rnd(-halfZ * 0.5, halfZ * 0.5) + (k ? 1.4 : -1.4));
    b.velocity.set(dir * rnd(17, 24), rnd(-1, 3), rnd(-5, 5));
    b.angularVelocity.set(rnd(-18, 18), rnd(-18, 18), rnd(-18, 18));
    b.quaternion.setFromEuler(rnd(0, 6.28), rnd(0, 6.28), rnd(0, 6.28));
    b.linearDamping = 0.08;
    b.angularDamping = 0.12;
    world.addBody(b);
    return b;
  });
  const frames = [];
  let calm = 0;
  for (let step = 0; step < 60 * 6; step++) {
    world.step(1 / 60);
    frames.push(bodies.map((b) => [b.position.x, b.position.y, b.position.z, b.quaternion.x, b.quaternion.y, b.quaternion.z, b.quaternion.w]));
    const still = bodies.every((b) => b.velocity.length() < 0.08 && b.angularVelocity.length() < 0.08 && b.position.y < SIZE);
    calm = still ? calm + 1 : 0;
    if (calm > 14) break;
  }
  const labels = bodies.map((b, k) => relabel(topFace(CANNON, b.quaternion), values[k]));

  // ---- render the recording ----
  const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(W, H);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const canvas = renderer.domElement;
  canvas.className = "dice3d";
  host.append(canvas);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(32, W / H, 0.1, 100);
  const fit = halfZ / Math.tan(THREE.MathUtils.degToRad(16));
  camera.position.set(0, fit * 0.98, fit * 0.32);
  camera.lookAt(0, 0, 0.4);
  scene.add(new THREE.AmbientLight(0xffffff, 1.1));
  const sun = new THREE.DirectionalLight(0xffffff, 2.2);
  sun.position.set(-4, 14, 6);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  Object.assign(sun.shadow.camera, { left: -halfX, right: halfX, top: halfZ, bottom: -halfZ, near: 1, far: 40 });
  sun.shadow.radius = 4;
  scene.add(sun);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(halfX * 2, halfZ * 2), new THREE.ShadowMaterial({ opacity: 0.38 }));
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);

  const geo = new RoundedBoxGeometry(SIZE, SIZE, SIZE, 4, 0.13);
  const meshes = labels.map((vals) => {
    const mats = vals.map((n) => new THREE.MeshStandardMaterial({ map: faceTexture(THREE, n), roughness: 0.32, metalness: 0.02 }));
    const m = new THREE.Mesh(geo, mats);
    m.castShadow = true;
    scene.add(m);
    return m;
  });
  const place = (f) => {
    frames[f].forEach(([x, y, z, qx, qy, qz, qw], k) => {
      meshes[k].position.set(x, y, z);
      meshes[k].quaternion.set(qx, qy, qz, qw);
    });
  };

  await new Promise((resolve) => {
    const t0 = performance.now();
    const tick = (now) => {
      try {
        const f = Math.max(0, Math.min(frames.length - 1, Math.floor(((now - t0) / 1000) * 60 * 1.15)));
        place(f);
        renderer.render(scene, camera);
        if (f < frames.length - 1) requestAnimationFrame(tick);
        else resolve();
      } catch (err) { console.warn(err); resolve(); }
    };
    requestAnimationFrame(tick);
  });
  // Let everyone read the dice, then fade out (without blocking the game).
  await new Promise((r) => setTimeout(r, 650));
  canvas.style.opacity = "0";
  setTimeout(() => {
    canvas.remove();
    renderer.dispose();
    geo.dispose();
    meshes.forEach((m) => m.material.forEach((mat) => mat.dispose()));
  }, 600);
}
