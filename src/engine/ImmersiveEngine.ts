import * as THREE from "three"
import { loadSettings, saveSettings, type VrSettings } from "./vrSettings"

// Base comum dos modos VR e 360: renderer, câmera, StereoCamera (tela dividida),
// giroscópio (deviceorientation → quaternion), fullscreen e loop de render.
export abstract class ImmersiveEngine {
  protected renderer: THREE.WebGLRenderer
  protected scene = new THREE.Scene()
  protected camera: THREE.PerspectiveCamera
  protected stereo = new THREE.StereoCamera()
  protected settings: VrSettings
  protected vrMode = false
  protected monoFov = 72
  protected gyroActive = false
  protected gyroQuat = new THREE.Quaternion()

  private orient = 0
  private raf = 0
  private lastFrameT = 0
  private readonly size = new THREE.Vector2()
  private readonly zee = new THREE.Vector3(0, 0, 1)
  private readonly q1 = new THREE.Quaternion(-Math.sqrt(0.5), 0, 0, Math.sqrt(0.5))
  private readonly q0 = new THREE.Quaternion()
  private readonly euler = new THREE.Euler()
  private exitHintTimer = 0

  /** callback p/ o React saber quando entra/sai do VR */
  onVrChange?: (vr: boolean) => void
  /** callback p/ a UI saber quando um controle (joystick) conecta/desconecta */
  onGamepad?: (connected: boolean) => void
  protected gamepadConnected = false
  isGamepadConnected(): boolean { return this.gamepadConnected }
  /** callback de DIAGNÓSTICO: mostra o que o controle/teclado está mandando (p/ depurar VR Box) */
  onInputDebug?: (text: string) => void

