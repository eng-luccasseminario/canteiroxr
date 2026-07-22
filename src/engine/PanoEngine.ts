import * as THREE from "three"
import { ImmersiveEngine } from "./ImmersiveEngine"

export interface Hotspot { yaw: number; pitch: number; target: number }
export interface PanoScene { id: number; name: string; url: string; tex: THREE.Texture | null; hotspots: Hotspot[] }

const R = 500

// Modo 360: esfera equiretangular vista de dentro, com tour por hotspots.
export class PanoEngine extends ImmersiveEngine {
  private sphere: THREE.Mesh
  private sphereMat: THREE.MeshBasicMaterial
  private texLoader = new THREE.TextureLoader()
  private hotGroup = new THREE.Group()
  private hotTex: THREE.CanvasTexture
  private ray = new THREE.Raycaster()
  private ndc = new THREE.Vector2()

  private scenes: PanoScene[] = []
  private curId: number | null = null
  private seq = 1
  private lon = 0
  private lat = 0
  private down = false
  private px = 0
  private py = 0
  private useGyro = false
  private linkMode = false
  private pending: { yaw: number; pitch: number } | null = null

  // transição suave (cross-fade através do preto) entre cenas 360
  private fadeTarget: number | null = null
  private fadePhase: "out" | "in" = "out"

  onScenesChange?: () => void
  onSceneChange?: (id: number | null) => void
  onPlaceHotspot?: () => void
  onNeedSecondScene?: () => void

  constructor(canvas: HTMLCanvasElement) {
    super(canvas)
    this.monoFov = 75
    this.camera.fov = 75
    this.camera.position.set(0, 0, 0)
    this.camera.updateProjectionMatrix()

    const geo = new THREE.SphereGeometry(R, 60, 40)
    geo.scale(-1, 1, 1)
    this.sphereMat = new THREE.MeshBasicMaterial({ color: 0x1a2233 })
    this.sphere = new THREE.Mesh(geo, this.sphereMat)
    this.scene.add(this.sphere)
    this.scene.add(this.hotGroup)
    this.hotTex = this.makeHotspotTexture()

    const dom = this.renderer.domElement
    this.onDown = this.onDown.bind(this); this.onMove = this.onMove.bind(this); this.onUp = this.onUp.bind(this)
    this.onWheel = this.onWheel.bind(this); this.onClick = this.onClick.bind(this); this.onFirstTouch = this.onFirstTouch.bind(this)
    dom.addEventListener("pointerdown", this.onDown)
    dom.addEventListener("pointermove", this.onMove)
    addEventListener("pointerup", this.onUp)
    dom.addEventListener("wheel", this.onWheel, { passive: true })
    dom.addEventListener("click", this.onClick)
    dom.addEventListener("touchstart", this.onFirstTouch, { once: true })
  }

  private makeHotspotTexture(): THREE.CanvasTexture {
    const c = document.createElement("canvas"); c.width = c.height = 128
    const x = c.getContext("2d")!
    x.beginPath(); x.arc(64, 64, 52, 0, 7); x.fillStyle = "rgba(22,104,220,.9)"; x.fill()
    x.lineWidth = 8; x.strokeStyle = "#fff"; x.stroke()
    x.fillStyle = "#fff"; x.font = "bold 70px system-ui"; x.textAlign = "center"; x.textBaseline = "middle"; x.fillText("›", 64, 58)
    return new THREE.CanvasTexture(c)
  }

  // ---- cenas ----
  getScenes(): PanoScene[] { return this.scenes }
  getCurrentId(): number | null { return this.curId }
  getScene(id: number): PanoScene | undefined { return this.scenes.find((s) => s.id === id) }
  private current(): PanoScene | undefined { return this.curId != null ? this.getScene(this.curId) : undefined }
  getOtherScenes(): PanoScene[] { return this.scenes.filter((s) => s.id !== this.curId) }

  addFiles(files: FileList | File[]): void {
    let first: PanoScene | null = null
    Array.from(files).forEach((f, i) => {
      const url = URL.createObjectURL(f)
      const s: PanoScene = { id: this.seq++, name: f.name.replace(/\.[^.]+$/, ""), url, tex: null, hotspots: [] }
      this.scenes.push(s)
      if (i === 0) first = s
    })
    this.onScenesChange?.()
    if (first && this.curId == null) this.showScene((first as PanoScene).id)
  }

  showScene(id: number): void {
    const s = this.getScene(id); if (!s) return
    this.curId = id
    const apply = (tex: THREE.Texture) => {
      tex.colorSpace = THREE.SRGBColorSpace
      tex.mapping = THREE.EquirectangularReflectionMapping
      this.sphereMat.map = tex; this.sphereMat.color.set(0xffffff); this.sphereMat.needsUpdate = true
      this.buildHotspots()
    }
    if (s.tex) apply(s.tex)
    else this.texLoader.load(s.url, (tex) => { s.tex = tex; apply(tex) })
    this.onSceneChange?.(id)
    this.onScenesChange?.()
  }

  removeScene(id: number): void {
    this.scenes = this.scenes.filter((s) => s.id !== id)
    this.scenes.forEach((s) => (s.hotspots = s.hotspots.filter((h) => h.target !== id)))
    if (this.curId === id) {
      this.curId = null
      if (this.scenes.length) this.showScene(this.scenes[0].id)
      else { this.sphereMat.map = null; this.sphereMat.color.set(0x1a2233); this.hotGroup.clear(); this.onSceneChange?.(null) }
    }
    this.onScenesChange?.()
  }

