// Ajustes do VR Box, persistidos em localStorage e compartilhados entre os modos VR e 360.
export interface VrSettings {
  fov: number  // campo de visão / zoom (graus)
  size: number // tamanho de cada quadro (% da metade da tela) — encolhe centralizando
  sep: number  // separação horizontal das telas (px por olho) — casa com as lentes
  eye: number  // distância entre os olhos / profundidade 3D (mm)
}

export const DEFAULT_SETTINGS: VrSettings = { fov: 72, size: 100, sep: 0, eye: 64 }

const KEY = "canteiroxr.vrbox"

export function loadSettings(): VrSettings {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) }
  } catch { /* ignora */ }
  return { ...DEFAULT_SETTINGS }
}

export function saveSettings(s: VrSettings) {
  try { localStorage.setItem(KEY, JSON.stringify(s)) } catch { /* ignora */ }
}
