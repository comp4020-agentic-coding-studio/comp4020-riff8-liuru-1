// The sky: a faceted globe, the planes flying round it, and journey routes.
// Everything here is drawing; which planes exist, and who may catch them, is
// the server's business (src/planes.ts). Each real plane on screen is exactly
// one plane id the server sent.
import * as THREE from "three";

const DEG = Math.PI / 180;
const FOV = 38;
const TILT = 23.4 * DEG;
const IDLE_SPIN = 0.8 * DEG; // per second
const LAND_LIFT = 0.018;

/** Unit vector for a latitude/longitude, with longitude 0 facing the camera. */
export function latLngToVec(lat, lng, r = 1) {
  const la = lat * DEG;
  const ln = lng * DEG;
  return new THREE.Vector3(r * Math.cos(la) * Math.sin(ln), r * Math.sin(la), r * Math.cos(la) * Math.cos(ln));
}

function mulberry(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The finished dart shape, nose along +y and up along +z, about 1 unit long. */
export function dartGeometry() {
  const h = 0.5;
  const T = [0, h, 0];
  const tailK = [0, -h, -0.16];
  const tailW = 0.36;
  // wings: nose, inner tail, outer tail; keel: nose, keel bottom, inner tail
  const verts = [
    // left wing
    ...T, -0.06, -h, -0.02, -tailW, -h, 0.03,
    // right wing
    ...T, tailW, -h, 0.03, 0.06, -h, -0.02,
    // left keel
    ...T, ...tailK, -0.06, -h, -0.02,
    // right keel
    ...T, 0.06, -h, -0.02, ...tailK,
  ];
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(verts, 3));
  g.computeVertexNormals();
  return g;
}

function landMask(land) {
  const bits = Uint8Array.from(atob(land.bits), (c) => c.charCodeAt(0));
  const { width: W, height: H } = land;
  return (lat, lng) => {
    const row = Math.min(H - 1, Math.max(0, Math.floor(((90 - lat) / 180) * H)));
    const col = (((Math.floor(((lng + 180) / 360) * W) % W) + W) % W);
    const n = row * W + col;
    return ((bits[n >> 3] >> (n & 7)) & 1) === 1;
  };
}

function vecToLatLng(v) {
  const r = v.length();
  return [Math.asin(v.y / r) / DEG, Math.atan2(v.x, v.z) / DEG];
}

// Each facet is land or sea by its centre; land facets are lifted whole, so
// coastlines read as low-poly steps rather than smeared vertices. An inner
// sea-coloured sphere fills the gaps a lifted facet leaves at its edges.
function buildGlobe(land, detail) {
  const isLand = landMask(land);
  const geo = new THREE.IcosahedronGeometry(1, detail);
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const ocean1 = new THREE.Color("#A9C1EA");
  const ocean2 = new THREE.Color("#BDB0E3");
  const land1 = new THREE.Color("#5DB7A6");
  const land2 = new THREE.Color("#93D6BC");
  const ice = new THREE.Color("#E8F0F6");
  const c = new THREE.Color();
  const rnd = mulberry(7);
  const centre = new THREE.Vector3();
  const v = new THREE.Vector3();
  for (let f = 0; f < pos.count; f += 3) {
    centre.set(0, 0, 0);
    for (let k = 0; k < 3; k++) centre.add(v.fromBufferAttribute(pos, f + k));
    const [lat, lng] = vecToLatLng(centre);
    const jitter = rnd();
    const isL = isLand(lat, lng);
    if (isL) {
      if (Math.abs(lat) > 62) c.copy(ice).lerp(land2, jitter * 0.35);
      else c.copy(land1).lerp(land2, jitter * 0.7 + (Math.abs(lat) / 90) * 0.3);
      // a gentle, uneven relief
      const lift = 1 + LAND_LIFT * (0.85 + 0.3 * jitter);
      for (let k = 0; k < 3; k++) {
        v.fromBufferAttribute(pos, f + k).setLength(lift);
        pos.setXYZ(f + k, v.x, v.y, v.z);
      }
    } else {
      const t = 0.5 + 0.35 * Math.sin(lng * DEG * 2 + lat * DEG * 3) + (jitter - 0.5) * 0.3;
      c.copy(ocean1).lerp(ocean2, Math.min(1, Math.max(0, t)));
    }
    for (let k = 0; k < 3; k++) colors.set([c.r, c.g, c.b], (f + k) * 3);
  }
  geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  const mesh = new THREE.Mesh(geo, mat);
  const fill = new THREE.Mesh(new THREE.SphereGeometry(0.999, 64, 48), new THREE.MeshLambertMaterial({ color: 0x7fbfae }));
  mesh.add(fill);
  return mesh;
}

