import { motion } from "framer-motion"
import { Building2, Globe2, ChevronRight } from "lucide-react"
import type { Screen } from "@/App"
import { Card } from "@/components/ui/card"
import { FullscreenButton } from "@/components/FullscreenButton"

const modes = [
  {
    id: "project" as Screen,
    icon: Building2,
    tag: "IFC · Pinos 360 · RV",
    title: "Projeto BIM + 360°",
    desc: "Carregue o modelo .ifc, fixe pinos de fotos 360° em pontos do projeto e entre em RV pelo modelo ou pelo 360°.",
    accent: "from-blue-500/20 to-blue-600/5",
  },
  {
    id: "pano" as Screen,
    icon: Globe2,
    tag: "360° · Tour",
    title: "Ambientes 360°",
    desc: "Suba fotos 360° dos ambientes, navegue entre eles por hotspots e veja tudo imersivo no VR Box.",
    accent: "from-cyan-500/20 to-cyan-600/5",
  },
]

export default function Home({ go }: { go: (s: Screen) => void }) {
  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 flex flex-col items-center justify-center px-6 no-select overflow-y-auto"
    >
      {/* brilho de fundo */}
      <div className="pointer-events-none absolute -top-40 left-1/2 h-96 w-96 -translate-x-1/2 rounded-full bg-primary/20 blur-[120px]" />

      {/* tela cheia */}
      <div className="absolute right-3 top-3 z-20 safe-top">
        <FullscreenButton variant="secondary" />
      </div>

      <motion.div
        initial={{ y: 16, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.05 }}
        className="relative z-10 mb-10 text-center safe-top"
      >
        <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-border bg-secondary/40 px-3 py-1 text-xs font-medium text-muted-foreground">
          <Building2 className="h-3.5 w-3.5 text-primary" /> Engenharia Civil · RA/RV
        </div>
        <h1 className="text-4xl font-extrabold tracking-tight sm:text-5xl">
          Canteiro<span className="text-primary">XR</span>
        </h1>
        <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-muted-foreground">
          Visualize seus projetos em <b className="text-foreground">Realidade Virtual</b> e{" "}
          <b className="text-foreground">360°</b> direto do celular, com VR Box.
        </p>
      </motion.div>

      <div className="relative z-10 grid w-full max-w-2xl gap-4 sm:grid-cols-2">
        {modes.map((m, i) => (
          <motion.button
            key={m.id}
            onClick={() => go(m.id)}
            initial={{ y: 24, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.12 + i * 0.08 }}
            whileHover={{ y: -4 }} whileTap={{ scale: 0.98 }}
            className="text-left"
          >
            <Card className={`group relative h-full overflow-hidden bg-gradient-to-br ${m.accent} p-6`}>
              <div className="mb-5 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-primary/15 text-primary ring-1 ring-primary/25">
                <m.icon className="h-6 w-6" />
              </div>
              <div className="mb-1 text-xs font-semibold uppercase tracking-wider text-primary">{m.tag}</div>
              <div className="mb-2 text-xl font-bold">{m.title}</div>
              <p className="text-sm leading-relaxed text-muted-foreground">{m.desc}</p>
              <div className="mt-5 inline-flex items-center gap-1 text-sm font-semibold text-primary">
                Abrir <ChevronRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
              </div>
            </Card>
          </motion.button>
        ))}
      </div>

      <motion.p
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.4 }}
        className="relative z-10 mt-10 max-w-md text-center text-xs text-muted-foreground safe-bottom"
      >
        💡 No iPhone, gire o aparelho para a horizontal e encaixe no VR Box. O giroscópio é ativado ao entrar em VR.
      </motion.p>
    </motion.div>
  )
}
