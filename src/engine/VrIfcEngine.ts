import * as THREE from "three"
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js"
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js"
import { IfcAPI, IFCPROJECT, IFCSITE, IFCBUILDING, IFCBUILDINGSTOREY, IFCRELAGGREGATES, IFCRELCONTAINEDINSPATIALSTRUCTURE } from "web-ifc"
import { ImmersiveEngine } from "./ImmersiveEngine"
import type { SavedView } from "@/lib/projectDb"

const WASM = "https://cdn.jsdelivr.net/npm/web-ifc@0.0.57/"

// rótulos PT-BR p/ os tipos IFC mais comuns (fallback = nome IFC sem o prefixo)
const TYPE_LABELS: Record<string, string> = {
  IFCWALL: "Paredes", IFCWALLSTANDARDCASE: "Paredes", IFCCURTAINWALL: "Fachadas",
  IFCSLAB: "Lajes", IFCROOF: "Coberturas", IFCBEAM: "Vigas", IFCCOLUMN: "Pilares",
  IFCDOOR: "Portas", IFCWINDOW: "Janelas", IFCSTAIR: "Escadas", IFCSTAIRFLIGHT: "Lances de escada",
  IFCRAILING: "Guarda-corpos", IFCSPACE: "Ambientes", IFCFURNISHINGELEMENT: "Mobiliário",
  IFCPLATE: "Placas", IFCMEMBER: "Perfis", IFCBUILDINGELEMENTPROXY: "Elementos genéricos",
  IFCPIPESEGMENT: "Tubulação", IFCPIPEFITTING: "Conexões hidráulicas",
  IFCDUCTSEGMENT: "Dutos", IFCDUCTFITTING: "Conexões de duto",
  IFCFLOWTERMINAL: "Terminais (MEP)", IFCFLOWSEGMENT: "Segmentos (MEP)",
  IFCCABLECARRIERSEGMENT: "Eletrocalhas", IFCLIGHTFIXTURE: "Luminárias",
  IFCSANITARYTERMINAL: "Louças/metais", IFCFOOTING: "Fundações", IFCPILE: "Estacas",
  IFCCOVERING: "Revestimentos", IFCRAMP: "Rampas", IFCREINFORCINGBAR: "Armaduras",
}
export function labelForType(t: string): string {
  return TYPE_LABELS[t] ?? t.replace(/^IFC/, "").toLowerCase().replace(/^\w/, (c) => c.toUpperCase())
}

// nó da árvore espacial (norma: Obra > Terreno > Edificação > Pavimento > Categoria)
export interface TreeNode {
  key: string; label: string; sub?: string
  kind: "site" | "building" | "storey" | "group" | "category"
  count: number; gids: string[]
  visible: boolean; opacity: number
  children: TreeNode[]
}
export interface TreeModel { index: number; name: string; count: number; visible: boolean; opacity: number; nodes: TreeNode[] }
export interface ElementInfo {
  gid: string; modelName: string; type: string; typeLabel: string
  name: string; globalId: string
  asset: [string, string][]   // ficha do ativo (PT-BR) — atributos principais, ordenados
  attrs: [string, string][]
  psets: { name: string; props: [string, string][] }[]   // psets técnicos (sem a ficha)
}
const ASSET_PSET = "Dados do Ativo"
const ASSET_ORDER = ["Categoria", "Código do ativo", "Fabricante", "Valor (R$)", "Validade / Garantia", "Vida útil estimada", "Operação", "Plano de manutenção", "Status"]
const normKey = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim()

// Modo VR: carrega 1+ IFC (modelo federado), 1 mesh por elemento (mantém identidade
// p/ selecionar/ocultar/isolar/pintar/consultar), e permite "entrar" no modelo em VR Box.
export class VrIfcEngine extends ImmersiveEngine {
  private controls: OrbitControls
  private ifcAPI = new IfcAPI()
  private ifcReady = false
  private modelGroup: THREE.Group | null = null // container único de TODOS os modelos
  private center = new THREE.Vector3()
  private maxDim = 10

  // ---- modelos federados ----
  private modelIDs: number[] = []      // handles do web-ifc por índice de modelo
  // matriz de coordenação do 1º modelo — reaplicada nos demais p/ manter o
  // deslocamento georreferenciado relativo entre disciplinas (compatibilização)
  private baseCoordMatrix: number[] | null = null
  private modelNames: string[] = []
  private modelVisible: boolean[] = []
  private modelOpacity: number[] = []
  private typeOf = new Map<string, string>()          // gid -> tipo IFC
  private spatialTrees: TreeNode[][] = []             // árvore espacial estática por modelo
  private nodeGids = new Map<string, string[]>()      // chave do nó -> gids descendentes
  private nodeVisible = new Map<string, boolean>()
  private nodeOpacity = new Map<string, number>()
  private ancestorsOf = new Map<string, string[]>()   // gid -> cadeia de nós (visibilidade herdada)
  private centroid = new Map<string, THREE.Vector3>()

