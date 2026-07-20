import { useEffect, useState } from "react"
import { RotateCcw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Slider } from "@/components/ui/slider"
import { DEFAULT_SETTINGS, type VrSettings } from "@/engine/vrSettings"
import type { ImmersiveEngine } from "@/engine/ImmersiveEngine"

function Row({ label, value, suffix, min, max, step, onChange }: {
  label: string; value: number; suffix: string; min: number; max: number; step: number; onChange: (v: number) => void
}) {
  return (
    <div className="py-1.5">
      <div className="mb-1.5 flex items-center justify-between text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-semibold text-primary">{value}{suffix}</span>
      </div>
      <Slider value={[value]} min={min} max={max} step={step} onValueChange={(v) => onChange(v[0])} />
    </div>
  )
}

/** Sliders de ajuste do VR Box; atualizam o motor em TEMPO REAL. */
export function SettingsSliders({ engine, compact = false }: { engine: ImmersiveEngine | null; compact?: boolean }) {
  const [s, setS] = useState<VrSettings>(engine?.getSettings() ?? DEFAULT_SETTINGS)
  useEffect(() => { if (engine) setS(engine.getSettings()) }, [engine])

  const update = (patch: Partial<VrSettings>) => {
    const ns = { ...s, ...patch }; setS(ns); engine?.setSettings(ns)
  }

  return (
    <div>
      <Row label="Zoom / campo de visão" value={s.fov} suffix="°" min={45} max={100} step={1} onChange={(v) => update({ fov: v })} />
      <Row label="Tamanho dos quadros" value={s.size} suffix="%" min={40} max={100} step={2} onChange={(v) => update({ size: v })} />
      <Row label="Separação das telas" value={s.sep} suffix="px" min={0} max={140} step={2} onChange={(v) => update({ sep: v })} />
      <Row label="Profundidade 3D" value={s.eye} suffix="mm" min={0} max={120} step={2} onChange={(v) => update({ eye: v })} />
      {!compact && (
        <Button variant="outline" className="mt-2 w-full" onClick={() => update(DEFAULT_SETTINGS)}>
          <RotateCcw className="h-4 w-4" /> Restaurar padrão
        </Button>
      )}
    </div>
  )
}
