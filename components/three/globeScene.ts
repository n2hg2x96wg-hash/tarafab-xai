import * as THREE from 'three'

/* Landing page globe: a particle planet whose position, viewing angle,
   surface waves and lighting follow the visitor's scroll through its
   section (components/landing/GlobeScroll). Decorative only, no data.
   - Thousands of points on a sphere (plus a sparse outer shell for depth,
     latitude/longitude rings and a faint star field), drawn with one small
     shader: red/magenta light on one side, blue/violet on the other, an
     amber highlight and a band of light that sweep across with scroll.
   - The scroll position is read each frame and eased, so motion stays
     smooth; native scrolling is never intercepted.
   - Only renders while the section is on screen and the tab is visible.
     Particle count and pixel ratio are lower on phones and slower devices,
     and drop further if frames run slow. */

export type GlobeOptions = {
  section: HTMLElement // its scroll position drives the scene
  onFirstFrame?: () => void
  onFail?: () => void
  onProgress?: (p: number) => void
}

const rng = (seed: number) => { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296) }
const clamp01 = (x: number) => Math.min(1, Math.max(0, x))
const smooth = (a: number, b: number, x: number) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t) }
const mix = (a: number, b: number, t: number) => a + (b - a) * t

const VERT = /* glsl */ `
  attribute float aSeed;
  attribute float aKind; // 0 surface, 1 outer shell, 2 ring, 3 star
  uniform float uTime, uProgress, uPixel, uSize;
  uniform vec3 uLight, uAmber;
  uniform float uBand;
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    vec3 n = normalize(position);
    float r = length(position);
    float wave = 0.0;
    if (aKind < 2.5) {
      // Two slow travelling waves over the surface; scroll pushes them along.
      wave = sin(dot(n, vec3(3.1, 1.7, 2.3)) * 5.0 + uTime * 0.55 + uProgress * 9.0) * 0.010
           + sin(n.y * 13.0 - uTime * 0.7 - uProgress * 6.0) * 0.006 * (0.5 + aSeed);
    }
    vec3 p = n * (r + wave);
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    vec3 wn = normalize(mat3(modelMatrix) * n);
    vec3 vn = normalize(normalMatrix * n);
    float facing = vn.z;                       // > 0: the side facing the camera
    float rim = pow(1.0 - abs(facing), 2.2);   // bright at the horizon
    // Side lighting: red/magenta one way, blue/violet the other.
    float side = dot(wn, uLight);
    vec3 warm = mix(vec3(0.95, 0.12, 0.35), vec3(1.0, 0.22, 0.62), smoothstep(-0.2, 0.9, wn.y));
    vec3 cool = mix(vec3(0.22, 0.28, 1.0), vec3(0.55, 0.25, 1.0), smoothstep(-0.2, 0.9, wn.y));
    vec3 col = mix(cool, warm, smoothstep(-0.55, 0.55, side));
    // Amber highlight and a band of light flowing across the surface.
    float amber = pow(max(dot(wn, uAmber), 0.0), 10.0);
    col = mix(col, vec3(1.0, 0.62, 0.18), amber * 0.75);
    float band = exp(-pow(dot(wn, normalize(vec3(cos(uBand), 0.35, sin(uBand)))) * 3.2, 2.0));
    float lum = 0.48 + rim * 1.25 + band * 0.7 + amber * 0.7;
    float a = (facing > 0.0 ? 1.0 : 0.18) * (0.45 + 0.55 * aSeed);
    if (aKind > 2.5) { col = vec3(0.75, 0.78, 1.0); lum = 0.5 + aSeed * 0.5; a = 0.35 + aSeed * 0.4; }
    else if (aKind > 1.5) { lum *= 1.25; a = (facing > 0.0 ? 0.95 : 0.12); }
    else if (aKind > 0.5) { lum *= 0.7; a *= 0.55; }
    vColor = col * lum;
    vAlpha = a;
    float size = aKind > 2.5 ? 1.4 : (aKind > 1.5 ? 1.7 : 1.9);
    gl_PointSize = uSize * size * uPixel * (0.55 + aSeed * 0.9) / -mv.z;
    gl_Position = projectionMatrix * mv;
  }`
