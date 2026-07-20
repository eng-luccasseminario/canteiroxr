import { useEffect, useState } from "react"
import { Maximize, Minimize, Share, Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet"

function fsSupported(): boolean {
  const el = document.documentElement as HTMLElement & { webkitRequestFullscreen?: () => Promise<void> }
  return !!(document.fullscreenEnabled && (el.requestFullscreen || el.webkitRequestFullscreen))
}
function isStandalone(): boolean {
  return window.matchMedia?.("(display-mode: standalone)").matches ||
    (navigator as unknown as { standalone?: boolean }).standalone === true
}

export function FullscreenButton({ variant = "ghost" }: { variant?: "ghost" | "secondary" }) {
  const [isFs, setIsFs] = useState(false)
  const [help, setHelp] = useState(false)

  useEffect(() => {
    const on = () => setIsFs(!!document.fullscreenElement)
    document.addEventListener("fullscreenchange", on)
    return () => document.removeEventListener("fullscreenchange", on)
  }, [])

  if (isStandalone()) return null // já roda em tela cheia (app na tela de início)

  const toggle = async () => {
    if (fsSupported()) {
      const el = document.documentElement as HTMLElement & { webkitRequestFullscreen?: () => Promise<void> }
      try {
        if (document.fullscreenElement) await document.exitFullscreen?.()
        else await (el.requestFullscreen?.({ navigationUI: "hide" }) ?? el.webkitRequestFullscreen?.())
      } catch { /* ignora */ }
    } else {
      setHelp(true) // iPhone/Safari: não suporta fullscreen de página → instrui Add to Home Screen
    }
  }

  return (
    <>
      <Button variant={variant} size="icon" onClick={toggle} aria-label="Tela cheia">
        {isFs ? <Minimize className="h-5 w-5" /> : <Maximize className="h-5 w-5" />}
      </Button>

      <Sheet open={help} onOpenChange={setHelp}>
        <SheetContent side="bottom" className="mx-auto max-w-md">
          <SheetTitle className="mb-1">📱 Tela cheia no iPhone</SheetTitle>
          <p className="mb-3 text-xs text-muted-foreground">
            O Safari não deixa uma página ficar em tela cheia. Para tirar a barra do navegador de vez, instale o app na tela de início:
          </p>
          <ol className="space-y-2 text-sm">
            <li className="flex items-center gap-2">
              <span className="grid h-6 w-6 place-items-center rounded-full bg-primary/20 text-xs font-bold text-primary">1</span>
              Toque em <Share className="h-4 w-4 text-primary" /> <b>Compartilhar</b> (barra do Safari)
            </li>
            <li className="flex items-center gap-2">
              <span className="grid h-6 w-6 place-items-center rounded-full bg-primary/20 text-xs font-bold text-primary">2</span>
              <b>Adicionar à Tela de Início</b> <Plus className="h-4 w-4 text-primary" />
            </li>
            <li className="flex items-center gap-2">
              <span className="grid h-6 w-6 place-items-center rounded-full bg-primary/20 text-xs font-bold text-primary">3</span>
              Abra o <b>CanteiroXR</b> pelo ícone → abre <b>sem</b> a barra (tela cheia)
            </li>
          </ol>
        </SheetContent>
      </Sheet>
    </>
  )
}
