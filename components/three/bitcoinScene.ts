import * as THREE from 'three'

/* Real-time 3D scene: a gold Bitcoin coin turning slowly above a glowing
   growth line that draws itself upward, with warm particles rising behind.
   Purely decorative (no data): the line is a stylised "growth" curve, not a
   price chart. Rendered only while on screen and the tab is visible; a
   single still frame when the visitor prefers reduced motion. */

export type Variant = 'hero' | 'banner'
// Canvas px: coin centre and diameter, and where the growth line starts.
export type Place = { x: number; y: number; size: number; lineFrom?: { x: number; y: number }; lineTo?: { x: number; y: number }; noLine?: boolean }
export type Options = {
  variant: Variant
  place: (w: number, h: number) => Place
  scrollEl?: HTMLElement | null // element whose scroll position drives the motion (hero)
  onFirstFrame?: () => void
  onFail?: () => void
}

const rng = (seed: number) => { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296) }

// Coin face: raised rim ring, dotted ring and the ₿ mark, drawn as a height
// map; the normal map is derived from it (Sobel), so light catches the relief.
function faceMaps(size: number) {
  const hc = document.createElement('canvas'); hc.width = hc.height = size
  const hx = hc.getContext('2d')!
  const C = size / 2, R = size / 2
  hx.fillStyle = '#000'; hx.fillRect(0, 0, size, size)
  hx.filter = `blur(${Math.max(1, size / 340)}px)`
  hx.beginPath(); hx.arc(C, C, R * 0.86, 0, Math.PI * 2); hx.lineWidth = R * 0.035; hx.strokeStyle = 'rgb(210,210,210)'; hx.stroke()
  for (let i = 0; i < 96; i++) { const a = i / 96 * Math.PI * 2; hx.beginPath(); hx.arc(C + Math.cos(a) * R * 0.79, C + Math.sin(a) * R * 0.79, R * 0.0095, 0, Math.PI * 2); hx.fillStyle = 'rgb(160,160,160)'; hx.fill() }
  const B = new Path2D('M-92,-196 h36 v-46 h40 v46 h30 v-46 h40 v50 c78,10 122,48 122,104 c0,44 -26,74 -66,86 c56,12 90,50 90,104 c0,78 -60,124 -160,128 v48 h-40 v-48 h-30 v48 h-40 v-48 h-36 z M-24,-130 v96 h76 c40,0 64,-18 64,-48 c0,-30 -24,-48 -64,-48 z M-24,30 v104 h88 c46,0 72,-20 72,-52 c0,-32 -26,-52 -72,-52 z')
  hx.save(); hx.translate(C - R * 0.03, C + R * 0.02); hx.rotate(14 * Math.PI / 180); const sc = R * 0.0021; hx.scale(sc, sc); hx.translate(-36, -20)
  hx.filter = `blur(${Math.max(1, size / 200)}px)`; hx.fillStyle = '#fff'; hx.fill(B, 'evenodd'); hx.restore()
  hx.filter = 'none'
  const hd = hx.getImageData(0, 0, size, size).data
  const nc = document.createElement('canvas'); nc.width = nc.height = size
  const nx = nc.getContext('2d')!, nd = nx.createImageData(size, size)
  const at = (x: number, y: number) => hd[((Math.min(size - 1, Math.max(0, y)) * size) + Math.min(size - 1, Math.max(0, x))) * 4] / 255
  const k = 6 * (size / 768)
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const dx = (at(x + 1, y) - at(x - 1, y)) * k, dy = (at(x, y + 1) - at(x, y - 1)) * k
    let X = -dx, Y = dy, Z = 1; const l = Math.hypot(X, Y, Z); X /= l; Y /= l; Z /= l
    const i = (y * size + x) * 4
    nd.data[i] = (X * 0.5 + 0.5) * 255; nd.data[i + 1] = (Y * 0.5 + 0.5) * 255; nd.data[i + 2] = (Z * 0.5 + 0.5) * 255; nd.data[i + 3] = 255
  }
  nx.putImageData(nd, 0, 0)
  // Roughness: raised relief polished, the field finely turned.
  const rc = document.createElement('canvas'); rc.width = rc.height = 256
  const rx = rc.getContext('2d')!, rd = rx.createImageData(256, 256)
  for (let y = 0; y < 256; y++) for (let x = 0; x < 256; x++) {
    const u = (x - 128) / 128, v = (y - 128) / 128, r = Math.hypot(u, v)
    const raised = at(Math.round(x * size / 256), Math.round(y * size / 256))
    const rough = (0.3 + (0.5 + 0.5 * Math.sin(r * 260)) * 0.06) * (1 - raised * 0.55)
    const i = (y * 256 + x) * 4; rd.data[i] = rd.data[i + 1] = rd.data[i + 2] = Math.round(rough * 255); rd.data[i + 3] = 255
  }
  rx.putImageData(rd, 0, 0)
  return { normal: nc, rough: rc }
}

