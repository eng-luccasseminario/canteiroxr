import * as THREE from "three"
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js"
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js"
import { IfcAPI } from "web-ifc"
import { ImmersiveEngine } from "./ImmersiveEngine"
import type { SavedView } from "@/lib/projectDb"

const WASM = "https://cdn.jsdelivr.net/npm/web-ifc@0.0.57/"

// Modo VR: carrega IFC, mescla tudo num só mesh (leve p/ o render estéreo 2x) e
// permite "entrar" no modelo em escala real dentro do VR Box. Suporta PINOS 360.
export class VrIfcEngine extends ImmersiveEngine {
  private controls: OrbitControls
  private ifcAPI = new IfcAPI()
  private ifcReady = false
  private modelGroup: THREE.Group | null = null
  private center = new THREE.Vector3()
  private maxDim = 10

  // pinos 360
  private pinGroup = new THREE.Group()
  private pinTex: THREE.CanvasTexture
  private pins = new Map<string, THREE.Sprite>()
  private placing = false
  private ray = new THREE.Raycaster()
  private ndc = new THREE.Vector2()
  private downX = 0; private downY = 0; private downT = 0

  // movimento tipo "andar" (setas): f=frente/trás, r=lados, u=sobe/desce
  private moveInput = { f: 0, r: 0, u: 0 }
  private padInput = { f: 0, r: 0, u: 0 } // vindo do joystick (Gamepad API), somado às setas
  private _mf = new THREE.Vector3(); private _mr = new THREE.Vector3(); private _md = new THREE.Vector3()
  private _mup = new THREE.Vector3(0, 1, 0)

  onPlacePin?: (pos: [number, number, number]) => void
  onPinClick?: (id: string) => void

