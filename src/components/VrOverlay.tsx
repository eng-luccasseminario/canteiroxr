import { useEffect, useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Settings2, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { SettingsSliders } from "@/components/SettingsSliders"
import type { ImmersiveEngine } from "@/engine/ImmersiveEngine"

// Overlay do modo VR: ajuste em tempo real (engrenagem), sair, linha central e dica.
// Enquanto o painel de ajuste está aberto, o "toque para sair" é desativado
// para não sair sem querer ao mexer nos sliders.
export function VrOverlay({ engine, show, onExit }: { engine: ImmersiveEngine | null; show: boolean; onExit: () => void }) {
  const [open, setOpen] = useState(false)
  const [hint, setHint] = useState(true)

  useEffect(() => {
    if (!show) { setOpen(false); setHint(true); return }
    setHint(true)
    const t = setTimeout(() => setHint(false), 3500)
    return () => clearTimeout(t)
  }, [show])

  if (!show) return null
  return (
    <>
      {/* toque em qualquer lugar para sair — só quando o ajuste está fechado */}
      {!open && <div className="fixed inset-0 z-40" onClick={onExit} role="button" aria-label="Sair do VR" />}

      {/* linha central (alinhar as lentes) */}
      <div className="pointer-events-none fixed inset-y-0 left-1/2 z-40 w-px -translate-x-1/2 bg-white/15" />

      {/* dica */}
      {!open && (
        <div
          className="pointer-events-none fixed left-1/2 top-3 z-40 -translate-x-1/2 rounded-full bg-black/60 px-4 py-2 text-center text-xs font-semibold text-white transition-opacity duration-700"
          style={{ opacity: hint ? 1 : 0 }}
        >
          Toque para sair · engrenagem p/ ajustar
        </div>
      )}

      {/* controles (sempre clicáveis, acima do toque-para-sair) */}
      <div className="fixed inset-x-0 bottom-0 z-50 flex flex-col items-center gap-2 p-3 safe-bottom">
        <AnimatePresence>
          {open && (
            <motion.div
              initial={{ y: 24, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 24, opacity: 0 }}
              className="glass w-[min(92vw,380px)] rounded-2xl border border-border p-4 shadow-2xl"
            >
              <div className="mb-2 flex items-center gap-2 text-sm font-bold">
                <Settings2 className="h-4 w-4 text-primary" /> Ajuste em tempo real
              </div>
              <SettingsSliders engine={engine} compact />
            </motion.div>
          )}
        </AnimatePresence>
        <div className="flex gap-2">
          <Button variant="secondary" size="sm" onClick={() => setOpen((o) => !o)}>
            <Settings2 className="h-4 w-4" /> {open ? "Fechar ajuste" : "Ajustar VR"}
          </Button>
          <Button variant="secondary" size="sm" onClick={onExit}>
            <X className="h-4 w-4" /> Sair
          </Button>
        </div>
      </div>
    </>
  )
}