function rimMaterial() {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.BackSide,
    blending: THREE.AdditiveBlending,
    uniforms: { color: { value: new THREE.Color("#6FC7BC") } },
    vertexShader: `varying vec3 vN; varying vec3 vV;
      void main() { vec4 mv = modelViewMatrix * vec4(position, 1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz);
      gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `uniform vec3 color; varying vec3 vN; varying vec3 vV;
      void main() { float f = pow(1.0 - abs(dot(vN, vV)), 3.0); gl_FragColor = vec4(color, f * 0.35); }`,
  });
}

function haloSprite() {
  const cv = document.createElement("canvas");
  cv.width = cv.height = 256;
  const ctx = cv.getContext("2d");
  const g = ctx.createRadialGradient(128, 128, 40, 128, 128, 128);
  g.addColorStop(0, "rgba(255,250,252,0.55)");
  g.addColorStop(0.55, "rgba(246,236,248,0.22)");
  g.addColorStop(1, "rgba(240,232,250,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 256, 256);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthWrite: false, depthTest: false }));
  s.scale.set(4.2, 4.2, 1);
  s.renderOrder = -1;
  return s;
}

// Orbit bands: a few shells with their own inclination and pace, so the
// flock never looks like evenly spaced circles.
const BANDS = [
  { radius: 1.22, spread: 0.08, speed: 0.11, incl: 18, node: 0, scale: 0.075 },
  { radius: 1.34, spread: 0.1, speed: 0.085, incl: -32, node: 70, scale: 0.085 },
  { radius: 1.5, spread: 0.12, speed: 0.07, incl: 52, node: 150, scale: 0.095 },
  { radius: 1.95, spread: 0.18, speed: 0.05, incl: -12, node: 230, scale: 0.13 },
];

export class Sky {
  /** @param {HTMLElement} host */
  constructor(host, land, { reducedMotion }) {
    this.host = host;
    this.reduced = reducedMotion;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.setClearColor(0x000000, 0);
    this.quality = Math.min(window.devicePixelRatio || 1, 2);
    this.renderer.setPixelRatio(this.quality);
    host.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 50);
    this.scene.add(new THREE.HemisphereLight(0xf6f1ff, 0x9fb0d8, 1.25));
    const sun = new THREE.DirectionalLight(0xfff8f0, 1.5);
    sun.position.set(-2.5, 3, 4);
    this.scene.add(sun);

    // world: globe position/framing; tilt: axial tilt; spin: idle rotation.
    this.world = new THREE.Group();
    this.scene.add(this.world);
    this.halo = haloSprite();
    this.world.add(this.halo);
    this.tilt = new THREE.Group();
    this.tilt.rotation.z = TILT;
    this.world.add(this.tilt);
    this.spin = new THREE.Group();
    this.tilt.add(this.spin);
    const small = Math.min(innerWidth, innerHeight) < 600;
    this.globe = buildGlobe(land, small ? 20 : 24);
    this.spin.add(this.globe);
    const rim = new THREE.Mesh(new THREE.SphereGeometry(1.045, 48, 32), rimMaterial());
    this.tilt.add(rim);
    this.routes = new THREE.Group();
    this.spin.add(this.routes);

    this.flock = new THREE.Group();
    this.world.add(this.flock);
    this.dart = dartGeometry();
    this.planes = new Map(); // id -> { mesh, orbit }
    this.rand = mulberry(42);
    this.addAmbient();

    this.spinAngle = 0.4;
    this.spinTarget = null; // set while framing a journey
    this.tiltTarget = TILT;
    this.dragging = null;
    this.spinVelocity = 0;
    this.focus = 0; // 0 = home framing, 1 = eased back for a foreground panel
    this.focusTarget = 0;
    this.time = 0;
    this.last = performance.now();
    this.frameTimes = [];
    this.resize();
    addEventListener("resize", () => this.resize());
    this.bindDrag();
    this.loop = this.loop.bind(this);
    requestAnimationFrame(this.loop);
  }

  // A few tiny pale silhouettes far out, never catchable and never counted:
  // depth for the scene, not pretend visitors.
  addAmbient() {
    const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.45, side: THREE.DoubleSide });
    this.ambient = [];
    for (let i = 0; i < 9; i++) {
      const mesh = new THREE.Mesh(this.dart, mat);
      const orbit = this.makeOrbit({ radius: 2.6, spread: 0.4, speed: 0.03, incl: 0, node: 0, scale: 0.05 }, true);
      mesh.scale.setScalar(orbit.scale);
      this.flock.add(mesh);
      this.ambient.push({ mesh, orbit });
    }
  }

  makeOrbit(band, randomTilt = false) {
    const r = this.rand;
    const incl = (randomTilt ? (r() - 0.5) * 140 : band.incl + (r() - 0.5) * 18) * DEG;
    const node = (band.node + (r() - 0.5) * 60) * DEG;
    const axis = new THREE.Vector3(0, 1, 0).applyAxisAngle(new THREE.Vector3(1, 0, 0), incl).applyAxisAngle(new THREE.Vector3(0, 1, 0), node);
    const u = new THREE.Vector3(1, 0, 0).applyAxisAngle(new THREE.Vector3(1, 0, 0), incl).applyAxisAngle(new THREE.Vector3(0, 1, 0), node);
    const v = new THREE.Vector3().crossVectors(axis, u);
    return {
      axis,
      u,
      v,
      radius: band.radius + (r() - 0.5) * 2 * band.spread,
      speed: band.speed * (0.8 + r() * 0.45) * (r() < 0.2 ? -1 : 1),
      phase: r() * Math.PI * 2,
      bob: r() * Math.PI * 2,
      bobRate: 0.6 + r() * 0.7,
      scale: band.scale * (0.9 + r() * 0.25),
      wobble: (r() - 0.5) * 0.25,
    };
  }

  /** Show exactly these planes ({id, colour hex}); anything else leaves. */
  setPlanes(list) {
    const keep = new Set(list.map((p) => p.id));
    for (const id of [...this.planes.keys()]) if (!keep.has(id)) this.removePlane(id);
    for (const p of list) this.addPlane(p);
  }

  addPlane({ id, hex }, nearFront = false) {
    if (this.planes.has(id)) return;
    const i = this.planes.size;
    // mostly the middle bands, now and then a near pass
    const band = BANDS[(id * 7 + i) % 11 === 0 ? 3 : (id + i) % 3];
    const orbit = this.makeOrbit(band);
    const mesh = new THREE.Mesh(
      this.dart,
      new THREE.MeshLambertMaterial({ color: new THREE.Color(hex), side: THREE.DoubleSide, flatShading: true }),
    );
    mesh.scale.setScalar(orbit.scale);
    mesh.userData.id = id;
    if (nearFront) {
      // start where a just-thrown plane would be: on the camera side
      orbit.phase = Math.atan2(orbit.v.z, orbit.u.z);
    }
    this.flock.add(mesh);
    this.planes.set(id, { mesh, orbit });
  }

  removePlane(id) {
    const p = this.planes.get(id);
    if (!p) return;
    this.flock.remove(p.mesh);
    p.mesh.material.dispose();
    this.planes.delete(id);
  }

  /** Screen position (CSS px) of a plane, and whether the globe hides it. */
  screenOf(id) {
    const p = this.planes.get(id);
    if (!p) return null;
    const world = p.mesh.getWorldPosition(new THREE.Vector3());
    return this.project(world);
  }

  project(world) {
    const ndc = world.clone().project(this.camera);
    const rect = this.renderer.domElement.getBoundingClientRect();
    const x = rect.left + ((ndc.x + 1) / 2) * rect.width;
    const y = rect.top + ((1 - ndc.y) / 2) * rect.height;
    // hidden if the line of sight crosses the globe before reaching the plane
    const centre = this.world.getWorldPosition(new THREE.Vector3());
    const cam = this.camera.position;
    const dir = world.clone().sub(cam);
    const dist = dir.length();
    dir.normalize();
    const oc = cam.clone().sub(centre);
    const bq = oc.dot(dir);
    const disc = bq * bq - (oc.lengthSq() - 1.03 * 1.03);
    const hit = disc > 0 ? -bq - Math.sqrt(disc) : Infinity;
    return { x, y, hidden: hit < dist, depth: dist };
  }

  /** The visible real plane nearest a screen point, within `radius` px. */
  nearest(x, y, radius) {
    let best = null;
    for (const id of this.planes.keys()) {
      const s = this.screenOf(id);
      if (!s || s.hidden) continue;
      const d = Math.hypot(s.x - x, s.y - y);
      if (d <= radius && (!best || d < best.d)) best = { id, d, x: s.x, y: s.y };
    }
    return best;
  }

  globeScreen() {
    const c = this.project(this.world.getWorldPosition(new THREE.Vector3()));
    const edge = this.project(this.world.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(1, 0, 0)));
    return { x: c.x, y: c.y, r: Math.abs(edge.x - c.x) };
  }

  setFocus(f) {
    this.focusTarget = f;
  }

  // A route on the globe: great-circle arcs lifted off the surface, a dot
  // at each stop, the selected leg drawn stronger. Turns the globe to face it.
  showRoute(points, selected = -1) {
    this.clearRoute();
    if (!points.length) return;
    const ink = new THREE.Color("#3D4E7A");
    const dotGeo = new THREE.SphereGeometry(0.018, 10, 8);
    points.forEach((p, i) => {
      const dot = new THREE.Mesh(dotGeo, new THREE.MeshBasicMaterial({ color: i === selected || i === selected + 1 ? 0xe2557a : ink }));
      dot.position.copy(latLngToVec(p.lat, p.lng, 1 + LAND_LIFT + 0.01));
      this.routes.add(dot);
    });
    for (let i = 0; i + 1 < points.length; i++) {
      const a = latLngToVec(points[i].lat, points[i].lng);
      const b = latLngToVec(points[i + 1].lat, points[i + 1].lng);
      const angle = a.angleTo(b);
      if (angle < 0.002) continue; // same place twice: no flight
      const pts = [];
      const steps = Math.max(12, Math.ceil(angle * 40));
      const q = new THREE.Quaternion();
      for (let s = 0; s <= steps; s++) {
        const t = s / steps;
        // slerp, so the arc follows the sphere, not a chord through it
        const v = new THREE.Vector3().copy(a);
        if (angle > Math.PI - 0.01) {
          const axis = new THREE.Vector3(0, 1, 0).cross(a).normalize();
          q.setFromAxisAngle(axis.lengthSq() ? axis : new THREE.Vector3(1, 0, 0), angle * t);
        } else {
          q.setFromUnitVectors(a, b);
          q.slerpQuaternions(new THREE.Quaternion(), q, t);
        }
        v.applyQuaternion(q).setLength(1 + LAND_LIFT + 0.02 + Math.sin(Math.PI * t) * Math.min(0.25, angle * 0.18));
        pts.push(v);
      }
      const geo = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), steps, i === selected ? 0.009 : 0.005, 6, false);
      this.routes.add(new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: i === selected ? 0xe2557a : ink })));
    }
    // face the middle of the route
    const mid = new THREE.Vector3();
    for (const p of points) mid.add(latLngToVec(p.lat, p.lng));
    if (mid.lengthSq() < 1e-6) mid.copy(latLngToVec(points[0].lat, points[0].lng));
    const [lat, lng] = vecToLatLng(mid);
    this.spinTarget = -lng * DEG;
    this.tiltTarget = 0;
    this.latTarget = lat * DEG * 0.8;
  }

  clearRoute() {
    for (const m of [...this.routes.children]) {
      this.routes.remove(m);
      m.geometry.dispose();
      m.material.dispose();
    }
    this.spinTarget = null;
    this.tiltTarget = TILT;
    this.latTarget = 0;
  }

  bindDrag() {
    const el = this.renderer.domElement;
    el.addEventListener("pointerdown", (e) => {
      if (!this.dragEnabled) return;
      this.dragging = { x: e.clientX, last: e.clientX, t: performance.now() };
      el.setPointerCapture(e.pointerId);
    });
    el.addEventListener("pointermove", (e) => {
      if (!this.dragging) return;
      const dx = e.clientX - this.dragging.last;
      this.dragging.last = e.clientX;
      const delta = (dx / Math.min(innerWidth, innerHeight)) * 3;
      this.spinAngle += delta;
      this.spinVelocity = delta / Math.max(1, performance.now() - this.dragging.t) * 1000;
      this.dragging.t = performance.now();
    });
    const end = () => {
      this.dragging = null;
    };
    el.addEventListener("pointerup", end);
    el.addEventListener("pointercancel", end);
  }

  resize() {
    const w = innerWidth;
    const h = innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    const t = Math.tan((FOV / 2) * DEG);
    // desktop: globe ~66% of the shorter side; portrait phone: ~90% of the width
    const portrait = w / h < 0.8;
    const d = portrait ? 2 / (0.9 * 2 * t * this.camera.aspect) : 2 / (0.64 * 2 * t * Math.min(1, this.camera.aspect));
    this.distance = d;
    this.camera.position.set(0, 0, d);
    this.camera.lookAt(0, 0, 0);
    this.camera.updateProjectionMatrix();
    const visibleH = 2 * d * t;
    this.homeY = (portrait ? 0.09 : 0.04) * visibleH;
  }

  loop(now) {
    requestAnimationFrame(this.loop);
    if (document.hidden) {
      this.last = now;
      return;
    }
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    this.time += dt;
    this.adapt(dt);

    this.focus += (this.focusTarget - this.focus) * Math.min(1, dt * 6);
    this.world.position.set(this.focus * 0.0, this.homeY + this.focus * 0.15, -this.focus * 1.4);

    const slow = 1 - this.focus * 0.7;
    if (this.spinTarget !== null) {
      let diff = this.spinTarget - this.spinAngle;
      diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      this.spinAngle += diff * Math.min(1, dt * 2.5);
    } else if (!this.dragging) {
      this.spinVelocity *= Math.pow(0.05, dt);
      const idle = this.reduced ? 0 : IDLE_SPIN;
      this.spinAngle += (idle * slow + this.spinVelocity) * dt;
    }
    this.spin.rotation.y = this.spinAngle;
    this.tilt.rotation.z += (this.tiltTarget - this.tilt.rotation.z) * Math.min(1, dt * 2.5);
    this.tilt.rotation.x += ((this.latTarget ?? 0) - this.tilt.rotation.x) * Math.min(1, dt * 2.5);

    const pace = (this.reduced ? 0.35 : 1) * slow;
    for (const p of this.planes.values()) this.fly(p, dt * pace);
    for (const p of this.ambient) this.fly(p, dt * pace);
    this.renderer.render(this.scene, this.camera);
  }

  fly({ mesh, orbit }, dt) {
    orbit.phase += orbit.speed * dt;
    orbit.bob += orbit.bobRate * dt;
    const th = orbit.phase;
    const r = orbit.radius + Math.sin(orbit.bob) * 0.02;
    const pos = orbit.u.clone().multiplyScalar(Math.cos(th)).addScaledVector(orbit.v, Math.sin(th));
    // a slow wander off the plane of the orbit, so paths curve
    pos.addScaledVector(orbit.axis, Math.sin(th * 2 + orbit.bob * 0.2) * orbit.wobble).setLength(r);
    const tangent = orbit.u.clone().multiplyScalar(-Math.sin(th)).addScaledVector(orbit.v, Math.cos(th)).multiplyScalar(Math.sign(orbit.speed));
    const up = pos.clone().normalize();
    mesh.position.copy(pos);
    // nose (+y) along travel, top (+z) away from the globe, banked into the turn
    const z = up.clone().sub(tangent.clone().multiplyScalar(up.dot(tangent))).normalize();
    const x = new THREE.Vector3().crossVectors(tangent, z);
    const m = new THREE.Matrix4().makeBasis(x, tangent, z);
    mesh.quaternion.setFromRotationMatrix(m);
    mesh.rotateY(0.35 * Math.sign(orbit.speed) + Math.sin(orbit.bob * 0.7) * 0.15);
  }

  // Drop resolution before dropping anything else when frames run long.
  adapt(dt) {
    this.frameTimes.push(dt);
    if (this.frameTimes.length < 90) return;
    const avg = this.frameTimes.reduce((a, b) => a + b, 0) / this.frameTimes.length;
    this.frameTimes = [];
    if (avg > 1 / 40 && this.quality > 1) {
      this.quality = Math.max(1, this.quality - 0.25);
      this.renderer.setPixelRatio(this.quality);
      this.resize();
    }
  }
}