  // seleção / ocultar / isolar elementos
  private meshes = new Map<number, THREE.Mesh>()
  private selection = new Set<number>()
  private hidden = new Set<number>()
  private baseMat = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide })
  private hlMat = new THREE.MeshLambertMaterial({ color: 0xffb020, emissive: 0xff7a00, emissiveIntensity: 0.55, side: THREE.DoubleSide })
  onSelectionChange?: (selCount: number, hiddenCount: number) => void

  // âncora do marcador A4 (Realidade Aumentada)
  private anchorGroup: THREE.Group | null = null
  private arPlacing = false
  onPlaceAnchor?: (pos: [number, number, number], normal: [number, number, number]) => void

  constructor(canvas: HTMLCanvasElement) {
    super(canvas)
    this.monoFov = 70
    this.camera.fov = 70
    this.camera.position.set(10, 10, 10)
    this.camera.updateProjectionMatrix()

    this.controls = new OrbitControls(this.camera, this.renderer.domElement)
    this.controls.enableDamping = true

    this.scene.background = new THREE.Color(0x0e1420)
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x35507a, 2.6))
    const dl = new THREE.DirectionalLight(0xffffff, 1.3)
    dl.position.set(1, 2, 1)
    this.scene.add(dl)
    const grid = new THREE.GridHelper(400, 80, 0x3a557f, 0x223350)
    ;(grid.material as THREE.Material).opacity = 0.35
    ;(grid.material as THREE.Material).transparent = true
    this.scene.add(grid)
    this.scene.add(this.pinGroup)
    this.pinTex = this.makePinTexture()

    // detecção de TOQUE (distingue de arrastar a câmera)
    const dom = this.renderer.domElement
    this.onDown = this.onDown.bind(this); this.onUp = this.onUp.bind(this)
    dom.addEventListener("pointerdown", this.onDown)
    dom.addEventListener("pointerup", this.onUp)
  }

  private makePinTexture(): THREE.CanvasTexture {
    const c = document.createElement("canvas"); c.width = 128; c.height = 160
    const x = c.getContext("2d")!
    x.beginPath()
    x.moveTo(64, 156)
    x.bezierCurveTo(16, 96, 8, 74, 8, 52)
    x.arc(64, 52, 56, Math.PI - 0.5, 0.5, false)
    x.bezierCurveTo(120, 74, 112, 96, 64, 156)
    x.closePath()
    x.fillStyle = "#f59e0b"; x.fill()
    x.lineWidth = 8; x.strokeStyle = "#fff"; x.stroke()
    x.beginPath(); x.arc(64, 52, 22, 0, 7); x.fillStyle = "#fff"; x.fill()
    x.fillStyle = "#b45309"; x.font = "bold 26px system-ui"; x.textAlign = "center"; x.textBaseline = "middle"
    x.fillText("360", 64, 54)
    return new THREE.CanvasTexture(c)
  }

  async loadIFC(bytes: Uint8Array, onProgress?: (p: number) => void): Promise<void> {
    onProgress?.(0.25)
    if (!this.ifcReady) { this.ifcAPI.SetWasmPath(WASM, true); await this.ifcAPI.Init(); this.ifcReady = true }
    onProgress?.(0.4)
    if (this.modelGroup) { this.scene.remove(this.modelGroup); this.modelGroup = null }
    this.meshes.clear(); this.selection.clear(); this.hidden.clear()

    const mid = this.ifcAPI.OpenModel(bytes, { COORDINATE_TO_ORIGIN: true })
    this.modelGroup = new THREE.Group()
    let count = 0
    // UM MESH POR ELEMENTO IFC (mantém identidade p/ selecionar/ocultar/isolar)
    this.ifcAPI.StreamAllMeshes(mid, (flat: { expressID: number; geometries: { size(): number; get(i: number): { geometryExpressID: number; color: { x: number; y: number; z: number }; flatTransformation: number[] } } }) => {
      const g = flat.geometries
      const parts: THREE.BufferGeometry[] = []
      for (let i = 0; i < g.size(); i++) {
        const pg = g.get(i)
        const geo = this.ifcAPI.GetGeometry(mid, pg.geometryExpressID)
        const v = this.ifcAPI.GetVertexArray(geo.GetVertexData(), geo.GetVertexDataSize()) as Float32Array
        const ix = this.ifcAPI.GetIndexArray(geo.GetIndexData(), geo.GetIndexDataSize()) as Uint32Array
        const n = v.length / 6
        const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), col = new Float32Array(n * 3)
        const c = pg.color
        for (let k = 0; k < n; k++) {
          pos[k * 3] = v[k * 6]; pos[k * 3 + 1] = v[k * 6 + 1]; pos[k * 3 + 2] = v[k * 6 + 2]
          nor[k * 3] = v[k * 6 + 3]; nor[k * 3 + 1] = v[k * 6 + 4]; nor[k * 3 + 2] = v[k * 6 + 5]
          col[k * 3] = c.x; col[k * 3 + 1] = c.y; col[k * 3 + 2] = c.z
        }
        const bg = new THREE.BufferGeometry()
        bg.setAttribute("position", new THREE.BufferAttribute(pos, 3))
        bg.setAttribute("normal", new THREE.BufferAttribute(nor, 3))
        bg.setAttribute("color", new THREE.BufferAttribute(col, 3))
        bg.setIndex(new THREE.BufferAttribute(ix.slice(), 1))
        bg.applyMatrix4(new THREE.Matrix4().fromArray(pg.flatTransformation))
        parts.push(bg)
        ;(geo as unknown as { delete(): void }).delete()
      }
      if (!parts.length) return
      const merged = parts.length === 1 ? parts[0] : mergeGeometries(parts, false)
      const mesh = new THREE.Mesh(merged, this.baseMat)
      mesh.userData = { expressID: flat.expressID }
      this.modelGroup!.add(mesh)
      this.meshes.set(flat.expressID, mesh)
      count++
    })
    onProgress?.(0.8)
    if (!count) throw new Error("modelo sem geometria")
    this.scene.add(this.modelGroup)

    const box = new THREE.Box3().setFromObject(this.modelGroup)
    box.getCenter(this.center)
    const s = box.getSize(new THREE.Vector3())
    this.maxDim = Math.max(s.x, s.y, s.z) || 10
    this.camera.near = this.maxDim / 500
    this.camera.far = this.maxDim * 40
    this.frameModel()
    onProgress?.(1)
  }

  private frameModel() {
    this.camera.position.set(this.center.x + this.maxDim * 1.2, this.center.y + this.maxDim * 0.9, this.center.z + this.maxDim * 1.2)
    this.camera.updateProjectionMatrix()
    this.controls.target.copy(this.center)
    this.controls.update()
  }

  protected onEnterVR() {
    // NÃO reposiciona: entra no VR exatamente do ponto de observação que o
    // usuário enquadrou (arraste/zoom antes de entrar). O giroscópio cuida da direção.
    this.controls.enabled = false
  }

  /** teleporta a câmera para o centro do modelo (botão "ir para o centro") */
  goToCenter() {
    this.camera.position.copy(this.center)
    this.controls.target.set(this.center.x, this.center.y, this.center.z - 0.001)
    this.controls.update()
  }
  protected onExitVR() {
    this.controls.enabled = true
  }
  protected onDispose() {
    this.controls.dispose()
    this.renderer.domElement.removeEventListener("pointerdown", this.onDown)
    this.renderer.domElement.removeEventListener("pointerup", this.onUp)
    if (this.modelGroup) this.scene.remove(this.modelGroup)
    this.baseMat.dispose(); this.hlMat.dispose()
  }
  protected renderMono() {
    this.controls.update()
    this.renderer.render(this.scene, this.camera)
  }
  // roda em AMBOS os modos (mono e VR): lê o joystick e aplica a locomoção
  protected onFrame() {
    this.pollGamepad()
    this.applyMove()
  }
  /** lê o primeiro controle conectado (Bluetooth/USB) via Gamepad API */
  private pollGamepad() {
    const pads = (typeof navigator !== "undefined" && navigator.getGamepads) ? navigator.getGamepads() : []
    let gp: Gamepad | null = null
    for (const p of pads) { if (p && p.connected) { gp = p; break } }
    const on = !!gp
    if (on !== this.gamepadConnected) { this.gamepadConnected = on; this.onGamepad?.(on) }
    if (!gp) { this.padInput.f = this.padInput.r = this.padInput.u = 0; return }
    const dz = (v: number) => (Math.abs(v) < 0.16 ? 0 : v) // zona morta
    const ax = gp.axes, b = gp.buttons
    const lx = dz(ax[0] ?? 0)   // stick esq. X → strafe
    const ly = dz(ax[1] ?? 0)   // stick esq. Y → frente/trás
    const rvy = dz(ax[3] ?? 0)  // stick dir. Y → subir/descer
    const trig = (b[7]?.value ?? 0) - (b[6]?.value ?? 0) // RT sobe, LT desce
    const dpad = (b[12]?.pressed ? 1 : 0) - (b[13]?.pressed ? 1 : 0) // d-pad ↑/↓ = frente/trás
    this.padInput.f = Math.max(-1, Math.min(1, -ly + dpad))
    this.padInput.r = lx
    this.padInput.u = Math.max(-1, Math.min(1, -rvy + trig))
  }

  // ===================== PINOS 360 =====================
  setPlacing(on: boolean) { this.placing = on }
  isPlacing() { return this.placing }
  hasModel() { return !!this.modelGroup }

  private onDown(e: PointerEvent) { this.downX = e.clientX; this.downY = e.clientY; this.downT = performance.now() }
  private onUp(e: PointerEvent) {
    if (this.vrMode) return
    const moved = Math.hypot(e.clientX - this.downX, e.clientY - this.downY)
    if (moved > 8 || performance.now() - this.downT > 450) return // foi arraste, não toque
    this.ndc.x = (e.clientX / innerWidth) * 2 - 1
    this.ndc.y = -(e.clientY / innerHeight) * 2 + 1
    this.ray.setFromCamera(this.ndc, this.camera)
    if (this.placing) {
      if (!this.modelGroup) return
      const hit = this.ray.intersectObject(this.modelGroup, true)[0]
      if (hit) this.onPlacePin?.([hit.point.x, hit.point.y, hit.point.z])
      return
    }
    if (this.arPlacing) {
      if (!this.modelGroup) return
      const hit = this.ray.intersectObjects(this.modelGroup.children, false).find((h) => h.object.visible !== false)
      if (hit && hit.face) {
        const nrm = hit.face.normal.clone().transformDirection(hit.object.matrixWorld).normalize()
        this.onPlaceAnchor?.([hit.point.x, hit.point.y, hit.point.z], [nrm.x, nrm.y, nrm.z])
      }
      return
    }
    const pinHit = this.ray.intersectObjects(this.pinGroup.children)[0]
    if (pinHit) { this.onPinClick?.(pinHit.object.userData.id as string); return }
    // seleção de elemento do modelo
    if (this.modelGroup) {
      const hits = this.ray.intersectObjects(this.modelGroup.children, false)
      const m = hits.find((h) => h.object.visible !== false)
      if (m) { const id = (m.object as THREE.Mesh).userData.expressID as number; if (id != null) this.selectElement(id); return }
    }
    this.clearSelection()
  }

  // ===================== SELEÇÃO / OCULTAR / ISOLAR =====================
  private highlight(id: number, on: boolean) {
    const m = this.meshes.get(id); if (m) m.material = on ? this.hlMat : this.baseMat
  }
  private emitSel() { this.onSelectionChange?.(this.selection.size, this.hidden.size) }
  selectElement(id: number) {
    if (this.selection.has(id)) { this.selection.delete(id); this.highlight(id, false) }
    else { this.selection.add(id); this.highlight(id, true) }
    this.emitSel()
  }
  clearSelection() {
    if (!this.selection.size) return
    for (const id of this.selection) this.highlight(id, false)
    this.selection.clear(); this.emitSel()
  }
  hideSelected() {
    for (const id of this.selection) { const m = this.meshes.get(id); if (m) { m.visible = false; this.hidden.add(id) }; this.highlight(id, false) }
    this.selection.clear(); this.emitSel()
  }
  isolateSelected() {
    if (!this.selection.size) return
    for (const [id, m] of this.meshes) {
      const keep = this.selection.has(id)
      m.visible = keep
      if (keep) this.hidden.delete(id); else this.hidden.add(id)
      this.highlight(id, false)
    }
    this.selection.clear(); this.emitSel()
  }
  showAll() {
    for (const m of this.meshes.values()) m.visible = true
    this.hidden.clear()
    for (const id of this.selection) this.highlight(id, false)
    this.selection.clear(); this.emitSel()
  }

  // ===================== ÂNCORA DO MARCADOR A4 (RA) =====================
  setArPlacing(on: boolean) { this.arPlacing = on }
  getFloorY(): number { return 0 } // o grid (y = 0) é tratado como o chão / altura 0
  clearAnchor() { if (this.anchorGroup) { this.scene.remove(this.anchorGroup); this.anchorGroup = null } }

  private makeLabel(text: string): THREE.Sprite {
    const c = document.createElement("canvas"); c.width = 256; c.height = 96
    const x = c.getContext("2d")!
    x.fillStyle = "rgba(15,20,32,.88)"
    x.beginPath(); x.roundRect(6, 18, 244, 60, 14); x.fill()
    x.fillStyle = "#ffd166"; x.font = "bold 44px system-ui"; x.textAlign = "center"; x.textBaseline = "middle"
    x.fillText(text, 128, 50)
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), depthTest: false, transparent: true }))
    sp.scale.set(0.44, 0.165, 1); sp.renderOrder = 30
    return sp
  }

  /** Folha A4 VERTICAL em escala real (0,21 × 0,297 m) fixada num plano (parede),
   *  com a medida do chão do modelo até a altura onde ela está. */
  showAnchor(pos: [number, number, number], headingDeg: number) {
    this.clearAnchor()
    const A4W = 0.21, A4H = 0.297
    const g = new THREE.Group()

    // folha (vertical) — orientada para fora da parede
    const sheetG = new THREE.Group()
    const sheet = new THREE.Mesh(
      new THREE.PlaneGeometry(A4W, A4H),
      new THREE.MeshBasicMaterial({ color: 0x22d3ee, transparent: true, opacity: 0.5, side: THREE.DoubleSide })
    )
    const edges = new THREE.LineSegments(new THREE.EdgesGeometry(sheet.geometry), new THREE.LineBasicMaterial({ color: 0x0891b2 }))
    sheet.add(edges)
    sheetG.add(sheet)
    sheetG.position.set(pos[0], pos[1], pos[2])
    sheetG.rotation.y = THREE.MathUtils.degToRad(headingDeg)
    sheetG.translateZ(0.012) // encosta na parede sem z-fighting
    g.add(sheetG)

    // cota do chão até a altura da folha (chão = grid, y = 0)
    const floorY = 0
    const line = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(pos[0], floorY, pos[2]), new THREE.Vector3(pos[0], pos[1], pos[2])]),
      new THREE.LineDashedMaterial({ color: 0xffd166, dashSize: 0.08, gapSize: 0.05, depthTest: false })
    )
    line.computeLineDistances(); line.renderOrder = 29
    g.add(line)

    const height = pos[1] - floorY
    const label = this.makeLabel(height.toFixed(2).replace(".", ",") + " m")
    label.position.set(pos[0] + 0.14, floorY + height / 2, pos[2] + 0.14)
    g.add(label)

    g.renderOrder = 25
    this.anchorGroup = g
    this.scene.add(g)
  }

  addPinSprite(id: string, pos: [number, number, number]) {
    if (this.pins.has(id)) this.removePinSprite(id)
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.pinTex, depthTest: false, transparent: true }))
    const s = this.maxDim * 0.06
    sp.scale.set(s * 0.8, s, 1)
    sp.center.set(0.5, 0) // âncora na ponta do pino
    sp.position.set(pos[0], pos[1], pos[2])
    sp.renderOrder = 20
    sp.userData = { id }
    this.pinGroup.add(sp)
    this.pins.set(id, sp)
  }
  removePinSprite(id: string) {
    const sp = this.pins.get(id); if (!sp) return
    this.pinGroup.remove(sp); sp.material.dispose(); this.pins.delete(id)
  }
  clearPins() { for (const id of [...this.pins.keys()]) this.removePinSprite(id) }

  // ===================== VISTA / MINIATURA =====================
  // ===================== MOVIMENTO (setas) =====================
  setForward(v: number) { this.moveInput.f = v }
  setRight(v: number) { this.moveInput.r = v }
  setUp(v: number) { this.moveInput.u = v }
  stopMove() { this.moveInput.f = this.moveInput.r = this.moveInput.u = 0 }
  private applyMove() {
    // combina setas (moveInput) + joystick (padInput)
    const f = Math.max(-1, Math.min(1, this.moveInput.f + this.padInput.f))
    const r = Math.max(-1, Math.min(1, this.moveInput.r + this.padInput.r))
    const u = Math.max(-1, Math.min(1, this.moveInput.u + this.padInput.u))
    if (!f && !r && !u) return
    const speed = this.maxDim * 0.004
    // direção = para onde a CÂMERA aponta (no VR isso é o giroscópio; no mono, o orbit)
    this._mf.set(0, 0, -1).applyQuaternion(this.camera.quaternion)
    this._mr.set(1, 0, 0).applyQuaternion(this.camera.quaternion)
    this._md.set(0, 0, 0)
    this._md.addScaledVector(this._mf, f * speed)
    this._md.addScaledVector(this._mr, r * speed)
    this._md.addScaledVector(this._mup, u * speed)
    this.camera.position.add(this._md)
    this.controls.target.add(this._md) // mantém o alvo do orbit em sincronia (modo mono)
  }

  getCenter(): [number, number, number] { return [this.center.x, this.center.y, this.center.z] }
  getMaxDim(): number { return this.maxDim }
  getView(): SavedView {
    const p = this.camera.position, t = this.controls.target
    return { px: p.x, py: p.y, pz: p.z, tx: t.x, ty: t.y, tz: t.z }
  }
  applyView(v: SavedView) {
    this.camera.position.set(v.px, v.py, v.pz)
    this.controls.target.set(v.tx, v.ty, v.tz)
    this.controls.update()
  }
  captureThumbnail(): string {
    this.renderer.render(this.scene, this.camera)
    const c = document.createElement("canvas"); c.width = 320; c.height = 200
    const ctx = c.getContext("2d")!
    ctx.drawImage(this.renderer.domElement, 0, 0, c.width, c.height)
    return c.toDataURL("image/jpeg", 0.6)
  }
}
