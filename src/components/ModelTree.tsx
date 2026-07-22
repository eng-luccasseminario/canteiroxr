import { useState } from "react"
import { Eye, EyeOff, ChevronDown, ChevronRight, Layers, ScanEye } from "lucide-react"
import type { TreeModel } from "@/engine/VrIfcEngine"
import { Slider } from "@/components/ui/slider"

type Props = {
  tree: TreeModel[]
  onModelVisible: (mi: number, v: boolean) => void
  onModelOpacity: (mi: number, op: number) => void
  onTypeVisible: (mi: number, type: string, v: boolean) => void
  onTypeOpacity: (mi: number, type: string, op: number) => void
}

// Árvore do modelo federado: DISCIPLINA (arquivo IFC) → CATEGORIA (tipo IFC).
// Cada nó tem alternar visibilidade e um controle de RAIO-X (opacidade).
export function ModelTree({ tree, onModelVisible, onModelOpacity, onTypeVisible, onTypeOpacity }: Props) {
  const [open, setOpen] = useState<Record<number, boolean>>(() => (tree.length === 1 ? { 0: true } : {} as Record<number, boolean>))

  if (!tree.length) return <p className="text-xs text-muted-foreground">Nenhum modelo carregado.</p>

  return (
    <div className="flex max-h-[62vh] flex-col gap-2 overflow-auto pr-0.5">
      {tree.map((m) => {
        const isOpen = open[m.index] ?? false
        return (
          <div key={m.index} className="rounded-xl border border-border bg-secondary/30">
            {/* disciplina (modelo) */}
            <div className="flex items-center gap-1.5 px-2 py-2">
              <button onClick={() => setOpen((o) => ({ ...o, [m.index]: !isOpen }))} className="grid h-6 w-6 shrink-0 place-items-center rounded text-muted-foreground hover:bg-secondary" aria-label="Expandir">
                {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
              </button>
              <Layers className="h-4 w-4 shrink-0 text-primary" />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold">{m.name}</div>
                <div className="text-[10px] text-muted-foreground">{m.count} elemento(s)</div>
              </div>
              <VisBtn on={m.visible} onClick={() => onModelVisible(m.index, !m.visible)} />
            </div>
            {/* raio-x da disciplina inteira */}
            <div className="flex items-center gap-2 px-3 pb-2">
              <ScanEye className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <Slider value={[m.opacity * 100]} min={10} max={100} step={5} onValueChange={(v) => onModelOpacity(m.index, v[0] / 100)} className="flex-1" />
              <span className="w-9 shrink-0 text-right text-[10px] tabular-nums text-muted-foreground">{Math.round(m.opacity * 100)}%</span>
            </div>

            {/* categorias (tipos IFC) */}
            {isOpen && (
              <div className="flex flex-col gap-1 border-t border-border px-2 py-2">
                {m.types.map((t) => (
                  <div key={t.type} className="rounded-lg px-1 py-1 hover:bg-secondary/50">
                    <div className="flex items-center gap-1.5">
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-xs font-medium">{t.label}</div>
                        <div className="text-[10px] text-muted-foreground">{t.count}× · {t.type.replace(/^IFC/, "")}</div>
                      </div>
                      <VisBtn on={t.visible} onClick={() => onTypeVisible(m.index, t.type, !t.visible)} small />
                    </div>
                    <div className="mt-1 flex items-center gap-2 pl-1">
                      <ScanEye className="h-3 w-3 shrink-0 text-muted-foreground/70" />
                      <Slider value={[t.opacity * 100]} min={10} max={100} step={5} onValueChange={(v) => onTypeOpacity(m.index, t.type, v[0] / 100)} className="flex-1" />
                      <span className="w-9 shrink-0 text-right text-[10px] tabular-nums text-muted-foreground">{Math.round(t.opacity * 100)}%</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

function VisBtn({ on, onClick, small }: { on: boolean; onClick: () => void; small?: boolean }) {
  const s = small ? "h-7 w-7" : "h-8 w-8"
  return (
    <button onClick={onClick} aria-label={on ? "Ocultar" : "Mostrar"} className={`grid ${s} shrink-0 place-items-center rounded-md ${on ? "text-foreground hover:bg-secondary" : "text-muted-foreground/50 hover:bg-secondary"}`}>
      {on ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
    </button>
  )
}
