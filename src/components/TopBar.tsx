import { ArrowLeft } from "lucide-react"
import { Button } from "@/components/ui/button"
import { FullscreenButton } from "@/components/FullscreenButton"

export function TopBar({ title, tag, onBack }: { title: string; tag?: string; onBack: () => void }) {
  return (
    <div className="glass fixed inset-x-0 top-0 z-20 flex items-center gap-3 border-b border-border px-3 py-2 safe-top">
      <Button variant="ghost" size="icon" onClick={onBack} aria-label="Voltar">
        <ArrowLeft className="h-5 w-5" />
      </Button>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-bold leading-tight">{title}</div>
        {tag && <div className="truncate text-[11px] leading-tight text-muted-foreground">{tag}</div>}
      </div>
      <FullscreenButton />
    </div>
  )
}
