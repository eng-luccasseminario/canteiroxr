import { useEffect, useRef, useState, type ChangeEvent } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Upload, Glasses, RefreshCw, Loader2, Building2, MapPin, Save, List, ChevronRight, Trash2, Image as ImageIcon, FolderOpen, Sparkles, EyeOff, Eye, Focus, X, Scan, Printer, Camera, Pencil, Layers, ListTree, Check } from "lucide-react"
import { VrIfcEngine, type ElementInfo, type TreeModel } from "@/engine/VrIfcEngine"
import { Button } from "@/components/ui/button"
import { TopBar } from "@/components/TopBar"
import { VrOverlay } from "@/components/VrOverlay"
import { MoveControls } from "@/components/MoveControls"
import { Pano360Overlay } from "@/components/Pano360Overlay"
import { ElementInfoPanel } from "@/components/ElementInfoPanel"
import { ModelTree } from "@/components/ModelTree"
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet"
import { newId, saveProject, getProject, listProjects, deleteProject, renameProject, projectModels, type Pin, type ProjectMeta, type ArAnchor, type ModelRef, type Annotation } from "@/lib/projectDb"

export default function ProjectScreen({ back }: { back: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const engineRef = useRef<VrIfcEngine | null>(null)
  const ifcInput = useRef<HTMLInputElement>(null)
  const addIfcInput = useRef<HTMLInputElement>(null)
  const panoInput = useRef<HTMLInputElement>(null)
  const modelsRef = useRef<ModelRef[]>([])
  const projectId = useRef<string>("")
  const pinsRef = useRef<Pin[]>([])
  const annRef = useRef<Record<string, Annotation>>({})

  const [ready, setReady] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [progress, setProgress] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [vrMode, setVrMode] = useState(false)
  const [pins, setPins] = useState<Pin[]>([])
  const [placing, setPlacing] = useState(false)
  const [projectName, setProjectName] = useState("Meu projeto")
  const [saved, setSaved] = useState<ProjectMeta[]>([])
  const [toast, setToast] = useState<string | null>(null)

  const [pending, setPending] = useState<{ pos: [number, number, number]; view: Pin["view"]; thumb: string } | null>(null)
  const [pendingPano, setPendingPano] = useState<File | null>(null)
  const [pendingName, setPendingName] = useState("")
  const [selected, setSelected] = useState<Pin | null>(null)
  const [editName, setEditName] = useState("")
  const [editingPin, setEditingPin] = useState<Pin | null>(null)
  const [pano360, setPano360] = useState<Pin | null>(null)
  const [pinsMenu, setPinsMenu] = useState(false)
  const [selCount, setSelCount] = useState(0)
  const [hiddenCount, setHiddenCount] = useState(0)
  const [arMode, setArMode] = useState(false)
  const [arAnchor, setArAnchor] = useState<ArAnchor | null>(null)
  const arAnchorRef = useRef<ArAnchor | null>(null)
  const applyAnchor = (a: ArAnchor | null) => { arAnchorRef.current = a; setArAnchor(a) }

  // seleção de elemento (atributos + anotação)
  const [selectedGid, setSelectedGid] = useState<string | null>(null)
  const [elemInfo, setElemInfo] = useState<ElementInfo | null>(null)
  const [infoLoading, setInfoLoading] = useState(false)
  const [annotations, setAnnotations] = useState<Record<string, Annotation>>({})
  // árvore do modelo
  const [treeOpen, setTreeOpen] = useState(false)
  const [tree, setTree] = useState<TreeModel[]>([])
  // renomear projeto salvo
  const [savedEditId, setSavedEditId] = useState<string | null>(null)
  const [savedEditName, setSavedEditName] = useState("")

  useEffect(() => { pinsRef.current = pins }, [pins])
  useEffect(() => { annRef.current = annotations }, [annotations])
  useEffect(() => { if (selected) setEditName(selected.name) }, [selected])
  const showToast = (m: string) => { setToast(m); setTimeout(() => setToast(null), 2200) }
  const refreshTree = () => setTree(engineRef.current?.getTree() ?? [])

  useEffect(() => {
    if (!canvasRef.current) return
    const eng = new VrIfcEngine(canvasRef.current)
    eng.onVrChange = setVrMode
    eng.onPlacePin = (pos) => {
      const view = eng.getView(); const thumb = eng.captureThumbnail()
      setPendingName(`Ambiente ${pinsRef.current.length + 1}`)
      setPending({ pos, view, thumb }); setPlacing(false); eng.setPlacing(false)
    }
    eng.onPinClick = (id) => { const p = pinsRef.current.find((x) => x.id === id); if (p) setSelected(p) }
    eng.onSelectionChange = (s, h) => { setSelCount(s); setHiddenCount(h) }
    eng.onSelect = (gid) => setSelectedGid(gid)
    eng.onPlaceAnchor = (pos, normal) => {
      if (Math.abs(normal[1]) > 0.6) { showToast("A folha só pode ser fixada numa parede (superfície vertical)"); return }
      const headingDeg = (Math.atan2(normal[0], normal[2]) * 180) / Math.PI
      const a: ArAnchor = { pos, heading: headingDeg }
      applyAnchor(a); eng.showAnchor(a.pos, a.heading); eng.setArPlacing(false)
      persist(pinsRef.current)
    }
    engineRef.current = eng
    setReady(true)
    listProjects().then(setSaved)
    return () => { eng.dispose(); engineRef.current = null }
  }, [])

  // busca os atributos do elemento selecionado (assíncrono)
  useEffect(() => {
    const eng = engineRef.current
    if (!selectedGid || !eng) { setElemInfo(null); setInfoLoading(false); return }
    let alive = true
    setInfoLoading(true); setElemInfo(null)
    eng.getElementInfo(selectedGid).then((info) => { if (alive) { setElemInfo(info); setInfoLoading(false) } })
    return () => { alive = false }
  }, [selectedGid])

  /** carrega uma lista de modelos (federação) do zero */
  async function loadModelsList(models: ModelRef[]) {
    const eng = engineRef.current; if (!eng) return
    setError(null); setProgress(0.03)
    try {
      eng.clearModels()
      for (let i = 0; i < models.length; i++) {
        const bytes = new Uint8Array(await models[i].blob.arrayBuffer())
        await eng.addModel(bytes, models[i].name, (p) => setProgress((i + p) / models.length))
      }
      modelsRef.current = models
      refreshTree()
      setLoaded(true)
    } catch (e) { setError(e instanceof Error ? e.message : String(e)) }
    finally { setProgress(null) }
  }

  const onIfc = async (e: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []); e.target.value = ""; if (!files.length) return
    projectId.current = newId()
    setProjectName(files.length === 1 ? files[0].name.replace(/\.[^.]+$/, "") : `Compatibilização (${files.length} modelos)`)
    setPins([]); setSelectedGid(null); setAnnotations({}); annRef.current = {}; applyAnchor(null)
    await loadModelsList(files.map((f) => ({ name: f.name.replace(/\.[^.]+$/, ""), blob: f })))
  }

  // adiciona 1+ IFC ao projeto atual (compatibilização) sem apagar o que já existe
  const onAddIfc = async (e: ChangeEvent<HTMLInputElement>) => {
    const eng = engineRef.current; const files = Array.from(e.target.files ?? []); e.target.value = ""
    if (!eng || !files.length) return
    setError(null); setProgress(0.03)
    try {
      for (let i = 0; i < files.length; i++) {
        const f = files[i]
        const bytes = new Uint8Array(await f.arrayBuffer())
        await eng.addModel(bytes, f.name.replace(/\.[^.]+$/, ""), (p) => setProgress((i + p) / files.length))
        modelsRef.current = [...modelsRef.current, { name: f.name.replace(/\.[^.]+$/, ""), blob: f }]
      }
      refreshTree(); await persist(pinsRef.current); showToast(`${files.length} modelo(s) adicionado(s) ✓`)
    } catch (e) { setError(e instanceof Error ? e.message : String(e)) }
    finally { setProgress(null) }
  }

  async function loadExample() {
    const eng = engineRef.current; if (!eng) return
    try {
      const base = import.meta.env.BASE_URL
      projectId.current = newId(); setProjectName("Exemplo — Casa FZK"); setPins([])
      setSelectedGid(null); setAnnotations({}); annRef.current = {}; applyAnchor(null)
      const ifc = await (await fetch(`${base}samples/casa-fzk-haus.ifc`)).blob()
      await loadModelsList([{ name: "Casa FZK", blob: ifc }])
      const [panoSuite, panoSala] = await Promise.all([
        fetch(`${base}samples/quarto-suite-360.jpg`).then((r) => r.blob()),
        fetch(`${base}samples/sala-360.jpg`).then((r) => r.blob()),
      ])
      const view = eng.getView(); const thumb = eng.captureThumbnail()
      const c = eng.getCenter(); const d = eng.getMaxDim()
      const p1: Pin = { id: newId(), name: "Suíte (exemplo)", pos: c, view, thumb, pano: panoSuite }
      const p2: Pin = { id: newId(), name: "Sala (exemplo)", pos: [c[0] + d * 0.25, c[1], c[2] + d * 0.15], view, thumb, pano: panoSala }
      eng.addPinSprite(p1.id, p1.pos); eng.addPinSprite(p2.id, p2.pos)
      const list = [p1, p2]; setPins(list); await persist(list)
      showToast("Exemplo carregado — 2 ambientes 📍")
    } catch (e) { setError(e instanceof Error ? e.message : String(e)) }
  }

  async function openSaved(id: string) {
    const p = await getProject(id); if (!p) return
    projectId.current = p.id; setProjectName(p.name); setPins(p.pins)
    const ann = p.annotations ?? {}; setAnnotations(ann); annRef.current = ann
    await loadModelsList(projectModels(p))
    const eng = engineRef.current
    if (eng) {
      p.pins.forEach((pin) => eng.addPinSprite(pin.id, pin.pos))
      if (p.arAnchor) { applyAnchor(p.arAnchor); eng.showAnchor(p.arAnchor.pos, p.arAnchor.heading) }
      else applyAnchor(null)
      for (const [gid, a] of Object.entries(ann)) eng.annotate(gid, a.color ?? null, !!a.note)
    }
  }

  async function persist(list: Pin[]) {
    const models = modelsRef.current
    if (!models.length || !projectId.current) return
    await saveProject({
      id: projectId.current, name: projectName, ifc: models[0].blob, models, pins: list,
      arAnchor: arAnchorRef.current ?? undefined, annotations: annRef.current, updatedAt: Date.now(),
    })
    listProjects().then(setSaved)
  }

  const togglePlacing = () => {
    const eng = engineRef.current; if (!eng) return
    const n = !placing; setPlacing(n); eng.setPlacing(n)
    if (n) showToast("Toque num ponto do modelo para fixar o pino 360")
  }

  const confirmPin = async () => {
    const eng = engineRef.current
    if (!eng || !pending || !pendingPano) return
    const pin: Pin = { id: newId(), name: pendingName.trim() || `Ambiente ${pins.length + 1}`, pos: pending.pos, view: pending.view, thumb: pending.thumb, pano: pendingPano }
    eng.addPinSprite(pin.id, pin.pos)
    const list = [...pins, pin]; setPins(list)
    setPending(null); setPendingPano(null); setPendingName("")
    await persist(list); showToast("Pino 360 criado ✓")
  }

  const commitRename = async () => {
    if (!selected) return
    const nm = editName.trim() || selected.name
    if (nm === selected.name) return
    const list = pins.map((p) => (p.id === selected.id ? { ...p, name: nm } : p))
    setPins(list); setSelected({ ...selected, name: nm }); await persist(list)
  }

  const deletePin = async (pin: Pin) => {
    engineRef.current?.removePinSprite(pin.id)
    const list = pins.filter((p) => p.id !== pin.id); setPins(list); setSelected(null)
    await persist(list)
  }

  // ---- anotações (nota + cor) ----
  const updateAnnotation = (gid: string, a: Annotation) => {
    const clean: Annotation | null = (a.color || a.note) ? a : null
    const map = { ...annRef.current }
    if (clean) map[gid] = clean; else delete map[gid]
    annRef.current = map; setAnnotations(map)
    engineRef.current?.annotate(gid, clean?.color ?? null, !!clean?.note)
    persist(pinsRef.current)
  }
  const setElemColor = (color: string | null) => {
    if (!selectedGid) return
    updateAnnotation(selectedGid, { ...(annRef.current[selectedGid] ?? {}), color: color ?? undefined })
  }
  const setElemNote = (note: string) => {
    if (!selectedGid) return
    updateAnnotation(selectedGid, { ...(annRef.current[selectedGid] ?? {}), note: note || undefined })
  }
  const closeInfo = () => { engineRef.current?.clearSelection() }

  const enterModelVR = (pin?: Pin) => {
    const eng = engineRef.current; if (!eng) return
    if (pin) eng.applyView(pin.view)
    setSelected(null); eng.enterVR()
  }

  const goToPin = (pin: Pin) => { setPinsMenu(false); engineRef.current?.applyView(pin.view); setSelected(pin) }

  const startEditView = (pin: Pin) => {
    setSelected(null); setEditingPin(pin)
    engineRef.current?.applyView(pin.view)
    showToast("Posicione a vista com as setas/arraste e toque em Salvar vista")
  }
  const saveEditView = async () => {
    const eng = engineRef.current; if (!eng || !editingPin) return
    const view = eng.getView(); const thumb = eng.captureThumbnail()
    const list = pins.map((p) => (p.id === editingPin.id ? { ...p, view, thumb } : p))
    setPins(list); setEditingPin(null); await persist(list); showToast("Vista do pino atualizada ✓")
  }

  const delSaved = async (id: string) => {
    if (!confirm("Excluir este projeto salvo? Não dá para desfazer.")) return
    await deleteProject(id); setSaved(await listProjects())
  }
  const commitSavedRename = async () => {
    if (!savedEditId) return
    await renameProject(savedEditId, savedEditName)
    if (savedEditId === projectId.current) setProjectName(savedEditName.trim() || projectName)
    setSavedEditId(null); setSaved(await listProjects())
  }

  // ---- Modo RA (marcador A4) ----
  const startAr = () => {
    const eng = engineRef.current; if (!eng) return
    setArMode(true); eng.setArPlacing(true)
    if (!arAnchorRef.current) showToast("Toque no ponto do modelo onde ficará a folha A4")
  }
  const exitAr = () => { engineRef.current?.setArPlacing(false); setArMode(false) }
  const repositionAnchor = () => { engineRef.current?.setArPlacing(true); showToast("Toque na parede onde a folha A4 vai ficar") }
  const printMarker = () => window.open(`${import.meta.env.BASE_URL}marcador-a4.html`, "_blank")
  const openArCamera = async () => {
    if (!arAnchorRef.current) { showToast("Toque numa parede para posicionar a folha A4 primeiro"); return }
    try { await persist(pins) } catch (e) { console.error(e) }
    window.location.href = `${import.meta.env.BASE_URL}ar.html?id=${encodeURIComponent(projectId.current)}`
  }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0">
      <canvas ref={canvasRef} className="fixed inset-0 block" style={{ touchAction: "none" }} />
      <input ref={ifcInput} type="file" accept=".ifc" multiple hidden onChange={onIfc} />
      <input ref={addIfcInput} type="file" accept=".ifc" multiple hidden onChange={onAddIfc} />
      <input ref={panoInput} type="file" accept="image/*" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) setPendingPano(f) }} />

      {!vrMode && <TopBar title={loaded ? projectName : "Projeto BIM + 360°"} tag="Modelo IFC · Pinos 360 · RV" onBack={back} />}

      {/* Barra de seleção (ocultar / isolar) — responsiva, quebra em telas pequenas */}
      {loaded && !vrMode && (selCount > 0 || hiddenCount > 0) && (
        <div className="pointer-events-none fixed inset-x-2 z-20 flex justify-center" style={{ top: "calc(64px + env(safe-area-inset-top))" }}>
          <div className="glass pointer-events-auto flex max-w-full flex-wrap items-center justify-center gap-1.5 rounded-2xl border border-border px-2 py-1.5 shadow-lg">
            {selCount > 0 && (
              <>
                <span className="whitespace-nowrap px-1 text-xs font-bold text-primary">{selCount} selec.</span>
                <Button size="sm" variant="secondary" onClick={() => engineRef.current?.hideSelected()}><EyeOff className="h-4 w-4" /> Ocultar</Button>
                <Button size="sm" variant="secondary" onClick={() => engineRef.current?.isolateSelected()}><Focus className="h-4 w-4" /> Isolar</Button>
                <Button size="sm" variant="ghost" onClick={() => engineRef.current?.clearSelection()} aria-label="Limpar seleção"><X className="h-4 w-4" /></Button>
              </>
            )}
            {hiddenCount > 0 && (
              <Button size="sm" variant="outline" onClick={() => engineRef.current?.showAll()}><Eye className="h-4 w-4" /> Mostrar tudo ({hiddenCount})</Button>
            )}
          </div>
        </div>
      )}

      {/* Estado vazio */}
      {ready && !loaded && progress === null && (
        <div className="fixed inset-0 z-10 flex flex-col items-center justify-center px-8 text-center">
          <div className="mb-5 inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/15 text-primary ring-1 ring-primary/25">
            <Building2 className="h-8 w-8" />
          </div>
          <h2 className="text-xl font-bold">Projeto BIM + 360°</h2>
          <p className="mx-auto mt-2 max-w-xs text-sm text-muted-foreground">
            Carregue um ou mais <b className="text-foreground">.ifc</b> (compatibilização), fixe <b className="text-foreground">pinos 360°</b> e veja tudo em <b className="text-foreground">RV</b>.
          </p>
          <Button size="lg" className="mt-6" onClick={() => ifcInput.current?.click()}><Upload className="h-5 w-5" /> Carregar IFC</Button>
          <Button variant="outline" className="mt-3" onClick={loadExample}><Sparkles className="h-4 w-4" /> Carregar exemplo (casa + 2 ambientes 360°)</Button>
          {error && <p className="mt-4 max-w-xs text-xs text-red-400">Erro: {error}</p>}

          {saved.length > 0 && (
            <div className="mt-8 w-full max-w-xs">
              <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-muted-foreground"><FolderOpen className="h-4 w-4" /> Projetos salvos</div>
              <div className="flex flex-col gap-2">
                {saved.map((p) => (
                  <div key={p.id} className="flex items-center gap-2 rounded-lg border border-border bg-secondary/40 p-2 hover:bg-secondary">
                    {savedEditId === p.id ? (
                      <div className="flex flex-1 items-center gap-2">
                        <input
                          autoFocus value={savedEditName}
                          onChange={(e) => setSavedEditName(e.target.value)}
                          onKeyDown={(e) => { if (e.key === "Enter") commitSavedRename(); if (e.key === "Escape") setSavedEditId(null) }}
                          className="min-w-0 flex-1 rounded border border-border bg-background px-2 py-1 text-sm focus:border-primary focus:outline-none"
                        />
                        <button onClick={commitSavedRename} aria-label="Salvar nome" className="grid h-8 w-8 shrink-0 place-items-center rounded-md text-primary hover:bg-primary/10"><Check className="h-4 w-4" /></button>
                        <button onClick={() => setSavedEditId(null)} aria-label="Cancelar" className="grid h-8 w-8 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-secondary"><X className="h-4 w-4" /></button>
                      </div>
                    ) : (
                      <>
                        <button onClick={() => openSaved(p.id)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
                          {p.cover ? <img src={p.cover} alt="" className="h-10 w-16 rounded object-cover" /> : <div className="grid h-10 w-16 place-items-center rounded bg-secondary"><Building2 className="h-4 w-4 text-muted-foreground" /></div>}
                          <div className="min-w-0 flex-1"><div className="truncate text-sm font-medium">{p.name}</div><div className="text-[11px] text-muted-foreground">{p.pinCount} pino(s) · {p.modelCount} modelo(s)</div></div>
                        </button>
                        <button onClick={() => { setSavedEditId(p.id); setSavedEditName(p.name) }} aria-label="Renomear projeto" className="grid h-8 w-8 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-secondary"><Pencil className="h-4 w-4" /></button>
                        <button onClick={() => delSaved(p.id)} aria-label="Excluir projeto" className="grid h-8 w-8 shrink-0 place-items-center rounded-md text-red-400 hover:bg-red-500/10"><Trash2 className="h-4 w-4" /></button>
                      </>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Carregando */}
      {progress !== null && (
        <div className="fixed inset-0 z-10 flex flex-col items-center justify-center gap-4 px-8 text-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <div className="text-sm text-muted-foreground">Processando modelo… {Math.round(progress * 100)}%</div>
          <div className="h-1.5 w-52 overflow-hidden rounded-full bg-secondary"><div className="h-full rounded-full bg-primary transition-all" style={{ width: `${progress * 100}%` }} /></div>
        </div>
      )}

      {/* Setas de locomoção (topo) — escondidas durante seleção p/ não sobrepor */}
      {loaded && !vrMode && !placing && selCount === 0 && <MoveControls engine={engineRef.current} />}

      {/* Painel de ATRIBUTOS + anotação do elemento selecionado */}
      <AnimatePresence>
        {loaded && !vrMode && !arMode && selectedGid && (
          <ElementInfoPanel
            info={elemInfo} loading={infoLoading}
            annotation={annotations[selectedGid] ?? {}}
            onColor={setElemColor} onNote={setElemNote}
            onHide={() => engineRef.current?.hideSelected()}
            onIsolate={() => engineRef.current?.isolateSelected()}
            onClose={closeInfo}
          />
        )}
      </AnimatePresence>

      {/* Painel de edição de vista do pino */}
      {loaded && !vrMode && !arMode && editingPin && (
        <motion.div initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className="glass fixed inset-x-0 bottom-0 z-20 flex flex-col gap-2 border-t border-border px-4 py-3 safe-bottom">
          <p className="text-center text-[11px] text-muted-foreground">✏️ Atualizando a vista de <b className="text-foreground">{editingPin.name}</b> · use as setas/arraste p/ enquadrar</p>
          <div className="flex gap-2">
            <Button variant="secondary" className="flex-1" onClick={() => setEditingPin(null)}>Cancelar</Button>
            <Button className="flex-1" onClick={saveEditView}><Save className="h-4 w-4" /> Salvar vista</Button>
          </div>
        </motion.div>
      )}

      {/* Painel inferior */}
      {loaded && !vrMode && !arMode && !editingPin && (
        <motion.div initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className="glass fixed inset-x-0 bottom-0 z-20 flex flex-col gap-2 border-t border-border px-4 py-3 safe-bottom">
          <p className="text-center text-[11px] text-muted-foreground">
            {placing ? "👆 Toque no ponto do modelo para fixar o pino" : `📍 ${pins.length} pino(s) · ${modelsRef.current.length} modelo(s) · WASD/setas p/ andar · toque num elemento p/ ver atributos`}
          </p>
          <div className="flex flex-wrap items-center justify-center gap-2">
            <Button variant="secondary" size="icon" onClick={() => ifcInput.current?.click()} aria-label="Novo IFC (troca o projeto)"><RefreshCw className="h-4 w-4" /></Button>
            <Button variant="secondary" size="sm" onClick={() => addIfcInput.current?.click()}><Layers className="h-4 w-4" /> + Modelo</Button>
            <Button variant="secondary" size="sm" onClick={() => { refreshTree(); setTreeOpen(true) }}><ListTree className="h-4 w-4" /> Árvore</Button>
            <Button variant={placing ? "default" : "secondary"} size="sm" onClick={togglePlacing}><MapPin className="h-4 w-4" /> {placing ? "Cancelar" : "Pino 360"}</Button>
            <Button variant="secondary" size="icon" onClick={() => setPinsMenu(true)} aria-label="Lista de pinos" disabled={!pins.length}><List className="h-4 w-4" /></Button>
            <Button variant="secondary" size="sm" onClick={startAr}><Scan className="h-4 w-4" /> RA</Button>
            <Button variant="secondary" size="icon" onClick={() => persist(pins).then(() => showToast("Projeto salvo ✓"))} aria-label="Salvar"><Save className="h-4 w-4" /></Button>
            <Button className="flex-1" onClick={() => enterModelVR()}><Glasses className="h-5 w-5" /> VR</Button>
          </div>
        </motion.div>
      )}

      {/* Painel do modo RA */}
      {loaded && !vrMode && arMode && !editingPin && (
        <motion.div initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className="glass fixed inset-x-0 bottom-0 z-20 flex flex-col gap-2 border-t border-border px-4 py-3 safe-bottom">
          <div className="flex items-center gap-2 text-sm font-bold"><Scan className="h-4 w-4 text-primary" /> Modo RA · marcador A4</div>
          <p className="text-[11px] text-muted-foreground">
            {!arAnchor ? "👆 Toque numa PAREDE do modelo (superfície vertical) onde a folha A4 vai ficar." : "Folha A4 em escala real na parede. Imprima o marcador e confirme para escanear."}
          </p>
          {arAnchor && (
            <>
              <div className="flex items-center gap-2 rounded-lg bg-secondary/40 px-3 py-2 text-xs">
                <span className="text-muted-foreground">📏 Altura do chão até a folha:</span>
                <b className="text-primary">{(arAnchor.pos[1] - (engineRef.current?.getFloorY() ?? 0)).toFixed(2).replace(".", ",")} m</b>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Button variant="secondary" size="sm" onClick={repositionAnchor}><MapPin className="h-4 w-4" /> Reposicionar</Button>
                <Button variant="secondary" size="sm" onClick={printMarker}><Printer className="h-4 w-4" /> Marcador A4</Button>
              </div>
              <Button className="w-full" onClick={openArCamera}><Camera className="h-5 w-5" /> Confirmar e abrir câmera</Button>
            </>
          )}
          <Button variant="ghost" size="sm" onClick={exitAr}>Sair do modo RA</Button>
        </motion.div>
      )}

      {/* Sheet: novo pino (nome + foto 360) */}
      <Sheet open={!!pending} onOpenChange={(o) => { if (!o) { setPending(null); setPendingPano(null) } }}>
        <SheetContent side="bottom" className="mx-auto max-w-md">
          <SheetTitle className="mb-1 flex items-center gap-2"><MapPin className="h-4 w-4 text-primary" /> Novo pino 360°</SheetTitle>
          <p className="mb-3 text-xs text-muted-foreground">Dê um nome ao ambiente e anexe a foto 360° (equiretangular) deste ponto. A vista atual do modelo foi salva.</p>
          {pending && <img src={pending.thumb} alt="vista" className="mb-3 h-28 w-full rounded-lg object-cover" />}
          <label className="mb-1 block text-xs font-semibold text-muted-foreground">Nome do ambiente</label>
          <input
            value={pendingName}
            onChange={(e) => setPendingName(e.target.value)}
            placeholder="Ex.: Sala de estar"
            className="mb-3 w-full rounded-lg border border-border bg-secondary/40 px-3 py-2 text-sm focus:border-primary focus:outline-none"
          />
          <button onClick={() => panoInput.current?.click()} className="mb-3 flex w-full items-center gap-3 rounded-lg border border-dashed border-border bg-secondary/40 p-3 text-left hover:bg-secondary">
            <ImageIcon className="h-5 w-5 text-primary" />
            <span className="text-sm">{pendingPano ? pendingPano.name : "Escolher foto 360°…"}</span>
          </button>
          <Button className="w-full" disabled={!pendingPano} onClick={confirmPin}>Criar pino</Button>
        </SheetContent>
      </Sheet>

      {/* Sheet: cartão do pino (vista salva + 2 opções) */}
      <Sheet open={!!selected} onOpenChange={(o) => { if (!o) setSelected(null) }}>
        <SheetContent side="bottom" className="mx-auto max-w-md">
          {selected && (
            <>
              <SheetTitle className="mb-2 flex items-center gap-2">
                <MapPin className="h-4 w-4 shrink-0 text-primary" />
                <input
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  onBlur={commitRename}
                  onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur() }}
                  aria-label="Nome do ambiente"
                  className="min-w-0 flex-1 border-b border-transparent bg-transparent text-base font-bold focus:border-border focus:outline-none"
                />
              </SheetTitle>
              <img src={selected.thumb} alt="vista salva" className="mb-3 h-32 w-full rounded-lg object-cover" />
              <div className="grid grid-cols-2 gap-2">
                <Button onClick={() => enterModelVR(selected)}><Building2 className="h-4 w-4" /> Modelo em RV</Button>
                <Button onClick={() => { const p = selected; setSelected(null); setPano360(p) }}><Glasses className="h-4 w-4" /> 360° em RV</Button>
              </div>
              <Button variant="secondary" className="mt-2 w-full" onClick={() => startEditView(selected)}>
                <Pencil className="h-4 w-4" /> Atualizar vista deste pino
              </Button>
              <Button variant="ghost" className="mt-2 w-full text-red-400 hover:text-red-300" onClick={() => deletePin(selected)}>
                <Trash2 className="h-4 w-4" /> Excluir pino
              </Button>
            </>
          )}
        </SheetContent>
      </Sheet>

      {/* Sheet: lista de pinos salvos */}
      <Sheet open={pinsMenu} onOpenChange={setPinsMenu}>
        <SheetContent side="bottom" className="mx-auto max-w-md">
          <SheetTitle className="mb-2 flex items-center gap-2"><List className="h-4 w-4 text-primary" /> Pinos do projeto ({pins.length})</SheetTitle>
          {pins.length === 0 ? (
            <p className="text-xs text-muted-foreground">Nenhum pino ainda. Use “Pino 360” para criar.</p>
          ) : (
            <div className="flex max-h-[52vh] flex-col gap-2 overflow-auto">
              {pins.map((p) => (
                <button key={p.id} onClick={() => goToPin(p)} className="flex items-center gap-3 rounded-lg border border-border bg-secondary/40 p-2 text-left hover:bg-secondary">
                  <img src={p.thumb} alt="" className="h-12 w-20 rounded object-cover" />
                  <span className="flex-1 truncate text-sm font-medium">{p.name}</span>
                  <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                </button>
              ))}
            </div>
          )}
        </SheetContent>
      </Sheet>

      {/* Sheet: árvore do modelo (disciplina/categoria + raio-X) */}
      <Sheet open={treeOpen} onOpenChange={setTreeOpen}>
        <SheetContent side="bottom" className="mx-auto max-w-md">
          <SheetTitle className="mb-2 flex items-center gap-2"><ListTree className="h-4 w-4 text-primary" /> Árvore do modelo</SheetTitle>
          <ModelTree
            tree={tree}
            onModelVisible={(mi, v) => { engineRef.current?.setModelVisible(mi, v); refreshTree() }}
            onModelOpacity={(mi, op) => { engineRef.current?.setModelOpacity(mi, op); refreshTree() }}
            onTypeVisible={(mi, t, v) => { engineRef.current?.setTypeVisible(mi, t, v); refreshTree() }}
            onTypeOpacity={(mi, t, op) => { engineRef.current?.setTypeOpacity(mi, t, op); refreshTree() }}
          />
        </SheetContent>
      </Sheet>

      {/* Overlay 360 do pino */}
      {pano360 && <Pano360Overlay pins={pins} startId={pano360.id} onClose={() => setPano360(null)} />}

      {/* toast */}
      {toast && <div className="fixed bottom-24 left-1/2 z-50 -translate-x-1/2 rounded-full bg-foreground px-4 py-2 text-xs font-semibold text-background shadow-lg">{toast}</div>}

      <VrOverlay engine={engineRef.current} show={vrMode} onExit={() => engineRef.current?.exitVR()} />
    </motion.div>
  )
}
