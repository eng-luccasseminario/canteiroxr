import { Settings2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet"
import { SettingsSliders } from "@/components/SettingsSliders"
import type { ImmersiveEngine } from "@/engine/ImmersiveEngine"

export function VrBoxSettings({ engine }: { engine: ImmersiveEngine | null }) {
  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="secondary" size="icon" aria-label="Ajuste do VR Box">
          <Settings2 className="h-5 w-5" />
        </Button>
      </SheetTrigger>
      <SheetContent side="bottom" className="mx-auto max-w-md">
        <SheetTitle className="mb-1 flex items-center gap-2">
          <Settings2 className="h-4 w-4 text-primary" /> Ajuste do VR Box
        </SheetTitle>
        <p className="mb-3 text-xs text-muted-foreground">Configure para casar com as lentes do seu óculos. Fica salvo automaticamente. Dá para ajustar também dentro do VR.</p>
        <SettingsSliders engine={engine} />
      </SheetContent>
    </Sheet>
  )
}