  // pinos 360
  private pinGroup = new THREE.Group()
  private pinTex: THREE.CanvasTexture
  private pins = new Map<string, THREE.Sprite>()
  private placing = false
  private ray = new THREE.Raycaster()
  private ndc = new THREE.Vector2()
  private downX = 0; private downY = 0; private downT = 0

  // movimento tipo "andar": f=frente/trás, r=lados, u=sobe/desce, rot=girar vista
  private moveInput = { f: 0, r: 0, u: 0 }
  private padInput = { f: 0, r: 0, u: 0 }
  private keyMove = { f: 0, r: 0, u: 0 } // teclado WASD + setas ↑↓
  private keyRot = 0                      // teclado setas ←→
  private btnRot = 0                      // botão de rotação (mobile)
  private keysDown = new Set<string>()
  private _mf = new THREE.Vector3(); private _mr = new THREE.Vector3(); private _md = new THREE.Vector3()
  private _mup = new THREE.Vector3(0, 1, 0)
  private _off = new THREE.Vector3(); private _yax = new THREE.Vector3(0, 1, 0)

  onPlacePin?: (pos: [number, number, number]) => void
  onPinClick?: (id: string) => void

  // seleção / ocultar / isolar
  private meshes = new Map<string, THREE.Mesh>()
  private selection = new Set<string>()
  private hidden = new Set<string>()
  private baseMat = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide })
  private hlMat = new THREE.MeshLambertMaterial({ color: 0xffb020, emissive: 0xff7a00, emissiveIntensity: 0.55, side: THREE.DoubleSide })
  private xrayCache = new Map<number, THREE.MeshLambertMaterial>()
  private paintCache = new Map<string, THREE.MeshLambertMaterial>()
  onSelectionChange?: (selCount: number, hiddenCount: number) => void
  onSelect?: (gid: string | null) => void
  onMarkerClick?: (gid: string, x: number, y: number) => void   // toque no "!" (popup da observação)

  // anotações (nota + cor) e marcadores "!"
  private paint = new Map<string, string>()   // gid -> hex
  private markerGroup = new THREE.Group()
  private markers = new Map<string, THREE.Sprite>()
  private markerTex: THREE.CanvasTexture

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
    this.scene.add(this.pinGroup)
    this.scene.add(this.markerGroup)
    this.pinTex = this.makePinTexture()
    this.markerTex = this.makeMarkerTexture()

    const dom = this.renderer.domElement
    this.onDown = this.onDown.bind(this); this.onUp = this.onUp.bind(this)
    dom.addEventListener("pointerdown", this.onDown)
    dom.addEventListener("pointerup", this.onUp)
    // teclado (desktop): WASD anda, ↑↓ sobe/desce, ←→ gira a vista
    this.onKeyDown = this.onKeyDown.bind(this); this.onKeyUp = this.onKeyUp.bind(this)
    addEventListener("keydown", this.onKeyDown)
    addEventListener("keyup", this.onKeyUp)
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

  // marcador "!" (elemento com observação)
  private makeMarkerTexture(): THREE.CanvasTexture {
    const c = document.createElement("canvas"); c.width = 96; c.height = 96
    const x = c.getContext("2d")!
    x.beginPath(); x.arc(48, 48, 42, 0, 7)
    x.fillStyle = "#f43f5e"; x.fill()
    x.lineWidth = 6; x.strokeStyle = "#fff"; x.stroke()
    x.fillStyle = "#fff"; x.font = "bold 62px system-ui"; x.textAlign = "center"; x.textBaseline = "middle"
    x.fillText("!", 48, 52)
    return new THREE.CanvasTexture(c)
  }

  // ===================== CARGA DE MODELOS (FEDERAÇÃO) =====================
  private async ensureIfc() {
    if (!this.ifcReady) { this.ifcAPI.SetWasmPath(WASM, true); await this.ifcAPI.Init(); this.ifcReady = true }
  }

  /** remove TODOS os modelos carregados (novo projeto) */
  clearModels() {
    if (this.modelGroup) { this.scene.remove(this.modelGroup); this.modelGroup = null }
    for (const mid of this.modelIDs) { try { this.ifcAPI.CloseModel(mid) } catch { /* ignora */ } }
    this.meshes.clear(); this.selection.clear(); this.hidden.clear()
    this.modelIDs = []; this.modelNames = []; this.modelVisible = []; this.modelOpacity = []
    this.baseCoordMatrix = null
    this.typeOf.clear(); this.spatialTrees = []
    this.nodeGids.clear(); this.nodeVisible.clear(); this.nodeOpacity.clear(); this.ancestorsOf.clear()
    this.centroid.clear(); this.paint.clear()
    for (const s of this.markers.values()) { this.markerGroup.remove(s); s.material.dispose() }
    this.markers.clear()
    this.emitSel()
  }

  /** adiciona um IFC ao modelo federado. Retorna o índice do modelo. */
  async addModel(bytes: Uint8Array, name: string, onProgress?: (p: number) => void): Promise<number> {
    onProgress?.(0.15)
    await this.ensureIfc()
    onProgress?.(0.35)
    if (!this.modelGroup) { this.modelGroup = new THREE.Group(); this.scene.add(this.modelGroup) }

    const mi = this.modelIDs.length
    // 1º modelo: leva à origem; seguintes: mantêm as coordenadas originais e recebem
    // a MESMA matriz de coordenação do 1º — preserva o alinhamento georreferenciado
    // entre disciplinas sem perder precisão longe da origem
    const mid = this.ifcAPI.OpenModel(bytes, { COORDINATE_TO_ORIGIN: mi === 0 })
    if (mi > 0 && this.baseCoordMatrix) this.ifcAPI.SetGeometryTransformation(mid, this.baseCoordMatrix)
    this.modelIDs.push(mid); this.modelNames.push(name)
    this.modelVisible.push(true); this.modelOpacity.push(1)

    let count = 0
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
      const gid = `${mi}:${flat.expressID}`
      mesh.userData = { gid, modelIndex: mi, expressID: flat.expressID }
      this.modelGroup!.add(mesh)
      this.meshes.set(gid, mesh)
      // tipo IFC (categoria) p/ a árvore
      let type = "IFCUNKNOWN"
      try { type = this.ifcAPI.GetNameFromTypeCode(this.ifcAPI.GetLineType(mid, flat.expressID)) || type } catch { /* ignora */ }
      this.typeOf.set(gid, type)
      // centróide (posição do marcador "!")
      merged.computeBoundingBox()
      this.centroid.set(gid, merged.boundingBox!.getCenter(new THREE.Vector3()))
      count++
    })
    onProgress?.(0.85)
    if (!count && mi === 0) throw new Error("modelo sem geometria")
    // a matriz de coordenação só existe DEPOIS da geração da geometria (StreamAllMeshes)
    if (mi === 0) {
      const m = Array.from(this.ifcAPI.GetCoordinationMatrix(mid) ?? [])
      this.baseCoordMatrix = m.length === 16 ? (m as number[]) : null
    }

    // árvore espacial da norma (Terreno > Edificação > Pavimento) + índice de ancestrais
    try { this.spatialTrees[mi] = this.buildSpatialTree(mid, mi) }
    catch { this.spatialTrees[mi] = this.categoryOnlyTree(mi) }
    for (const n of this.spatialTrees[mi]) this.registerNode(n, [])

    this.recomputeBounds()
    if (mi === 0) this.frameModel() // só reenquadra no 1º modelo; ao compatibilizar, mantém a vista
    onProgress?.(1)
    return mi
  }

  /** recalcula caixa/near/far sobre TODOS os modelos (sem mexer na câmera) */
  private recomputeBounds() {
    if (!this.modelGroup) return
    const box = new THREE.Box3().setFromObject(this.modelGroup)
    box.getCenter(this.center)
    const s = box.getSize(new THREE.Vector3())
    this.maxDim = Math.max(s.x, s.y, s.z) || 10
    this.camera.near = this.maxDim / 500
    this.camera.far = this.maxDim * 40
    this.camera.updateProjectionMatrix()
  }

  modelCount() { return this.modelIDs.length }
  hasModel() { return !!this.modelGroup && this.meshes.size > 0 }

  private frameModel() {
    this.camera.position.set(this.center.x + this.maxDim * 1.2, this.center.y + this.maxDim * 0.9, this.center.z + this.maxDim * 1.2)
    this.camera.updateProjectionMatrix()
    this.controls.target.copy(this.center)
    this.controls.update()
  }

  protected onEnterVR() { this.controls.enabled = false }

  /** teleporta a câmera para o centro do modelo (botão "ir para o centro") */
  goToCenter() {
    this.camera.position.copy(this.center)
    this.controls.target.set(this.center.x, this.center.y, this.center.z - 0.001)
    this.controls.update()
  }

  /** aproxima a câmera de um elemento (lista de observações) mantendo a direção da vista */
  focusElement(gid: string) {
    const c = this.centroid.get(gid); if (!c) return
    const dir = this.camera.position.clone().sub(this.controls.target)
    if (dir.lengthSq() < 1e-6) dir.set(1, 0.7, 1)
    dir.normalize()
    this.controls.target.copy(c)
    this.camera.position.copy(c).addScaledVector(dir, Math.max(this.maxDim * 0.12, 2))
    this.controls.update()
  }
  protected onExitVR() { this.controls.enabled = true }
  protected onDispose() {
    this.controls.dispose()
    this.renderer.domElement.removeEventListener("pointerdown", this.onDown)
    this.renderer.domElement.removeEventListener("pointerup", this.onUp)
    removeEventListener("keydown", this.onKeyDown)
    removeEventListener("keyup", this.onKeyUp)
    for (const mid of this.modelIDs) { try { this.ifcAPI.CloseModel(mid) } catch { /* ignora */ } }
    if (this.modelGroup) this.scene.remove(this.modelGroup)
    this.baseMat.dispose(); this.hlMat.dispose()
    for (const m of this.xrayCache.values()) m.dispose()
    for (const m of this.paintCache.values()) m.dispose()
  }
  protected renderMono() {
    this.controls.update()
    this.renderer.render(this.scene, this.camera)
  }
  protected onFrame() {
    this.pollGamepad()
    this.applyMove()
    this.applyRotate()
  }
  private pollGamepad() {
    const pads = (typeof navigator !== "undefined" && navigator.getGamepads) ? navigator.getGamepads() : []
    let gp: Gamepad | null = null
    for (const p of pads) { if (p && p.connected) { gp = p; break } }
    const on = !!gp
    if (on !== this.gamepadConnected) { this.gamepadConnected = on; this.onGamepad?.(on) }
    if (!gp) { this.padInput.f = this.padInput.r = this.padInput.u = 0; return }
    const dz = (v: number) => (Math.abs(v) < 0.16 ? 0 : v)
    const ax = gp.axes, b = gp.buttons
    const lx = dz(ax[0] ?? 0)
    const ly = dz(ax[1] ?? 0)
    const rvy = dz(ax[3] ?? 0)
    const trig = (b[7]?.value ?? 0) - (b[6]?.value ?? 0)
    const dpad = (b[12]?.pressed ? 1 : 0) - (b[13]?.pressed ? 1 : 0)
    this.padInput.f = Math.max(-1, Math.min(1, -ly + dpad))
    this.padInput.r = lx
    this.padInput.u = Math.max(-1, Math.min(1, -rvy + trig))
  }

  // ===================== TECLADO (desktop) =====================
  private onKeyDown(e: KeyboardEvent) {
    const el = document.activeElement as HTMLElement | null
    if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable)) return
    if (this.vrMode) return
    const codes = ["KeyW", "KeyA", "KeyS", "KeyD", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"]
    if (!codes.includes(e.code)) return
    e.preventDefault()
    this.keysDown.add(e.code)
    this.recomputeKeys()
  }
  private onKeyUp(e: KeyboardEvent) {
    if (!this.keysDown.has(e.code)) return
    this.keysDown.delete(e.code)
    this.recomputeKeys()
  }
  private recomputeKeys() {
    const d = this.keysDown
    this.keyMove.f = (d.has("KeyW") ? 1 : 0) - (d.has("KeyS") ? 1 : 0)
    this.keyMove.r = (d.has("KeyD") ? 1 : 0) - (d.has("KeyA") ? 1 : 0)
    this.keyMove.u = (d.has("ArrowUp") ? 1 : 0) - (d.has("ArrowDown") ? 1 : 0)
    this.keyRot = (d.has("ArrowLeft") ? 1 : 0) - (d.has("ArrowRight") ? 1 : 0)
  }

  // ===================== PINOS 360 =====================
  setPlacing(on: boolean) { this.placing = on }
  isPlacing() { return this.placing }

  private onDown(e: PointerEvent) { this.downX = e.clientX; this.downY = e.clientY; this.downT = performance.now() }
  private onUp(e: PointerEvent) {
    if (this.vrMode) return
    const moved = Math.hypot(e.clientX - this.downX, e.clientY - this.downY)
    if (moved > 8 || performance.now() - this.downT > 450) return
    this.ndc.x = (e.clientX / innerWidth) * 2 - 1
    this.ndc.y = -(e.clientY / innerHeight) * 2 + 1
    this.ray.setFromCamera(this.ndc, this.camera)
    if (this.placing) {
      if (!this.modelGroup) return
      const hit = this.ray.intersectObject(this.modelGroup, true)[0]
      if (hit) this.onPlacePin?.([hit.point.x, hit.point.y, hit.point.z])
      return
    }
    const pinHit = this.ray.intersectObjects(this.pinGroup.children)[0]
    if (pinHit) { this.onPinClick?.(pinHit.object.userData.id as string); return }
    // marcador "!" (observação): abre popup com a nota ao lado do toque
    const mkHit = this.ray.intersectObjects(this.markerGroup.children)[0]
    if (mkHit) { const gid = (mkHit.object.userData as { gid?: string }).gid; if (gid) this.onMarkerClick?.(gid, e.clientX, e.clientY); return }
    if (this.modelGroup) {
      const hits = this.ray.intersectObjects(this.modelGroup.children, false)
      const m = hits.find((h) => h.object.visible !== false)
      if (m) { const gid = (m.object as THREE.Mesh).userData.gid as string; if (gid != null) this.selectElement(gid); return }
    }
    this.clearSelection()
  }

  // ===================== MATERIAL / RAIO-X / PINTURA =====================
  private xrayMat(op: number): THREE.MeshLambertMaterial {
    const key = Math.round(op * 20) / 20
    let m = this.xrayCache.get(key)
    if (!m) {
      m = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide, transparent: true, opacity: key, depthWrite: false })
      this.xrayCache.set(key, m)
    }
    return m
  }
  private paintMat(hex: string, op: number): THREE.MeshLambertMaterial {
    const b = Math.round(op * 20) / 20
    const key = `${hex}@${b}`
    let m = this.paintCache.get(key)
    if (!m) {
      m = new THREE.MeshLambertMaterial({ color: new THREE.Color(hex), side: THREE.DoubleSide, transparent: b < 0.999, opacity: b, depthWrite: b >= 0.999 })
      this.paintCache.set(key, m)
    }
    return m
  }
  private effectiveOpacity(gid: string): number {
    const mi = Number(gid.split(":")[0])
    let op = this.modelOpacity[mi] ?? 1
    for (const k of this.ancestorsOf.get(gid) ?? []) op = Math.min(op, this.nodeOpacity.get(k) ?? 1)
    return op
  }
  private isGroupVisible(gid: string): boolean {
    const mi = Number(gid.split(":")[0])
    if (this.modelVisible[mi] === false) return false
    for (const k of this.ancestorsOf.get(gid) ?? []) if (this.nodeVisible.get(k) === false) return false
    return true
  }
  /** aplica o estado visual correto a um elemento (visibilidade + material) */
  private refreshMesh(gid: string) {
    const m = this.meshes.get(gid); if (!m) return
    if (this.hidden.has(gid) || !this.isGroupVisible(gid)) { m.visible = false; return }
    m.visible = true
    if (this.selection.has(gid)) { m.material = this.hlMat; return }
    const color = this.paint.get(gid)
    const op = this.effectiveOpacity(gid)
    if (color) m.material = this.paintMat(color, op)
    else if (op < 0.995) m.material = this.xrayMat(op)
    else m.material = this.baseMat
  }
  private refreshAll() { for (const gid of this.meshes.keys()) this.refreshMesh(gid) }

  // ===================== SELEÇÃO / OCULTAR / ISOLAR =====================
  private emitSel() {
    this.onSelectionChange?.(this.selection.size, this.hidden.size)
    this.onSelect?.(this.selection.size === 1 ? [...this.selection][0] : null)
  }
  selectElement(gid: string) {
    if (this.selection.has(gid)) this.selection.delete(gid)
    else this.selection.add(gid)
    this.refreshMesh(gid)
    this.emitSel()
  }
  clearSelection() {
    if (!this.selection.size) return
    const ids = [...this.selection]; this.selection.clear()
    for (const gid of ids) this.refreshMesh(gid)
    this.emitSel()
  }
  hideSelected() {
    for (const gid of this.selection) { this.hidden.add(gid) }
    const ids = [...this.selection]; this.selection.clear()
    for (const gid of ids) this.refreshMesh(gid)
    this.emitSel()
  }
  isolateSelected() {
    if (!this.selection.size) return
    for (const gid of this.meshes.keys()) {
      if (this.selection.has(gid)) this.hidden.delete(gid); else this.hidden.add(gid)
    }
    this.selection.clear()
    this.refreshAll()
    this.emitSel()
  }
  showAll() {
    this.hidden.clear()
    this.selection.clear()
    this.refreshAll()
    this.emitSel()
  }

  // ===================== ÁRVORE ESPACIAL (norma: Obra > Terreno > Edificação > Pavimento) =====================
  private line(mid: number, eid: number): Record<string, unknown> | null {
    try { return this.ifcAPI.GetLine(mid, eid) as Record<string, unknown> } catch { return null }
  }

  /** agrupa gids por categoria (tipo IFC) como nós-folha */
  private catNodes(parentKey: string, gids: string[]): TreeNode[] {
    const byType = new Map<string, string[]>()
    for (const g of gids) { const t = this.typeOf.get(g) ?? "IFCUNKNOWN"; const a = byType.get(t); if (a) a.push(g); else byType.set(t, [g]) }
    const nodes: TreeNode[] = [...byType.entries()].map(([t, gs]) => ({
      key: `${parentKey}/${t}`, label: labelForType(t), sub: `${gs.length}× · ${t.replace(/^IFC/, "")}`,
      kind: "category", count: gs.length, gids: gs, visible: true, opacity: 1, children: [],
    }))
    return nodes.sort((a, b) => b.count - a.count)
  }

  /** fallback p/ IFC sem estrutura espacial: só categorias */
  private categoryOnlyTree(mi: number): TreeNode[] {
    const gids = [...this.meshes.keys()].filter((g) => g.startsWith(`${mi}:`))
    if (!gids.length) return []
    const key = `${mi}:s:all`
    return [{ key, label: "Elementos", kind: "group", count: gids.length, gids, visible: true, opacity: 1, children: this.catNodes(key, gids) }]
  }

  private buildSpatialTree(mid: number, mi: number): TreeNode[] {
    const vec = (v: { size(): number; get(i: number): number }): number[] => { const a: number[] = []; for (let i = 0; i < v.size(); i++) a.push(v.get(i)); return a }
    const refIds = (x: unknown): number[] => (Array.isArray(x) ? x.map((r) => (r as { value: number }).value).filter((n) => n != null) : [])
    const childrenOf = new Map<number, number[]>()   // decomposição espacial (IfcRelAggregates)
    const contained = new Map<number, number[]>()    // elementos por pavimento (IfcRelContainedInSpatialStructure)
    for (const relId of vec(this.ifcAPI.GetLineIDsWithType(mid, IFCRELAGGREGATES))) {
      const rel = this.line(mid, relId); if (!rel) continue
      const parent = (rel.RelatingObject as { value?: number } | null)?.value; if (parent == null) continue
      const kids = refIds(rel.RelatedObjects)
      const arr = childrenOf.get(parent); if (arr) arr.push(...kids); else childrenOf.set(parent, kids)
    }
    for (const relId of vec(this.ifcAPI.GetLineIDsWithType(mid, IFCRELCONTAINEDINSPATIALSTRUCTURE))) {
      const rel = this.line(mid, relId); if (!rel) continue
      const parent = (rel.RelatingStructure as { value?: number } | null)?.value; if (parent == null) continue
      const kids = refIds(rel.RelatedElements)
      const arr = contained.get(parent); if (arr) arr.push(...kids); else contained.set(parent, kids)
    }

    const typeCode = (eid: number): number => { try { return this.ifcAPI.GetLineType(mid, eid) } catch { return 0 } }
    const isSpatial = (t: number) => t === IFCSITE || t === IFCBUILDING || t === IFCBUILDINGSTOREY
    const kindOf = (t: number): "site" | "building" | "storey" => (t === IFCSITE ? "site" : t === IFCBUILDING ? "building" : "storey")
    const FALLBACK = { site: "Terreno", building: "Edificação", storey: "Pavimento" }

    // produtos com malha no subtree de decomposição (inclui conjuntos e IfcSpace)
    const collectProducts = (eid: number, out: string[]) => {
      const gid = `${mi}:${eid}`
      if (this.meshes.has(gid)) out.push(gid)
      for (const c of childrenOf.get(eid) ?? []) if (!isSpatial(typeCode(c))) collectProducts(c, out)
    }

    const makeSpatial = (eid: number, kind: "site" | "building" | "storey"): TreeNode | null => {
      const key = `${mi}:s:${eid}`
      const own: string[] = []
      for (const c of contained.get(eid) ?? []) collectProducts(c, own)
      for (const c of childrenOf.get(eid) ?? []) if (!isSpatial(typeCode(c))) collectProducts(c, own)
      const sub: { n: TreeNode; elev: number }[] = []
      for (const c of childrenOf.get(eid) ?? []) {
        const t = typeCode(c); if (!isSpatial(t)) continue
        const n = makeSpatial(c, kindOf(t)); if (!n) continue
        const elev = t === IFCBUILDINGSTOREY ? Number(this.unwrap(this.line(mid, c)?.Elevation)) || 0 : 0
        sub.push({ n, elev })
      }
      sub.sort((a, b) => a.elev - b.elev)
      const gids = [...own, ...sub.flatMap((s) => s.n.gids)]
      if (!gids.length) return null
      const l = this.line(mid, eid)
      const label = this.unwrap(l?.Name) || this.unwrap((l as { LongName?: unknown } | null)?.LongName) || FALLBACK[kind]
      const children = [...this.catNodes(key, own), ...sub.map((s) => s.n)]
      return { key, label, kind, count: gids.length, gids, visible: true, opacity: 1, children }
    }

    const roots: TreeNode[] = []
    for (const pid of vec(this.ifcAPI.GetLineIDsWithType(mid, IFCPROJECT)))
      for (const c of childrenOf.get(pid) ?? []) {
        const t = typeCode(c); if (!isSpatial(t)) continue
        const n = makeSpatial(c, kindOf(t)); if (n) roots.push(n)
      }
    // elementos fora da estrutura espacial
    const assigned = new Set(roots.flatMap((r) => r.gids))
    const rest = [...this.meshes.keys()].filter((g) => g.startsWith(`${mi}:`) && !assigned.has(g))
    if (rest.length) {
      const key = `${mi}:s:rest`
      roots.push({ key, label: roots.length ? "Sem localização" : "Elementos", kind: "group", count: rest.length, gids: rest, visible: true, opacity: 1, children: this.catNodes(key, rest) })
    }
    return roots
  }

  /** indexa nó→gids e gid→cadeia de ancestrais (visibilidade/raio-x herdados) */
  private registerNode(n: TreeNode, chain: string[]) {
    this.nodeGids.set(n.key, n.gids)
    const c2 = [...chain, n.key]
    if (n.children.length) n.children.forEach((k) => this.registerNode(k, c2))
    else for (const g of n.gids) this.ancestorsOf.set(g, c2)
  }

  getTree(): TreeModel[] {
    const deco = (n: TreeNode): TreeNode => ({
      ...n, visible: this.nodeVisible.get(n.key) !== false, opacity: this.nodeOpacity.get(n.key) ?? 1,
      children: n.children.map(deco),
    })
    return this.modelIDs.map((_, mi) => {
      const nodes = (this.spatialTrees[mi] ?? []).map(deco)
      return {
        index: mi, name: this.modelNames[mi] ?? `Modelo ${mi + 1}`,
        count: nodes.reduce((s, n) => s + n.count, 0),
        visible: this.modelVisible[mi] !== false, opacity: this.modelOpacity[mi] ?? 1, nodes,
      }
    })
  }
  setModelVisible(mi: number, v: boolean) { this.modelVisible[mi] = v; this.refreshModel(mi) }
  setModelOpacity(mi: number, op: number) { this.modelOpacity[mi] = op; this.refreshModel(mi) }
  setNodeVisible(key: string, v: boolean) { this.nodeVisible.set(key, v); for (const gid of this.nodeGids.get(key) ?? []) this.refreshMesh(gid) }
  setNodeOpacity(key: string, op: number) { this.nodeOpacity.set(key, op); for (const gid of this.nodeGids.get(key) ?? []) this.refreshMesh(gid) }
  private refreshModel(mi: number) { for (const gid of this.meshes.keys()) if (gid.startsWith(`${mi}:`)) this.refreshMesh(gid) }

  // ===================== ATRIBUTOS DO ELEMENTO =====================
  private unwrap(v: unknown): string {
    if (v == null) return ""
    if (typeof v === "object") {
      const o = v as { value?: unknown }
      if ("value" in o) return o.value == null ? "" : String(o.value)
      return ""
    }
    return String(v)
  }
  async getElementInfo(gid: string): Promise<ElementInfo | null> {
    const [miStr, eidStr] = gid.split(":")
    const mi = Number(miStr), eid = Number(eidStr)
    const mid = this.modelIDs[mi]; if (mid == null) return null
    const type = this.typeOf.get(gid) ?? "IFCUNKNOWN"
    const attrs: [string, string][] = []
    let name = "", globalId = ""
    try {
      const props = await this.ifcAPI.properties.getItemProperties(mid, eid, false) as Record<string, unknown>
      name = this.unwrap(props.Name)
      globalId = this.unwrap(props.GlobalId)
      const wanted: [string, string][] = [
        ["ObjectType", "Tipo do objeto"], ["Tag", "Tag"], ["PredefinedType", "Predefinido"],
        ["Description", "Descrição"], ["ObjectPlacement", ""],
      ]
      for (const [k, lbl] of wanted) {
        if (!lbl) continue
        const val = this.unwrap(props[k])
        if (val && val !== "undefined") attrs.push([lbl, val])
      }
    } catch { /* ignora */ }

    const psets: { name: string; props: [string, string][] }[] = []
    try {
      const raw = await this.ifcAPI.properties.getPropertySets(mid, eid, true) as Record<string, unknown>[]
      for (const ps of raw) {
        const psName = this.unwrap((ps as { Name?: unknown }).Name) || "Propriedades"
        const props: [string, string][] = []
        const hp = (ps as { HasProperties?: Record<string, unknown>[] }).HasProperties
        if (Array.isArray(hp)) for (const p of hp) {
          const pn = this.unwrap((p as { Name?: unknown }).Name)
          const pv = this.unwrap((p as { NominalValue?: unknown }).NominalValue)
          if (pn) props.push([pn, pv])
        }
        const qs = (ps as { Quantities?: Record<string, unknown>[] }).Quantities
        if (Array.isArray(qs)) for (const q of qs) {
          const qn = this.unwrap((q as { Name?: unknown }).Name)
          const qv = this.unwrap((q as { LengthValue?: unknown; AreaValue?: unknown; VolumeValue?: unknown; CountValue?: unknown; WeightValue?: unknown }).LengthValue
            ?? (q as { AreaValue?: unknown }).AreaValue ?? (q as { VolumeValue?: unknown }).VolumeValue
            ?? (q as { CountValue?: unknown }).CountValue ?? (q as { WeightValue?: unknown }).WeightValue)
          if (qn) props.push([qn, qv])
        }
        if (props.length) psets.push({ name: psName, props })
      }
    } catch { /* ignora */ }

    // separa a FICHA DO ATIVO (PT-BR) dos psets técnicos
    const apIdx = psets.findIndex((p) => p.name.startsWith(ASSET_PSET))
    let asset: [string, string][] = []
    if (apIdx >= 0) {
      const ap = psets.splice(apIdx, 1)[0]
      const map = new Map(ap.props.map(([k, v]) => [normKey(k), v]))
      asset = ASSET_ORDER.map((k) => [k, map.get(normKey(k)) ?? ""] as [string, string]).filter(([, v]) => v)
    }

    return { gid, modelName: this.modelNames[mi] ?? `Modelo ${mi + 1}`, type, typeLabel: labelForType(type), name, globalId, asset, attrs, psets }
  }

  // ===================== ANOTAÇÕES (nota + cor + marcador "!") =====================
  /** aplica cor (ou null) + marcador. hasNote controla o "!" mesmo sem cor. */
  annotate(gid: string, color: string | null, hasNote: boolean) {
    if (color) this.paint.set(gid, color); else this.paint.delete(gid)
    this.refreshMesh(gid)
    this.setMarker(gid, !!color || hasNote)
  }
  private setMarker(gid: string, on: boolean) {
    const cur = this.markers.get(gid)
    if (on) {
      if (cur) return
      const c = this.centroid.get(gid); if (!c) return
      // sizeAttenuation:false = tamanho constante em TELA (sutil e sempre legível),
      // independente do tamanho do modelo e da distância da câmera
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.markerTex, depthTest: false, transparent: true, sizeAttenuation: false }))
      sp.scale.set(0.045, 0.045, 1)
      sp.position.copy(c)
      sp.renderOrder = 24
      sp.userData = { gid } // permite clicar no "!" p/ selecionar o elemento
      this.markerGroup.add(sp); this.markers.set(gid, sp)
    } else if (cur) {
      this.markerGroup.remove(cur); cur.material.dispose(); this.markers.delete(gid)
    }
  }

  addPinSprite(id: string, pos: [number, number, number]) {
    if (this.pins.has(id)) this.removePinSprite(id)
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.pinTex, depthTest: false, transparent: true }))
    const s = this.maxDim * 0.06
    sp.scale.set(s * 0.8, s, 1)
    sp.center.set(0.5, 0)
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

  // ===================== MOVIMENTO (setas / teclado) =====================
  setForward(v: number) { this.moveInput.f = v }
  setRight(v: number) { this.moveInput.r = v }
  setUp(v: number) { this.moveInput.u = v }
  setRotate(v: number) { this.btnRot = v }   // botão de rotação (mobile)
  stopMove() { this.moveInput.f = this.moveInput.r = this.moveInput.u = 0; this.btnRot = 0 }
  private applyMove() {
    const f = Math.max(-1, Math.min(1, this.moveInput.f + this.padInput.f + this.keyMove.f))
    const r = Math.max(-1, Math.min(1, this.moveInput.r + this.padInput.r + this.keyMove.r))
    const u = Math.max(-1, Math.min(1, this.moveInput.u + this.padInput.u + this.keyMove.u))
    if (!f && !r && !u) return
    const speed = this.maxDim * 0.004
    this._mf.set(0, 0, -1).applyQuaternion(this.camera.quaternion)
    this._mr.set(1, 0, 0).applyQuaternion(this.camera.quaternion)
    this._md.set(0, 0, 0)
    this._md.addScaledVector(this._mf, f * speed)
    this._md.addScaledVector(this._mr, r * speed)
    this._md.addScaledVector(this._mup, u * speed)
    this.camera.position.add(this._md)
    this.controls.target.add(this._md)
  }
  // gira a vista em torno do alvo (azimute) — teclado ←→ e botão mobile. Só no modo mono.
  private applyRotate() {
    if (this.vrMode) return
    const rot = Math.max(-1, Math.min(1, this.keyRot + this.btnRot))
    if (!rot) return
    const speed = 0.028
    this._off.copy(this.camera.position).sub(this.controls.target)
    this._off.applyAxisAngle(this._yax, rot * speed)
    this.camera.position.copy(this.controls.target).add(this._off)
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
