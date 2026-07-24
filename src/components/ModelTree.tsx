import { useState } from "react"
import { Eye, EyeOff, ChevronDown, ChevronRight, Layers, ScanEye, Mountain, Building2, FolderOpen } from "lucide-react"
import type { TreeModel, TreeNode } from "@/engine/VrIfcEngine"
import { Slider } from "@/components/ui/slider"

type Props = {
  tree: TreeModel[]
  onModelVisible: (mi: number, v: boolean) => void
  onModelOpacity: (mi: number, op: number) => void
  onNodeVisible: (key: string, v: boolean) => void
  onNodeOpacity: (key: string, op: number) => void
}

// Árvore espacial da norma: Obra (disciplina/arquivo) → Terreno (IfcSite) →
// Edificação (IfcBuilding) → Pavimento (IfcBuildingStorey) → Categoria.
// Visibilidade em todos os níveis; raio-X (opacidade) na obra, pavimento e categoria.
export function ModelTree({ tree, onModelVisible, onModelOpacity, onNodeVisible, onNodeOpacity }: Props) {
  const [open, setOpen] = useState<Record<string, boolean>>({})
  const isOpen = (k: string, def = false) => open[k] ?? def
  const toggle = (k: string) => setOpen((o) => ({ ...o, [k]: !isOpen(k) }))

  if (!tree.length) return <p className="text-xs text-muted-foreground">Nenhum modelo carregado.</p>

  return (
    <div className="flex max-h-[62vh] flex-col gap-2 overflow-auto pr-0.5">
      {tree.map((m) => {
        const mk = `m${m.index}`
        const mOpen = isOpen(mk, tree.length === 1)
        return (
          <div key={m.index} className="rounded-xl border border-border bg-secondary/30">
            {/* obra / disciplina (arquivo IFC) */}
            <div className="flex items-center gap-1.5 px-2 py-2">
              <button onClick={() => toggle(mk)} className="grid h-6 w-6 shrink-0 place-items-center rounded text-muted-foreground hover:bg-secondary" aria-label="Expandir">
                {mOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
              </button>
              <Layers className="h-4 w-4 shrink-0 text-primary" />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold">{m.name}</div>
                <div className="text-[10px] text-muted-foreground">{m.count} elemento(s)</div>
              </div>
              <VisBtn on={m.visible} onClick={() => onModelVisible(m.index, !m.visible)} />
            </div>
            {/* raio-x da obra inteira */}
            <div className="flex items-center gap-2 px-3 pb-2">
              <ScanEye className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <Slider value={[m.opacity * 100]} min={10} max={100} step={5} onValueChange={(v) => onModelOpacity(m.index, v[0] / 100)} className="flex-1" />
              <span className="w-9 shrink-0 text-right text-[10px] tabular-nums text-muted-foreground">{Math.round(m.opacity * 100)}%</span>
            </div>

            {mOpen && (
              <div className="flex flex-col border-t border-border px-1 py-1.5">
                {m.nodes.map((n) => (
                  <NodeRow key={n.key} node={n} depth={0} isOpen={isOpen} toggle={toggle} onNodeVisible={onNodeVisible} onNodeOpacity={onNodeOpacity} />
                ))}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

const KIND_ICON: Record<TreeNode["kind"], typeof Mountain | null> = {
  site: Mountain, building: Building2, storey: Layers, group: FolderOpen, category: null,
}

function NodeRow({ node, depth, isOpen, toggle, onNodeVisible, onNodeOpacity }: {
  node: TreeNode; depth: number
  isOpen: (k: string, def?: boolean) => boolean; toggle: (k: string) => void
  onNodeVisible: (key: string, v: boolean) => void; onNodeOpacity: (key: string, op: number) => void
}) {
  const Icon = KIND_ICON[node.kind]
  const hasKids = node.children.length > 0
  const openNow = isOpen(node.key, node.kind !== "category" && depth < 2)
  const showSlider = node.kind === "storey" || node.kind === "category"
  return (
    <div style={{ paddingLeft: depth * 12 }}>
      <div className="rounded-lg px-1 py-1 hover:bg-secondary/50">
        <div className="flex items-center gap-1.5">
          {hasKids ? (
            <button onClick={() => toggle(node.key)} className="grid h-5 w-5 shrink-0 place-items-center rounded text-muted-foreground hover:bg-secondary" aria-label="Expandir">
              {openNow ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
            </button>
          ) : <div className="h-5 w-5 shrink-0" />}
          {Icon && <Icon className="h-3.5 w-3.5 shrink-0 text-primary/80" />}
          <div className="min-w-0 flex-1">
            <div className="truncate text-xs font-medium">{node.label}</div>
            <div className="text-[10px] text-muted-foreground">{node.sub ?? `${node.count} elemento(s)`}</div>
          </div>
          <VisBtn on={node.visible} onClick={() => onNodeVisible(node.key, !node.visible)} small />
        </div>
        {showSlider && (
          <div className="mt-1 flex items-center gap-2 pl-6">
            <ScanEye className="h-3 w-3 shrink-0 text-muted-foreground/70" />
            <Slider value={[node.opacity * 100]} min={10} max={100} step={5} onValueChange={(v) => onNodeOpacity(node.key, v[0] / 100)} className="flex-1" />
            <span className="w-9 shrink-0 text-right text-[10px] tabular-nums text-muted-foreground">{Math.round(node.opacity * 100)}%</span>
          </div>
        )}
      </div>
      {hasKids && openNow && node.children.map((c) => (
        <NodeRow key={c.key} node={c} depth={depth + 1} isOpen={isOpen} toggle={toggle} onNodeVisible={onNodeVisible} onNodeOpacity={onNodeOpacity} />
      ))}
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
