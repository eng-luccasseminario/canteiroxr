import { useState } from "react"
import { AnimatePresence } from "framer-motion"
import Home from "@/screens/Home"
import ProjectScreen from "@/screens/ProjectScreen"
import PanoScreen from "@/screens/PanoScreen"

export type Screen = "home" | "project" | "pano"

export default function App() {
  const [screen, setScreen] = useState<Screen>("home")
  return (
    <AnimatePresence mode="wait">
      {screen === "home" && <Home key="home" go={setScreen} />}
      {screen === "project" && <ProjectScreen key="project" back={() => setScreen("home")} />}
      {screen === "pano" && <PanoScreen key="pano" back={() => setScreen("home")} />}
    </AnimatePresence>
  )
}
