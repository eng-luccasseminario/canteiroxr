import { useEffect, useState } from "react"
import { motion } from "framer-motion"
import { X, Info, Palette, StickyNote, EyeOff, Focus, Loader2 } from "lucide-react"
import type { ElementInfo } from "@/engine/VrIfcEngine"
import type { Annotation } from "@/lib/projectDb"
import { Button } from "@/components/ui/button"

// cores de pintura (raio-X / marcação de pendências)
export const PAINT_COLORS = ["#ef4444", "#f59e0b", "#22c55e", "#3b82f6", "#a855f7", "#ec4899"]

type Props = {
  info: ElementInfo | null
  loading: boolean
  annotation: Annotation
  onColor: (color: string | null) => void
  onNote: (note: string) => void
  onHide: () => void
  onIsolate: () => void
  onClose: () => void
}

// Painel discreto (canto inferior direito) com os ATRIBUTOS do elemento selecionado
// + anotação (nota de texto e cor de pintura). Não cobre o centro do modelo.
export function ElementInfoPanel({ info, loading, annotation, onColor, onNote, onHide, onIsolate, onClose }: Props) {
  const [note, setNote] = useState(annotation.note ?? "")
  useEffect(() => { setNote(annotation.note ?? "") }, [info?.gid])

  const commitNote = () => { if ((note.trim() || "") !== (annotation.note ?? "")) onNote(note.trim()) }

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 12 }}
      className="glass fixed right-2 z-30 flex w-[min(92vw,340px)] flex-col rounded-2xl border border-border shadow-2xl"
      style={{ bottom: "calc(88px + env(safe-area-inset-bottom))", maxHeight: "48vh" }}
    >
      {/* cabeçalho */}
      <div className="flex items-center gap-2 border-b border-border px-3 py-2">
        <Info className="h-4 w-4 shrink-0 text-primary" />
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-bold">{info?.name || info?.typeLabel || "Elemento"}</div>
          <div className="truncate text-[11px] text-muted-foreground">{info ? `${info.typeLabel} · ${info.modelName}` : "carregando…"}</div>
        </div>
        <button onClick={onClose} aria-label="Fechar" className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-secondary"><X className="h-4 w-4" /></button>
      </div>

      <div className="flex flex-col gap-3 overflow-auto px-3 py-3">
        {/* ações rápidas */}
        <div className="flex gap-1.5">
          <Button size="sm" variant="secondary" className="flex-1" onClick={onHide}><EyeOff className="h-4 w-4" /> Ocultar</Button>
          <Button size="sm" variant="secondary" className="flex-1" onClick={onIsolate}><Focus className="h-4 w-4" /> Isolar</Button>
        </div>

        {/* pintar de uma cor */}
        <div>
          <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold text-muted-foreground"><Palette className="h-3.5 w-3.5" /> Pintar elemento</div>
          <div className="flex flex-wrap items-center gap-1.5">
            {PAINT_COLORS.map((c) => (
              <button
                key={c} onClick={() => onColor(annotation.color === c ? null : c)}
                aria-label={`Pintar ${c}`}
                className={`h-7 w-7 rounded-full border-2 transition-transform hover:scale-110 ${annotation.color === c ? "border-foreground ring-2 ring-primary" : "border-white/30"}`}
                style={{ background: c }}
              />
            ))}
            {annotation.color && (
              <button onClick={() => onColor(null)} className="ml-1 rounded-md px-2 py-1 text-[11px] text-muted-foreground hover:bg-secondary">limpar</button>
            )}
          </div>
        </div>

        {/* nota / observação */}
        <div>
          <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold text-muted-foreground"><StickyNote className="h-3.5 w-3.5" /> Observação</div>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            onBlur={commitNote}
            placeholder="Anote uma pendência, revisão, interferência…"
            rows={2}
            className="w-full resize-none rounded-lg border border-border bg-secondary/40 px-2.5 py-2 text-xs focus:border-primary focus:outline-none"
          />
        </div>

        {/* atributos */}
        <div>
          <div className="mb-1 text-[11px] font-semibold text-muted-foreground">Atributos</div>
          {loading && !info ? (
            <div className="flex items-center gap-2 py-2 text-xs text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> lendo propriedades…</div>
          ) : (
            <div className="flex flex-col gap-2 text-xs">
              {info?.globalId && <Row k="GlobalId" v={info.globalId} mono />}
              {info?.attrs.map(([k, v]) => <Row key={k} k={k} v={v} />)}
              {info?.psets.map((ps) => (
                <div key={ps.name} className="rounded-lg border border-border bg-secondary/30 p-2">
                  <div className="mb-1 truncate text-[11px] font-semibold text-primary">{ps.name}</div>
                  <div className="flex flex-col gap-0.5">
                    {ps.props.map(([k, v]) => <Row key={k} k={k} v={v} />)}
                  </div>
                </div>
              ))}
              {info && !info.attrs.length && !info.psets.length && !info.globalId && (
                <div className="text-[11px] text-muted-foreground">Sem atributos adicionais neste elemento.</div>
              )}
            </div>
          )}
        </div>
      </div>
    </motion.div>
  )
}

function Row({ k, v, mono }: { k: string; v: string; mono?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <span className="shrink-0 text-muted-foreground">{k}</span>
      <span className={`min-w-0 flex-1 break-words text-right font-medium ${mono ? "font-mono text-[10px]" : ""}`}>{v || "—"}</span>
    </div>
  )
}
