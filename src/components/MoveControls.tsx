import { useEffect, type PointerEvent as ReactPointerEvent } from "react"
import { ArrowUp, ArrowDown, ArrowLeft, ArrowRight, ChevronsUp, ChevronsDown, RotateCcw, RotateCw } from "lucide-react"
import type { VrIfcEngine } from "@/engine/VrIfcEngine"

// Setas de locomoção no modelo (estilo analógico): segurar = anda, soltar = para.
export function MoveControls({ engine }: { engine: VrIfcEngine | null }) {
  useEffect(() => {
    const stop = () => engine?.stopMove()
    window.addEventListener("pointerup", stop)
    window.addEventListener("pointercancel", stop)
    return () => { window.removeEventListener("pointerup", stop); window.removeEventListener("pointercancel", stop) }
  }, [engine])

  const cls = "glass grid h-11 w-11 place-items-center rounded-xl border border-border text-foreground active:bg-primary active:text-primary-foreground touch-none select-none"
  const hold = (fn: () => void) => ({
    onPointerDown: (e: ReactPointerEvent) => { e.preventDefault(); e.stopPropagation(); fn() },
  })

  const topPos = { top: "calc(64px + env(safe-area-inset-top))" }
  return (
    <>
      {/* D-pad: frente/trás/lados (topo esquerdo) */}
      <div className="fixed left-3 z-20 select-none" style={topPos}>
        <div className="flex justify-center">
          <button className={cls} {...hold(() => engine?.setForward(1))} aria-label="Frente"><ArrowUp className="h-5 w-5" /></button>
        </div>
        <div className="my-1 flex gap-1">
          <button className={cls} {...hold(() => engine?.setRight(-1))} aria-label="Esquerda"><ArrowLeft className="h-5 w-5" /></button>
          <div className="h-11 w-11" />
          <button className={cls} {...hold(() => engine?.setRight(1))} aria-label="Direita"><ArrowRight className="h-5 w-5" /></button>
        </div>
        <div className="flex justify-center">
          <button className={cls} {...hold(() => engine?.setForward(-1))} aria-label="Trás"><ArrowDown className="h-5 w-5" /></button>
        </div>
      </div>

      {/* Subir / descer + girar a vista (topo direito) */}
      <div className="fixed right-3 z-20 flex flex-col gap-1 select-none" style={topPos}>
        <button className={cls} {...hold(() => engine?.setUp(1))} aria-label="Subir"><ChevronsUp className="h-5 w-5" /></button>
        <button className={cls} {...hold(() => engine?.setUp(-1))} aria-label="Descer"><ChevronsDown className="h-5 w-5" /></button>
        <div className="mt-1 flex gap-1">
          <button className={cls} {...hold(() => engine?.setRotate(1))} aria-label="Girar vista à esquerda"><RotateCcw className="h-5 w-5" /></button>
          <button className={cls} {...hold(() => engine?.setRotate(-1))} aria-label="Girar vista à direita"><RotateCw className="h-5 w-5" /></button>
        </div>
      </div>
    </>
  )
}
