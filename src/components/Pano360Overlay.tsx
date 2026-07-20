import { useEffect, useRef, useState } from "react"
import { motion } from "framer-motion"
import { X, Glasses } from "lucide-react"
import { PanoEngine } from "@/engine/PanoEngine"
import { Button } from "@/components/ui/button"
import { VrBoxSettings } from "@/components/VrBoxSettings"
import { VrOverlay } from "@/components/VrOverlay"

// Abre uma foto 360 (de um pino) em tela cheia, com opção de VR Box.
export function Pano360Overlay({ pano, name, onClose }: { pano: Blob; name: string; onClose: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const engineRef = useRef<PanoEngine | null>(null)
  const [vrMode, setVrMode] = useState(false)

  useEffect(() => {
    if (!canvasRef.current) return
    const eng = new PanoEngine(canvasRef.current)
    eng.onVrChange = setVrMode
    eng.addFiles([new File([pano], name + ".jpg", { type: pano.type || "image/jpeg" })])
    engineRef.current = eng
    return () => { eng.dispose(); engineRef.current = null }
  }, [pano, name])

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[60] bg-black">
      <canvas ref={canvasRef} className="fixed inset-0 block" style={{ touchAction: "none" }} />

      {!vrMode && (
        <>
          <div className="glass fixed inset-x-0 top-0 z-20 flex items-center gap-3 border-b border-border px-3 py-2 safe-top">
            <Button variant="ghost" size="icon" onClick={onClose} aria-label="Fechar"><X className="h-5 w-5" /></Button>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-bold leading-tight">{name}</div>
              <div className="text-[11px] leading-tight text-muted-foreground">Ambiente 360°</div>
            </div>
          </div>
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