  // ---- hotspots ----
  private dir(yaw: number, pitch: number): THREE.Vector3 {
    const p = THREE.MathUtils.degToRad(90 - pitch), t = THREE.MathUtils.degToRad(yaw)
    return new THREE.Vector3(Math.sin(p) * Math.cos(t), Math.cos(p), Math.sin(p) * Math.sin(t))
  }
  private buildHotspots(): void {
    this.hotGroup.clear()
    const s = this.current(); if (!s) return
    s.hotspots.forEach((h) => {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.hotTex, depthTest: false, transparent: true }))
      sp.position.copy(this.dir(h.yaw, h.pitch).multiplyScalar(R * 0.86))
      sp.scale.setScalar(40); sp.renderOrder = 10; sp.userData = { target: h.target }
      this.hotGroup.add(sp)
    })
  }
  /** vai para outra cena 360 com transição suave (fade). Não altera showScene(). */
  transitionToScene(id: number): void {
    if (id === this.curId || !this.getScene(id) || this.fadeTarget != null) return
    this.fadeTarget = id
    this.fadePhase = "out"
    this.sphereMat.transparent = true
  }
  /** próxima / anterior cena na ordem da lista (para o ícone "próxima visão") */
  nextScene(dir = 1): void {
    if (this.scenes.length < 2 || this.curId == null) return
    const i = this.scenes.findIndex((s) => s.id === this.curId)
    const n = (i + dir + this.scenes.length) % this.scenes.length
    this.transitionToScene(this.scenes[n].id)
  }
  private stepFade(): void {
    if (this.fadeTarget == null) return
    const speed = 0.07
    if (this.fadePhase === "out") {
      this.hotGroup.visible = false
      this.sphereMat.opacity = Math.max(0, this.sphereMat.opacity - speed)
      if (this.sphereMat.opacity <= 0.001) {
        this.showScene(this.fadeTarget)   // troca a textura no ponto mais escuro
        this.sphereMat.transparent = true; this.sphereMat.opacity = 0
        this.fadePhase = "in"
      }
    } else {
      this.sphereMat.opacity = Math.min(1, this.sphereMat.opacity + speed)
      if (this.sphereMat.opacity >= 0.999) {
        this.sphereMat.opacity = 1; this.sphereMat.transparent = false
        this.hotGroup.visible = true; this.fadeTarget = null
      }
    }
  }

  setLinkMode(on: boolean): void { this.linkMode = on; if (!on) this.pending = null }
  isLinkMode(): boolean { return this.linkMode }
  commitHotspot(target: number): void {
    const s = this.current()
    if (s && this.pending) { s.hotspots.push({ ...this.pending, target }); this.buildHotspots() }
    this.pending = null; this.linkMode = false
  }
  cancelHotspot(): void { this.pending = null; this.linkMode = false }

  // ---- gyro em modo normal (celular) ----
  async enableGyro(): Promise<void> { const ok = await this.requestGyro(); if (ok) this.useGyro = true }
  private onFirstTouch() { if (!this.gyroActive) this.enableGyro() }

  // ---- interação ----
  private onDown(e: PointerEvent) { if (this.vrMode) return; this.down = true; this.px = e.clientX; this.py = e.clientY }
  private onMove(e: PointerEvent) {
    if (!this.down || this.vrMode) return
    this.lon -= (e.clientX - this.px) * 0.13
    this.lat = Math.max(-85, Math.min(85, this.lat + (e.clientY - this.py) * 0.13))
    this.px = e.clientX; this.py = e.clientY; this.useGyro = false
  }
  private onUp() { this.down = false }
  private onWheel(e: WheelEvent) {
    if (this.vrMode) return
    this.camera.fov = Math.max(30, Math.min(95, this.camera.fov + e.deltaY * 0.03))
    this.camera.updateProjectionMatrix()
  }
  private onClick(e: MouseEvent) {
    if (this.vrMode) { this.exitVR(); return }
    this.ndc.x = (e.clientX / innerWidth) * 2 - 1
    this.ndc.y = -(e.clientY / innerHeight) * 2 + 1
    this.ray.setFromCamera(this.ndc, this.camera)
    if (this.linkMode) {
      const hit = this.ray.intersectObject(this.sphere)[0]
      if (!hit) return
      if (!this.getOtherScenes().length) { this.linkMode = false; this.onNeedSecondScene?.(); return }
      const v = hit.point.clone().normalize()
      const yaw = THREE.MathUtils.radToDeg(Math.atan2(v.z, v.x))
      const pitch = 90 - THREE.MathUtils.radToDeg(Math.acos(Math.max(-1, Math.min(1, v.y))))
      this.pending = { yaw, pitch }
      this.onPlaceHotspot?.()
      return
    }
    const hit = this.ray.intersectObjects(this.hotGroup.children)[0]
    if (hit) { const t = hit.object.userData.target as number; if (this.getScene(t)) this.showScene(t) }
  }

  protected onExitVR() { /* nada extra: câmera fica na origem */ }
  protected onDispose() {
    const dom = this.renderer.domElement
    dom.removeEventListener("pointerdown", this.onDown)
    dom.removeEventListener("pointermove", this.onMove)
    removeEventListener("pointerup", this.onUp)
    dom.removeEventListener("wheel", this.onWheel)
    dom.removeEventListener("click", this.onClick)
    this.scenes.forEach((s) => { if (s.url.startsWith("blob:")) URL.revokeObjectURL(s.url) })
  }
  protected renderMono() {
    this.stepFade()
    if (this.gyroActive && this.useGyro) {
      this.camera.quaternion.copy(this.gyroQuat)
    } else {
      const phi = THREE.MathUtils.degToRad(90 - this.lat), th = THREE.MathUtils.degToRad(this.lon)
      this.camera.lookAt(Math.sin(phi) * Math.cos(th), Math.cos(phi), Math.sin(phi) * Math.sin(th))
    }
    this.renderer.render(this.scene, this.camera)
  }
}
