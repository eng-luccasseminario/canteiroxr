import { useEffect, useRef, useState, type ChangeEvent } from "react"
import { motion } from "framer-motion"
import { Upload, Globe2, Glasses, Link2, X, Plus, Check } from "lucide-react"
import { PanoEngine } from "@/engine/PanoEngine"
import { Button } from "@/components/ui/button"
import { TopBar } from "@/components/TopBar"
import { VrBoxSettings } from "@/components/VrBoxSettings"
import { VrOverlay } from "@/components/VrOverlay"
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet"

export default function PanoScreen({ back }: { back: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const engineRef = useRef<PanoEngine | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const [, force] = useState(0)
  const tick = () => force((n) => n + 1)
  const [ready, setReady] = useState(false)
  const [vrMode, setVrMode] = useState(false)
  const [linkMode, setLinkMode] = useState(false)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [toast, setToast] = useState<string | null>(null)

  useEffect(() => {
    if (!canvasRef.current) return
    const eng = new PanoEngine(canvasRef.current)
    eng.onVrChange = setVrMode
    eng.onScenesChange = tick
    eng.onSceneChange = tick
    eng.onPlaceHotspot = () => setPickerOpen(true)
    eng.onNeedSecondScene = () => { setLinkMode(false); showToast("Adicione outro ambiente para ligar.") }
    engineRef.current = eng
    setReady(true)
    return () => { eng.dispose(); engineRef.current = null }
  }, [])

  const showToast = (m: string) => { setToast(m); setTimeout(() => setToast(null), 2400) }
  const pick = () => fileRef.current?.click()
  const onFiles = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.length) engineRef.current?.addFiles(e.target.files)
    e.target.value = ""
  }
  const toggleLink = () => {
    const eng = engineRef.current; if (!eng) return
    if (!eng.getCurrentId()) return
    if (eng.getOtherScenes().length === 0) { showToast("Adicione outro ambiente para criar um portal."); return }
    const next = !linkMode; setLinkMode(next); eng.setLinkMode(next)
    if (next) showToast("Toque na parede/local para criar o hotspot →")
  }
  const commit = (target: number) => { engineRef.current?.commitHotspot(target); setPickerOpen(false); setLinkMode(false); tick() }

  const eng = engineRef.current
  const scenes = eng?.getScenes() ?? []
  const curId = eng?.getCurrentId() ?? null
  const others = eng?.getOtherScenes() ?? []
  const hasScenes = scenes.length > 0

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0">
      <canvas ref={canvasRef} className="fixed inset-0 block" style={{ touchAction: "none" }} />
      <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={onFiles} />

      {!vrMode && <TopBar title="Ambientes 360°" tag="360° · Tour · VR Box" onBack={back} />}

      {/* Estado vazio */}
      {ready && !hasScenes && (
        <div className="fixed inset-0 z-10 flex flex-col items-center justify-center px-8 text-center">
          <div className="mb-5 inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/15 text-primary ring-1 ring-primary/25">
            <Globe2 className="h-8 w-8" />
          </div>
          <h2 className="text-xl font-bold">Carregue fotos 360°</h2>
          <p className="mx-auto mt-2 max-w-xs text-sm text-muted-foreground">
            Imagens <b className="text-foreground">equiretangulares</b> (2:1). Não tem? Use o app grátis{" "}
            <b className="text-foreground">Google Street View</b> → modo <b className="text-foreground">Photo Sphere</b> no iPhone.
          </p>
          <Button size="lg" className="mt-6" onClick={pick}><Upload className="h-5 w-5" /> Carregar foto 360°</Button>
        </div>
      )}

      {/* Nome do ambiente atual */}
      {!vrMode && curId != null && (
        <div className="fixed left-1/2 top-16 z-10 -translate-x-1/2 rounded-full bg-black/50 px-4 py-1.5 text-xs font-semibold text-white safe-top">
          {eng?.getScene(curId)?.name}
        </div>
      )}

      {/* Painel inferior */}
      {hasScenes && !vrMode && (
        <motion.div
          initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }}
          className="glass fixed inset-x-0 bottom-0 z-20 flex flex-col gap-3 border-t border-border px-3 py-3 safe-bottom"
        >
          {/* miniaturas do tour */}
          <div className="flex gap-2 overflow-x-auto pb-1">
            {scenes.map((s) => (
              <div
                key={s.id}
                className={`relative h-14 w-24 shrink-0 cursor-pointer overflow-hidden rounded-lg border-2 ${s.id === curId ? "border-primary" : "border-transparent"}`}
                onClick={() => eng?.showScene(s.id)}
              >
                <img src={s.url} alt={s.name} className="h-full w-full object-cover" />
                <span className="absolute inset-x-0 bottom-0 truncate bg-black/55 px-1 text-[9px] text-white">{s.name}</span>
                <button
                  className="absolute right-0.5 top-0.5 grid h-4 w-4 place-items-center rounded-full bg-black/60 text-white"
                  onClick={(ev) => { ev.stopPropagation(); eng?.removeScene(s.id) }}
                ><X className="h-3 w-3" /></button>
              </div>
            ))}
            <button
              onClick={pick}
              className="grid h-14 w-14 shrink-0 place-items-center rounded-lg border-2 border-dashed border-border text-muted-foreground hover:text-foreground"
              aria-label="Adicionar ambiente"
            ><Plus className="h-5 w-5" /></button>
          </div>

          {/* ações */}
          <div className="flex items-center gap-2">
            <Button variant={linkMode ? "default" : "secondary"} onClick={toggleLink} className="shrink-0">
              <Link2 className="h-4 w-4" /> {linkMode ? "Toque no ponto…" : "Portal"}
            </Button>
            <VrBoxSettings engine={engineRef.current} />
            <Button className="flex-1" onClick={() => engineRef.current?.enterVR()}>
              <Glasses className="h-5 w-5" /> Entrar em VR
            </Button>
          </div>
        </motion.div>
      )}

      {/* Seletor de destino do hotspot */}
      <Sheet open={pickerOpen} onOpenChange={(o) => { setPickerOpen(o); if (!o) engineRef.current?.cancelHotspot() }}>
        <SheetContent side="bottom" className="mx-auto max-w-md">
          <SheetTitle className="mb-1 flex items-center gap-2"><Link2 className="h-4 w-4 text-primary" /> Este portal leva para…</SheetTitle>
          <p className="mb-3 text-xs text-muted-foreground">Escolha o ambiente de destino do hotspot.</p>
          <div className="flex flex-col gap-2">
            {others.map((o) => (
              <button
                key={o.id}
                onClick={() => commit(o.id)}
                className="flex items-center gap-3 rounded-lg border border-border bg-secondary/40 p-2 text-left hover:bg-secondary"
              >
                <img src={o.url} alt={o.name} className="h-12 w-20 rounded-md object-cover" />
                <span className="flex-1 text-sm font-medium">{o.name}</span>
                <Check className="h-4 w-4 text-primary" />
              </button>
            ))}
          </div>
        </SheetContent>
      </Sheet>

      {/* toast */}
      {toast && (
        <div className="fixed bottom-32 left-1/2 z-50 -translate-x-1/2 rounded-full bg-foreground px-4 py-2 text-xs font-semibold text-background shadow-lg">
          {toast}
        </div>
      )}

      <VrOverlay engine={engineRef.current} show={vrMode} onExit={() => engineRef.current?.exitVR()} />
    </motion.div>
  )
}