const FRAG = /* glsl */ `
  uniform float uOpacity;
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    float d = length(gl_PointCoord - 0.5);
    float s = smoothstep(0.5, 0.0, d);
    gl_FragColor = vec4(vColor, s * vAlpha * uOpacity);
  }`
// Atmosphere: a slightly larger sphere, lit at its edge only.
const HALO_VERT = /* glsl */ `
  varying vec3 vN; varying vec3 vW;
  void main() { vN = normalize(normalMatrix * normal); vW = normalize(mat3(modelMatrix) * normal); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`
const HALO_FRAG = /* glsl */ `
  uniform vec3 uLight; uniform float uOpacity;
  varying vec3 vN; varying vec3 vW;
  void main() {
    float f = pow(1.0 - abs(vN.z), 3.0);
    vec3 warm = vec3(1.0, 0.1, 0.42), cool = vec3(0.25, 0.25, 1.0);
    vec3 col = mix(cool, warm, smoothstep(-0.5, 0.5, dot(vW, uLight)));
    gl_FragColor = vec4(col * f * 1.0, f * 0.75 * uOpacity);
  }`

export function mountGlobeScene(host: HTMLElement, opts: GlobeOptions): () => void {
  const coarse = window.matchMedia('(pointer: coarse)').matches
  const small = Math.min(window.innerWidth, window.innerHeight) < 700
  const nav = navigator as Navigator & { deviceMemory?: number }
  const weak = (nav.hardwareConcurrency || 8) <= 4 || (nav.deviceMemory || 8) <= 3
  // Particle budget: desktop, phone, slower device.
  const scale = (small || coarse ? 0.5 : 1) * (weak ? 0.6 : 1)
  const N_SURFACE = Math.round(42000 * scale), N_SHELL = Math.round(6000 * scale), N_STARS = Math.round(1800 * scale)

  let renderer: THREE.WebGLRenderer
  try {
    renderer = new THREE.WebGLRenderer({ antialias: false, alpha: true, powerPreference: 'default' })
  } catch { opts.onFail?.(); return () => {} }
  let dprCap = coarse ? 1.5 : 1.75
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, dprCap))
  renderer.setClearColor(0x000000, 0)
  host.appendChild(renderer.domElement)
  renderer.domElement.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block'

  const scene = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera(42, 1, 0.05, 100)
  const globe = new THREE.Group()
  scene.add(globe)

  // Points: surface (Fibonacci sphere with slight jitter), shell, rings, stars.
  const rand = rng(7)
  const pos: number[] = [], seed: number[] = [], kind: number[] = []
  const add = (x: number, y: number, z: number, k: number) => { pos.push(x, y, z); seed.push(rand()); kind.push(k) }
  const golden = Math.PI * (3 - Math.sqrt(5))
  for (let i = 0; i < N_SURFACE; i++) {
    const y = 1 - (i / (N_SURFACE - 1)) * 2, r = Math.sqrt(1 - y * y), th = golden * i + (rand() - 0.5) * 0.02
    add(Math.cos(th) * r, y, Math.sin(th) * r, 0)
  }
  for (let i = 0; i < N_SHELL; i++) {
    const u = rand() * 2 - 1, th = rand() * Math.PI * 2, r = Math.sqrt(1 - u * u), R = 1.03 + rand() * 0.06
    add(Math.cos(th) * r * R, u * R, Math.sin(th) * r * R, 1)
  }
  const ringPts = small || coarse ? 260 : 420
  for (let lat = -75; lat <= 75; lat += 15) {
    const y = Math.sin(lat * Math.PI / 180), r = Math.cos(lat * Math.PI / 180)
    for (let j = 0; j < ringPts * r; j++) { const a = (j / (ringPts * r)) * Math.PI * 2; add(Math.cos(a) * r * 1.004, y * 1.004, Math.sin(a) * r * 1.004, 2) }
  }
  for (let lon = 0; lon < 180; lon += 20) {
    const a = lon * Math.PI / 180
    for (let j = 0; j < ringPts; j++) { const t = (j / ringPts) * Math.PI * 2; add(Math.cos(t) * Math.cos(a) * 1.004, Math.sin(t) * 1.004, Math.cos(t) * Math.sin(a) * 1.004, 2) }
  }
  const starStart = pos.length / 3
  for (let i = 0; i < N_STARS; i++) {
    const u = rand() * 2 - 1, th = rand() * Math.PI * 2, r = Math.sqrt(1 - u * u), R = 9 + rand() * 8
    add(Math.cos(th) * r * R, u * R, Math.sin(th) * r * R, 3)
  }
  // Globe points in random order, so drawing fewer of them (slow devices)
  // thins the whole planet evenly instead of cutting part of it off.
  const order = Array.from({ length: starStart }, (_, i) => i)
  for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [order[i], order[j]] = [order[j], order[i]] }
  const gPos = new Float32Array(starStart * 3), gSeed = new Float32Array(starStart), gKind = new Float32Array(starStart)
  order.forEach((src, i) => { gPos[i * 3] = pos[src * 3]; gPos[i * 3 + 1] = pos[src * 3 + 1]; gPos[i * 3 + 2] = pos[src * 3 + 2]; gSeed[i] = seed[src]; gKind[i] = kind[src] })
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(gPos, 3))
  geo.setAttribute('aSeed', new THREE.BufferAttribute(gSeed, 1))
  geo.setAttribute('aKind', new THREE.BufferAttribute(gKind, 1))
  const uniforms = {
    uTime: { value: 0 }, uProgress: { value: 0 }, uPixel: { value: renderer.getPixelRatio() }, uSize: { value: 3.1 },
    uLight: { value: new THREE.Vector3(-1, 0.2, 0.3).normalize() }, uAmber: { value: new THREE.Vector3(0, 1, 0) }, uBand: { value: 0 }, uOpacity: { value: 1 },
  }
  const mat = new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: FRAG, uniforms, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })
  const points = new THREE.Points(geo, mat)
  globe.add(points)
  // Stars sit outside the globe's rotation so they read as a distant field.
  const starGeo = new THREE.BufferGeometry()
  starGeo.setAttribute('position', new THREE.Float32BufferAttribute(pos.slice(starStart * 3), 3))
  starGeo.setAttribute('aSeed', new THREE.Float32BufferAttribute(seed.slice(starStart), 1))
  starGeo.setAttribute('aKind', new THREE.Float32BufferAttribute(kind.slice(starStart), 1))
  const stars = new THREE.Points(starGeo, mat)
  scene.add(stars)
  const haloU = { uLight: uniforms.uLight, uOpacity: uniforms.uOpacity }
  const halo = new THREE.Mesh(new THREE.SphereGeometry(1.09, 64, 48), new THREE.ShaderMaterial({ vertexShader: HALO_VERT, fragmentShader: HALO_FRAG, uniforms: haloU, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.BackSide }))
  globe.add(halo)

  // Size and camera framing: a giant planet on phones (its cap fills the
  // width), a wide horizon on desktops.
  let W = 1, H = 1
  const resize = () => {
    W = Math.max(1, host.clientWidth); H = Math.max(1, host.clientHeight)
    renderer.setSize(W, H, false)
    camera.aspect = W / H; camera.updateProjectionMatrix()
    uniforms.uPixel.value = renderer.getPixelRatio() * (H / 900)
  }
  resize()
  const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(resize) : null
  ro?.observe(host)

  // Scroll progress through the section: 0 as it enters from below, 1 as
  // its end leaves. Read every frame (cheap) and eased.
  const progress = () => {
    const r = opts.section.getBoundingClientRect(), vh = window.innerHeight
    return clamp01((vh - r.top) / Math.max(1, r.height))
  }
  let p = progress(), pointerX = 0, pointerY = 0, px = 0, py = 0
  const onPointer = (e: PointerEvent) => {
    if (e.pointerType !== 'mouse') return
    pointerX = (e.clientX / window.innerWidth) * 2 - 1; pointerY = (e.clientY / window.innerHeight) * 2 - 1
  }
  window.addEventListener('pointermove', onPointer, { passive: true })

  let visible = false, raf = 0, last = performance.now(), t = 0, first = false, slow = 0, frames = 0, degraded = 0
  const frame = (now: number) => {
    raf = 0
    const dt = Math.min(0.05, (now - last) / 1000); last = now
    t += dt
    const target = progress()
    p += (target - p) * (1 - Math.exp(-dt * 6))
    px += (pointerX - px) * (1 - Math.exp(-dt * 3)); py += (pointerY - py) * (1 - Math.exp(-dt * 3))
    opts.onProgress?.(p)

    // Choreography (s = eased progress):
    // enter 0→0.3: the planet rises from below the screen;
    // 0.3→0.8: it turns, tilts and the light sweeps across; the camera
    // leans in; 0.8→1: it settles low and fades into the next section.
    const portrait = camera.aspect < 0.9
    const rise = smooth(0.0, 0.45, p)         // emerges from below
    const grow = smooth(0.4, 0.8, p)          // becomes the main attraction
    const exit = smooth(0.84, 1.0, p)         // sinks and dims into the next section
    const dist = portrait ? mix(2.85, 2.15, grow) : mix(2.5, 1.95, grow)
    camera.position.set(px * 0.12, mix(0.12, 0.3, grow) - py * 0.06, dist)
    camera.lookAt(0, mix(0.0, 0.1, grow), 0)
    globe.position.y = mix(-2.4, portrait ? -0.95 : -1.05, rise) + grow * 0.45 - exit * 0.55
    globe.scale.setScalar(mix(1, 1.1, grow))
    globe.rotation.y = t * 0.035 + p * 2.4 + px * 0.12
    globe.rotation.x = mix(0.5, -0.18, smooth(0.2, 0.9, p)) + py * 0.05
    globe.rotation.z = mix(-0.1, 0.08, p)
    const la = mix(-0.3, 2.6, p)
    uniforms.uLight.value.set(Math.cos(la), 0.25, Math.sin(la)).normalize()
    const aa = mix(0.6, 3.4, p) + t * 0.05
    uniforms.uAmber.value.set(Math.cos(aa) * 0.6, 0.75, Math.sin(aa) * 0.6).normalize()
    uniforms.uBand.value = t * 0.25 + p * 5.0
    uniforms.uProgress.value = p
    uniforms.uTime.value = t
    uniforms.uOpacity.value = mix(0.0, 1.0, smooth(0.0, 0.22, p)) * (1 - exit * 0.45)
    stars.rotation.y = p * 0.4 + t * 0.004

    renderer.render(scene, camera)
    if (!first) { first = true; opts.onFirstFrame?.() }

    // Frames running slow: fewer pixels first, then fewer particles.
    frames++
    if (dt > 0.028) slow++
    if (frames >= 90) {
      if (slow > 45 && degraded < 2) {
        degraded++
        if (degraded === 1) { dprCap = 1; renderer.setPixelRatio(1); resize() }
        else geo.setDrawRange(0, Math.round(starStart * 0.55))
      }
      frames = 0; slow = 0
    }
    if (visible && document.visibilityState === 'visible') raf = requestAnimationFrame(frame)
  }
  const kick = () => { if (!raf && visible && document.visibilityState === 'visible') { last = performance.now(); raf = requestAnimationFrame(frame) } }
  const io = new IntersectionObserver(e => { visible = e[0].isIntersecting; if (visible) kick() }, { rootMargin: '120px' })
  io.observe(opts.section)
  const onVis = () => kick()
  document.addEventListener('visibilitychange', onVis)
  const onLost = (e: Event) => { e.preventDefault(); opts.onFail?.() }
  renderer.domElement.addEventListener('webglcontextlost', onLost)

  return () => {
    if (raf) cancelAnimationFrame(raf)
    io.disconnect(); ro?.disconnect()
    window.removeEventListener('pointermove', onPointer)
    document.removeEventListener('visibilitychange', onVis)
    renderer.domElement.removeEventListener('webglcontextlost', onLost)
    geo.dispose(); starGeo.dispose(); mat.dispose(); halo.geometry.dispose(); (halo.material as THREE.Material).dispose()
    renderer.dispose()
    renderer.domElement.remove()
  }
}