  constructor(canvas: HTMLCanvasElement) {
    const vp = ImmersiveEngine.vp()
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true })
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2))
    this.renderer.setSize(vp.w, vp.h)
    this.renderer.outputColorSpace = THREE.SRGBColorSpace
    this.camera = new THREE.PerspectiveCamera(this.monoFov, vp.w / vp.h, 0.05, 12000)
    this.settings = loadSettings()
    this.stereo.aspect = 0.5
    this.applySettings()
    this.onResize = this.onResize.bind(this)
    this.onOrient = this.onOrient.bind(this)
    this.updateOrient = this.updateOrient.bind(this)
    this.loop = this.loop.bind(this)
    addEventListener("resize", this.onResize)
    addEventListener("orientationchange", this.onResize)
    document.addEventListener("fullscreenchange", this.onResize)
    document.addEventListener("webkitfullscreenchange", this.onResize)
    window.visualViewport?.addEventListener("resize", this.onResize)
    this.raf = requestAnimationFrame(this.loop)
  }

  /** tamanho realmente visível (desconta as barras do Safari no iOS) */
  private static vp(): { w: number; h: number } {
    const vv = window.visualViewport
    return { w: Math.round(vv?.width ?? innerWidth), h: Math.round(vv?.height ?? innerHeight) }
  }

  // ---- ajustes VR Box ----
  getSettings(): VrSettings { return { ...this.settings } }
  setSettings(s: VrSettings) { this.settings = s; saveSettings(s); this.applySettings() }
  protected applySettings() {
    this.stereo.eyeSep = this.settings.eye / 1000
    if (this.vrMode) { this.camera.fov = this.settings.fov; this.camera.updateProjectionMatrix() }
  }

  // ---- giroscópio ----
  async requestGyro(): Promise<boolean> {
    const DOE = (window as unknown as { DeviceOrientationEvent?: { requestPermission?: () => Promise<string> } }).DeviceOrientationEvent
    if (DOE && typeof DOE.requestPermission === "function") {
      try { const p = await DOE.requestPermission(); if (p !== "granted") return false } catch { return false }
    }
    this.updateOrient()
    addEventListener("deviceorientation", this.onOrient, true)
    addEventListener("orientationchange", this.updateOrient)
    return true
  }
  private updateOrient() {
    const so = (screen.orientation && screen.orientation.angle) || (window as unknown as { orientation?: number }).orientation || 0
    this.orient = so
  }
  private onOrient(ev: DeviceOrientationEvent) {
    if (ev.alpha == null) return
    this.gyroActive = true
    const a = THREE.MathUtils.degToRad(ev.alpha)
    const b = THREE.MathUtils.degToRad(ev.beta ?? 0)
    const g = THREE.MathUtils.degToRad(ev.gamma ?? 0)
    const o = THREE.MathUtils.degToRad(this.orient)
    this.euler.set(b, a, -g, "YXZ")
    this.gyroQuat.setFromEuler(this.euler)
    this.gyroQuat.multiply(this.q1)
    this.gyroQuat.multiply(this.q0.setFromAxisAngle(this.zee, -o))
  }

  // ---- entrar / sair do VR ----
  async enterVR(): Promise<void> {
    await this.requestGyro()
    const el = document.documentElement as HTMLElement & {
      webkitRequestFullscreen?: () => Promise<void>; webkitRequestFullScreen?: () => Promise<void>
    }
    const rfs = el.requestFullscreen || el.webkitRequestFullscreen || el.webkitRequestFullScreen
    try { if (rfs) await rfs.call(el, { navigationUI: "hide" } as FullscreenOptions) }
    catch { try { if (rfs) rfs.call(el) } catch { /* ignora */ } }
    scrollTo(0, 1) // esconde a barra do Safari no iOS
    this.camera.fov = this.settings.fov
    this.camera.updateProjectionMatrix()
    this.vrMode = true
    document.body.style.background = "#000"
    this.onEnterVR()
    this.onVrChange?.(true)
    // reajusta o tamanho após a transição de fullscreen / esconder barras
    this.onResize()
    requestAnimationFrame(() => this.onResize())
    setTimeout(() => this.onResize(), 350)
  }
  exitVR(): void {
    this.vrMode = false
    removeEventListener("deviceorientation", this.onOrient, true)
    this.camera.fov = this.monoFov
    this.camera.aspect = innerWidth / innerHeight
    this.camera.updateProjectionMatrix()
    document.body.style.background = ""
    clearTimeout(this.exitHintTimer)
    if (document.fullscreenElement && document.exitFullscreen) document.exitFullscreen()
    this.onExitVR()
    this.onVrChange?.(false)
    this.onResize()
    setTimeout(() => this.onResize(), 200)
  }

  private onResize() {
    const { w, h } = ImmersiveEngine.vp()
    this.camera.aspect = w / h
    this.camera.updateProjectionMatrix()
    this.renderer.setSize(w, h)
  }

  dispose() {
    cancelAnimationFrame(this.raf)
    removeEventListener("resize", this.onResize)
    removeEventListener("orientationchange", this.onResize)
    document.removeEventListener("fullscreenchange", this.onResize)
    document.removeEventListener("webkitfullscreenchange", this.onResize)
    window.visualViewport?.removeEventListener("resize", this.onResize)
    removeEventListener("deviceorientation", this.onOrient, true)
    removeEventListener("orientationchange", this.updateOrient)
    document.body.style.background = ""
    this.onDispose()
    this.renderer.dispose()
  }

  private loop() {
    this.raf = requestAnimationFrame(this.loop)
    const now = performance.now()
    // dt em segundos (limitado p/ não “teletransportar” após trocar de aba)
    const dt = this.lastFrameT ? Math.min(0.05, (now - this.lastFrameT) / 1000) : 0.016
    this.lastFrameT = now
    this.onFrame(dt) // por frame, nos DOIS modos (ex.: joystick / locomoção)
    if (this.vrMode) {
      if (this.gyroActive) this.camera.quaternion.copy(this.gyroQuat)
      this.camera.updateMatrixWorld(true)
      this.stereo.update(this.camera)
      this.renderer.getSize(this.size)
      const w = this.size.x, h = this.size.y, half = w / 2
      const s = Math.max(0.3, Math.min(1, (this.settings.size ?? 100) / 100))
      const d = this.settings.sep
      const rw = Math.round(half * s), rh = Math.round(h * s)
      const ly = Math.round((h - rh) / 2)
      const lx = Math.round((half - rw) / 2 + d)          // centralizado na metade esquerda (+ desloca p/ o centro)
      const rx = Math.round(half + (half - rw) / 2 - d)   // centralizado na metade direita

      // fundo preto nas margens ao redor dos quadros
      this.renderer.setScissorTest(false)
      this.renderer.setViewport(0, 0, w, h)
      this.renderer.setClearColor(0x000000, 1)
      this.renderer.clear()

      this.renderer.setScissorTest(true)
      this.renderer.setScissor(lx, ly, rw, rh); this.renderer.setViewport(lx, ly, rw, rh)
      this.renderer.render(this.scene, this.stereo.cameraL)
      this.renderer.setScissor(rx, ly, rw, rh); this.renderer.setViewport(rx, ly, rw, rh)
      this.renderer.render(this.scene, this.stereo.cameraR)
      this.renderer.setScissorTest(false)
    } else {
      this.renderMono()
    }
  }

  // ---- hooks das subclasses ----
  protected abstract renderMono(): void
  /** roda todo frame nos dois modos (mono e VR). Usado p/ joystick + locomoção. dt em segundos. */
  protected onFrame(_dt: number) { /* opcional */ }
  protected onEnterVR() { /* opcional */ }
  protected onExitVR() { /* opcional */ }
  protected onDispose() { /* opcional */ }
}