function glowSprite() {
  const c = document.createElement('canvas'); c.width = c.height = 64
  const g = c.getContext('2d')!, gr = g.createRadialGradient(32, 32, 0, 32, 32, 32)
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.25, 'rgba(255,255,255,.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)')
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64)
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace
  return t
}

export function mountBitcoinScene(host: HTMLElement, opts: Options): () => void {
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  const coarse = window.matchMedia('(pointer: coarse)').matches
  const hero = opts.variant === 'hero'

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'default' })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, coarse ? 1.5 : 1.75))
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.toneMappingExposure = 1.25
  renderer.outputColorSpace = THREE.SRGBColorSpace
  renderer.setClearColor(0x000000, 0)
  const cv = renderer.domElement
  cv.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block;pointer-events:none'
  host.appendChild(cv)

  const scene = new THREE.Scene()
  const disposables: { dispose: () => void }[] = []
  const keep = <T extends { dispose: () => void }>(x: T) => { disposables.push(x); return x }

  // Studio reflections: dark room with warm softboxes (no image files).
  const env = new THREE.Scene()
  const box = (w: number, h: number, color: number, k: number, p: [number, number, number]) => {
    const m = new THREE.Mesh(keep(new THREE.PlaneGeometry(w, h)), keep(new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(k), side: THREE.DoubleSide })))
    m.position.set(...p); m.lookAt(0, 0, 0); env.add(m)
  }
  box(6, 3, 0xffd9a0, 6, [5, 6, 6]); box(4, 6, 0xffb35a, 2.4, [-7, 2, -4]); box(10, 1, 0xfff1d6, 1.4, [0, 9, 2])
  box(6, 2, 0x6f5233, 0.6, [0, -4, 5]); box(3, 3, 0x9fb6d6, 0.25, [-8, 3, 6])
  const pmrem = new THREE.PMREMGenerator(renderer)
  const envTex = keep(pmrem.fromScene(env, 0.02).texture); pmrem.dispose()
  scene.environment = envTex

  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 100)
  camera.position.set(0, 0, 10)
  const halfH = Math.tan(THREE.MathUtils.degToRad(15)) * 10 // world half-height at z=0

  // ---- coin (axis along z, facing the camera) ----
  const T = 0.075
  const gold = keep(new THREE.MeshStandardMaterial({ color: new THREE.Color(1.0, 0.77, 0.36), metalness: 1, roughness: 0.25, envMapIntensity: 1.9 }))
  const goldEdge = keep(gold.clone()); goldEdge.roughness = 0.36
  const prof = [[0, T - 0.006], [0.855, T - 0.006], [0.875, T + 0.012], [0.955, T + 0.016], [0.985, T + 0.006], [1.0, T - 0.01],
    [1.0, -T + 0.01], [0.985, -T - 0.006], [0.955, -T - 0.016], [0.875, -T - 0.012], [0.855, -T + 0.006], [0, -T + 0.006]].map(([r, y]) => new THREE.Vector2(r, y))
  const body = new THREE.Mesh(keep(new THREE.LatheGeometry(prof, 160)), gold); body.rotation.x = Math.PI / 2
  const eg = keep(new THREE.CylinderGeometry(1, 1, 2 * T - 0.02, 720, 1, true))
  const ep = eg.attributes.position
  for (let i = 0; i < ep.count; i++) { const x = ep.getX(i), z = ep.getZ(i), a = Math.atan2(z, x), r = 1.0015 - 0.006 * (0.5 + 0.5 * Math.cos(a * 160)); ep.setX(i, Math.cos(a) * r); ep.setZ(i, Math.sin(a) * r) }
  eg.computeVertexNormals()
  const edge = new THREE.Mesh(eg, goldEdge); edge.rotation.x = Math.PI / 2
  const maps = faceMaps(coarse ? 512 : 768)
  const normalTex = keep(new THREE.CanvasTexture(maps.normal)), roughTex = keep(new THREE.CanvasTexture(maps.rough))
  normalTex.anisotropy = roughTex.anisotropy = 4
  const faceMat = keep(new THREE.MeshStandardMaterial({ color: gold.color, metalness: 1, roughness: 1, roughnessMap: roughTex, normalMap: normalTex, normalScale: new THREE.Vector2(1.3, 1.3), envMapIntensity: 1.85 }))
  const faceGeo = keep(new THREE.CircleGeometry(0.862, 128))
  const front = new THREE.Mesh(faceGeo, faceMat); front.position.z = T - 0.006
  const back = new THREE.Mesh(faceGeo, faceMat); back.position.z = -(T - 0.006); back.rotation.y = Math.PI
  const coin = new THREE.Group(); coin.add(body, edge, front, back)
  const holder = new THREE.Group(); holder.add(coin); scene.add(holder)

  const key = new THREE.DirectionalLight(0xffdcb0, 2.6); key.position.set(3, 4, 6); scene.add(key)
  const rim = new THREE.PointLight(0xff9b3d, 24, 12, 1.6); rim.position.set(-2.5, 2, -2.5); scene.add(rim)
  scene.add(new THREE.HemisphereLight(0x3a2c1c, 0x050403, 0.35))

  // ---- growth line (stylised, always rising overall) ----
  const R = rng(7)
  const N = 9, pts: THREE.Vector3[] = []
  for (let i = 0; i < N; i++) {
    const f = i / (N - 1)
    const wob = i === 0 || i === N - 1 ? 0 : (R() - 0.45) * 0.55
    pts.push(new THREE.Vector3(f, Math.pow(f, 1.35) + wob * (1 - f * 0.6) * 0.35, 0))
  }
  const lineGroup = new THREE.Group(); scene.add(lineGroup)
  const SEG = 320
  const lineMat = keep(new THREE.MeshBasicMaterial({ color: 0xffa640, toneMapped: false, transparent: true, opacity: 1 }))
  const glowMat = keep(new THREE.MeshBasicMaterial({ color: 0xff8a1f, toneMapped: false, transparent: true, opacity: 0.22, depthWrite: false }))
  const areaMat = keep(new THREE.ShaderMaterial({
    transparent: true, depthWrite: false,
    uniforms: { uColor: { value: new THREE.Color(0xff9a2e) }, uAlpha: { value: 0.16 } },
    vertexShader: 'attribute float aT; attribute float aU; varying float vT; varying float vU; void main(){ vT = aT; vU = aU; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    // fades in from the line's start so the fill never shows a hard edge
    fragmentShader: 'uniform vec3 uColor; uniform float uAlpha; varying float vT; varying float vU; void main(){ gl_FragColor = vec4(uColor, uAlpha * pow(vT, 1.6) * smoothstep(0.0, 0.22, vU)); }',
  }))
  const gridMat = keep(new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.05 }))
  const spriteTex = keep(glowSprite())
  const headMat = keep(new THREE.SpriteMaterial({ map: spriteTex, color: 0xffc070, transparent: true, depthWrite: false, toneMapped: false }))
  const head = new THREE.Sprite(headMat); scene.add(head)
  // The line is rebuilt in world space whenever the layout changes, so its
  // thickness stays even at any aspect ratio.
  let curve: THREE.CatmullRomCurve3 | null = null
  let tube: THREE.TubeGeometry | null = null, tubeGlow: THREE.TubeGeometry | null = null
  let areaGeo: THREE.BufferGeometry | null = null, gridGeo: THREE.BufferGeometry | null = null
  const buildLine = (start: THREE.Vector3, end: THREE.Vector3, thick: number) => {
    lineGroup.clear(); tube?.dispose(); tubeGlow?.dispose(); areaGeo?.dispose(); gridGeo?.dispose()
    const dx = end.x - start.x, dy = end.y - start.y
    curve = new THREE.CatmullRomCurve3(pts.map(p => new THREE.Vector3(start.x + p.x * dx, start.y + p.y * dy, -0.6)), false, 'centripetal')
    tube = new THREE.TubeGeometry(curve, SEG, thick, 6, false)
    tubeGlow = new THREE.TubeGeometry(curve, SEG, thick * 3.4, 6, false)
    const base = start.y - Math.abs(dy) * 0.18
    areaGeo = new THREE.BufferGeometry()
    const aPos = new Float32Array((SEG + 1) * 6), aT = new Float32Array((SEG + 1) * 2), aU = new Float32Array((SEG + 1) * 2), idx: number[] = []
    for (let i = 0; i <= SEG; i++) {
      const p = curve.getPoint(i / SEG)
      aPos.set([p.x, p.y, -0.62, p.x, base, -0.62], i * 6); aT[i * 2] = 1; aT[i * 2 + 1] = 0; aU[i * 2] = aU[i * 2 + 1] = i / SEG
      if (i < SEG) { const k = i * 2; idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2) }
    }
    areaGeo.setAttribute('position', new THREE.BufferAttribute(aPos, 3)); areaGeo.setAttribute('aT', new THREE.BufferAttribute(aT, 1)); areaGeo.setAttribute('aU', new THREE.BufferAttribute(aU, 1)); areaGeo.setIndex(idx)
    gridGeo = new THREE.BufferGeometry()
    const gp: number[] = []
    for (let i = 0; i <= 4; i++) { const y = base + (i / 4) * (end.y - base); gp.push(start.x, y, -0.64, end.x + Math.abs(dx) * 0.08, y, -0.64) }
    gridGeo.setAttribute('position', new THREE.Float32BufferAttribute(gp, 3))
    lineGroup.add(new THREE.LineSegments(gridGeo, gridMat), new THREE.Mesh(areaGeo, areaMat), new THREE.Mesh(tubeGlow, glowMat), new THREE.Mesh(tube, lineMat))
  }

  // ---- rising particles ----
  const PN = hero ? (coarse ? 110 : 200) : (coarse ? 50 : 90)
  const pGeo = keep(new THREE.BufferGeometry())
  const pPos = new Float32Array(PN * 3), pSpeed = new Float32Array(PN), pPhase = new Float32Array(PN)
  const PR = rng(19)
  for (let i = 0; i < PN; i++) { pPos.set([(PR() - 0.5) * 2, (PR() - 0.5) * 2, (PR() - 0.5) * 2], i * 3); pSpeed[i] = 0.05 + PR() * 0.12; pPhase[i] = PR() * 6.28 }
  pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3))
  const pMat = keep(new THREE.PointsMaterial({ map: spriteTex, color: 0xffb04a, size: 0.07, transparent: true, opacity: 0.75, depthWrite: false, sizeAttenuation: true, toneMapped: false }))
  const particles = new THREE.Points(pGeo, pMat); scene.add(particles)

  // ---- theme: additive glow on dark pages, solid colours on light ----
  const applyTheme = () => {
    const light = document.documentElement.getAttribute('data-theme') === 'light'
    const blend = light ? THREE.NormalBlending : THREE.AdditiveBlending
    for (const m of [glowMat, pMat, headMat]) { m.blending = blend; m.needsUpdate = true }
    areaMat.blending = light ? THREE.NormalBlending : THREE.AdditiveBlending; areaMat.needsUpdate = true
    lineMat.color.set(light ? 0xe07a06 : 0xffa640)
    glowMat.opacity = light ? 0.14 : 0.22
    pMat.color.set(light ? 0xd98a1c : 0xffb04a); pMat.opacity = light ? 0.55 : 0.75
    areaMat.uniforms.uAlpha.value = light ? 0.12 : 0.16
    gridMat.color.set(light ? 0x10151e : 0xffffff); gridMat.opacity = light ? 0.06 : 0.05
    renderer.toneMappingExposure = light ? 1.1 : 1.4
  }
  applyTheme()
  const themeObs = new MutationObserver(applyTheme)
  themeObs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'class'] })

  // ---- layout ----
  let W = 1, H = 1, place: Place = { x: 0, y: 0, size: 100 }, unit = 1
  const toWorld = (px: number, py: number) => new THREE.Vector3((px / W - 0.5) * 2 * halfH * (W / H), -(py / H - 0.5) * 2 * halfH, 0)
  const layout = () => {
    const r = host.getBoundingClientRect()
    W = Math.max(1, Math.round(r.width)); H = Math.max(1, Math.round(r.height))
    renderer.setSize(W, H, false)
    camera.aspect = W / H; camera.updateProjectionMatrix()
    place = opts.place(W, H)
    unit = (2 * halfH) / H // world units per px
    const s = (place.size / 2) * unit
    holder.scale.setScalar(s)
    holder.position.copy(toWorld(place.x, place.y))
    // growth line from the lower left to just under the coin
    const from = place.lineFrom ?? { x: 0, y: H * 1.02 }
    const start = toWorld(from.x, from.y)
    const to = place.lineTo ?? { x: place.x - place.size * 0.3, y: place.y + place.size * 0.5 }
    const end = toWorld(to.x, to.y)
    buildLine(start, end, Math.max(0.006, unit * (hero ? 1.6 : 1.3)))
    lineGroup.visible = head.visible = !place.noLine
    head.scale.setScalar(unit * (hero ? 46 : 34))
    // particles fill a volume around the coin and line
    particles.position.set((start.x + end.x) / 2 + (holder.position.x - (start.x + end.x) / 2) * 0.4, (start.y + holder.position.y) / 2, -1)
    particles.scale.set(Math.abs(end.x - start.x) * 0.75 + s * 2, Math.abs(holder.position.y - start.y) * 0.9 + s * 2, 1.5)
    pMat.size = Math.max(0.05, s * 0.1)
  }

  // ---- motion ----
  let scrollP = 0, ptrX = 0, ptrY = 0, sx = 0, sy = 0
  const readScroll = () => {
    if (!opts.scrollEl) return
    const r = opts.scrollEl.getBoundingClientRect()
    scrollP = Math.min(1, Math.max(0, -r.top / Math.max(1, r.height * 0.9)))
  }
  const onPtr = (e: PointerEvent) => { ptrX = (e.clientX / window.innerWidth) * 2 - 1; ptrY = (e.clientY / window.innerHeight) * 2 - 1 }
  const clock = new THREE.Clock()
  let intro = reduce ? 1 : 0
  const frame = (t: number) => {
    const ease = (x: number) => 1 - Math.pow(1 - x, 3)
    const draw = Math.min(1, ease(intro) * (hero ? 0.82 + 0.18 * scrollP : 1))
    const cut = (n: number, per: number) => Math.max(per, Math.floor((n / per) * draw) * per)
    if (tube && tubeGlow && areaGeo && curve) {
      tube.setDrawRange(0, cut(tube.index!.count, 6 * 6)); tubeGlow.setDrawRange(0, cut(tubeGlow.index!.count, 6 * 6)); areaGeo.setDrawRange(0, cut(areaGeo.index!.count, 6))
      head.position.copy(curve.getPoint(Math.min(1, draw))); head.position.z = -0.55
    }
    headMat.opacity = 0.9 * Math.min(1, intro * 2)
    // coin: slow continuous turn, gentle float; scroll lifts and turns it
    sx += (ptrX - sx) * 0.05; sy += (ptrY - sy) * 0.05
    coin.rotation.y = t * 0.45 + scrollP * Math.PI
    coin.rotation.x = -0.12 + sy * 0.08
    holder.rotation.z = -0.06 + sx * 0.04
    const base = toWorld(place.x, place.y)
    holder.position.set(base.x + sx * 0.08, base.y + Math.sin(t * 0.9) * place.size * unit * 0.025 + scrollP * place.size * unit * 0.35, 0)
    // particles drift upward and wrap
    const a = pGeo.attributes.position as THREE.BufferAttribute
    for (let i = 0; i < PN; i++) {
      let y = a.getY(i) + pSpeed[i] * 0.016
      if (y > 1) y -= 2
      a.setY(i, y); a.setX(i, a.getX(i) + Math.sin(t * 0.6 + pPhase[i]) * 0.0008)
    }
    a.needsUpdate = true
    camera.position.set(sx * 0.15, -sy * 0.1 - scrollP * 0.4, 10)
    camera.lookAt(0, -scrollP * 0.4, 0)
    renderer.render(scene, camera)
  }

  let raf = 0, visible = false, first = true, dead = false
  const loop = () => {
    raf = 0
    if (dead) return
    const dt = Math.min(0.05, clock.getDelta())
    intro = Math.min(1, intro + dt / 2.4)
    readScroll()
    frame(clock.elapsedTime)
    if (first) { first = false; opts.onFirstFrame?.() }
    if (!reduce && visible && document.visibilityState === 'visible') raf = requestAnimationFrame(loop)
  }
  const kick = () => { if (!raf && !dead) raf = requestAnimationFrame(loop) }

  layout()
  const ro = new ResizeObserver(() => { layout(); if (reduce) kick() })
  ro.observe(host)
  const io = new IntersectionObserver(e => { visible = e[0].isIntersecting; if (visible) { clock.getDelta(); kick() } })
  io.observe(host)
  const onVis = () => { if (document.visibilityState === 'visible') { clock.getDelta(); kick() } }
  document.addEventListener('visibilitychange', onVis)
  const fine = window.matchMedia('(pointer: fine)').matches
  if (fine && !reduce) window.addEventListener('pointermove', onPtr, { passive: true })
  const onScroll = () => { if (reduce) { readScroll(); kick() } }
  window.addEventListener('scroll', onScroll, { passive: true })
  const onLost = (e: Event) => { e.preventDefault(); dead = true; opts.onFail?.() }
  cv.addEventListener('webglcontextlost', onLost)
  kick()

  return () => {
    dead = true
    if (raf) cancelAnimationFrame(raf)
    ro.disconnect(); io.disconnect(); themeObs.disconnect()
    document.removeEventListener('visibilitychange', onVis)
    window.removeEventListener('pointermove', onPtr)
    window.removeEventListener('scroll', onScroll)
    cv.removeEventListener('webglcontextlost', onLost)
    tube?.dispose(); tubeGlow?.dispose(); areaGeo?.dispose(); gridGeo?.dispose()
    for (const d of disposables) d.dispose()
    renderer.dispose()
    renderer.forceContextLoss()
    cv.remove()
  }
}
