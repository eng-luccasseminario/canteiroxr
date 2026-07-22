import { useEffect, useRef, useState } from "react"
import { motion } from "framer-motion"
import { X, Glasses, ChevronLeft, ChevronRight } from "lucide-react"
import { PanoEngine } from "@/engine/PanoEngine"
import { Button } from "@/components/ui/button"
import { VrBoxSettings } from "@/components/VrBoxSettings"
import { VrOverlay } from "@/components/VrOverlay"
import type { Pin } from "@/lib/projectDb"

// Abre as fotos 360 do projeto em tela cheia, com transição suave entre cenas
// (ícone "próxima visão") e opção de VR Box. Recebe TODOS os pinos p/ navegar.
export function Pano360Overlay({ pins, startId, onClose }: { pins: Pin[]; startId: string; onClose: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const engineRef = useRef<PanoEngine | null>(null)
  const [vrMode, setVrMode] = useState(false)
  const [name, setName] = useState("")
  const [idx, setIdx] = useState(0)
  const total = pins.length

  useEffect(() => {
    if (!canvasRef.current) return
    const eng = new PanoEngine(canvasRef.current)
    eng.onVrChange = setVrMode
    eng.onSceneChange = (id) => {
      const scenes = eng.getScenes()
      const i = scenes.findIndex((s) => s.id === id)
      if (i >= 0) { setIdx(i); setName(scenes[i].name) }
    }
    // carrega TODAS as fotos 360 do projeto (na ordem dos pinos)
    eng.addFiles(pins.map((p) => new File([p.pano], p.name + ".jpg", { type: p.pano.type || "image/jpeg" })))
    // começa na cena do pino clicado
    const startIndex = Math.max(0, pins.findIndex((p) => p.id === startId))
    const scenes = eng.getScenes()
    if (scenes[startIndex]) eng.showScene(scenes[startIndex].id)
    engineRef.current = eng
    return () => { eng.dispose(); engineRef.current = null }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const go = (dir: number) => engineRef.current?.nextScene(dir)

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[60] bg-black">
      <canvas ref={canvasRef} className="fixed inset-0 block" style={{ touchAction: "none" }} />

      {!vrMode && (
        <>
          <div className="glass fixed inset-x-0 top-0 z-20 flex items-center gap-3 border-b border-border px-3 py-2 safe-top">
            <Button variant="ghost" size="icon" onClick={onClose} aria-label="Fechar"><X className="h-5 w-5" /></Button>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-bold leading-tight">{name}</div>
              <div className="text-[11px] leading-tight text-muted-foreground">Ambiente 360°{total > 1 ? ` · ${idx + 1}/${total}` : ""}</div>
            </div>
          </div>

          {/* setas "próxima / anterior visão" — só quando há +1 cena 360 */}
          {total > 1 && (
            <>
              <button
                onClick={() => go(-1)} aria-label="Visão anterior"
                className="glass fixed left-3 top-1/2 z-20 grid h-12 w-12 -translate-y-1/2 place-items-center rounded-full border border-border text-foreground shadow-lg active:scale-95"
              ><ChevronLeft className="h-6 w-6" /></button>
              <button
                onClick={() => go(1)} aria-label="Próxima visão"
                className="glass fixed right-3 top-1/2 z-20 grid h-12 w-12 -translate-y-1/2 place-items-center rounded-full border border-border text-foreground shadow-lg active:scale-95"
              ><ChevronRight className="h-6 w-6" /></button>
            </>
          )}

          <motion.div
            initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }}
            className="glass fixed inset-x-0 bottom-0 z-20 flex items-center justify-center gap-2 border-t border-border px-4 py-3 safe-bottom"
          >
            <VrBoxSettings engine={engineRef.current} />
            <Button className="flex-1 max-w-xs" onClick={() => engineRef.current?.enterVR()}>
              <Glasses className="h-5 w-5" /> Ver 360° em RV
            </Button>
          </motion.div>
        </>
      )}

      <VrOverlay engine={engineRef.current} show={vrMode} onExit={() => engineRef.current?.exitVR()} />
    </motion.div>
  )
}
