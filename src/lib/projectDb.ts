// Persistência local (IndexedDB) dos projetos: modelo IFC + pinos 360 + vistas salvas.
// Blobs (IFC e fotos 360) são guardados direto no IndexedDB, sem servidor.

export interface SavedView {
  px: number; py: number; pz: number   // posição da câmera
  tx: number; ty: number; tz: number   // alvo (para onde olha)
}
export interface Pin {
  id: string
  name: string
  pos: [number, number, number]  // ponto no modelo onde o pino está fixado
  view: SavedView                // vista salva do modelo
  thumb: string                  // miniatura da vista (dataURL JPEG)
  pano: Blob                     // foto 360 equiretangular
}
export interface ModelRef {
  name: string                   // nome/disciplina do modelo (ex.: "Arquitetura")
  blob: Blob                     // arquivo IFC
}
export interface Annotation {
  color?: string                 // cor de pintura (hex "#ef4444") ou ausente
  note?: string                  // observação de texto
}
export interface Project {
  id: string
  name: string
  ifc: Blob                      // 1º modelo — mantido p/ compatibilidade com projetos antigos
  models?: ModelRef[]            // modelos federados (inclui o 1º). Ausente = [{ name, blob: ifc }]
  pins: Pin[]
  annotations?: Record<string, Annotation> // chave "modelIndex:expressID"
  updatedAt: number
}
export interface ProjectMeta {
  id: string; name: string; updatedAt: number; pinCount: number; modelCount: number; cover?: string
}

const DB = "canteiroxr"
const STORE = "projects"
const VER = 1

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, VER)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: "id" })
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

function tx<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(STORE, mode)
        const req = fn(t.objectStore(STORE))
        req.onsuccess = () => resolve(req.result)
        req.onerror = () => reject(req.error)
        // libera a conexão após a transação (evita lock ao abrir o banco no ar.html/iOS)
        t.oncomplete = () => db.close()
        t.onabort = () => db.close()
      })
  )
}

export function saveProject(p: Project): Promise<IDBValidKey> {
  p.updatedAt = Date.now()
  return tx("readwrite", (s) => s.put(p))
}
export function getProject(id: string): Promise<Project | undefined> {
  return tx<Project | undefined>("readonly", (s) => s.get(id) as IDBRequest<Project | undefined>)
}
export function deleteProject(id: string): Promise<undefined> {
  return tx<undefined>("readwrite", (s) => s.delete(id) as IDBRequest<undefined>)
}
/** renomeia um projeto salvo sem recarregar o modelo (lê, troca o nome, grava) */
export async function renameProject(id: string, name: string): Promise<void> {
  const p = await getProject(id); if (!p) return
  p.name = name.trim() || p.name
  await saveProject(p)
}
export async function listProjects(): Promise<ProjectMeta[]> {
  const all = await tx<Project[]>("readonly", (s) => s.getAll() as IDBRequest<Project[]>)
  return all
    .map((p) => ({
      id: p.id, name: p.name, updatedAt: p.updatedAt, pinCount: p.pins.length,
      modelCount: p.models?.length ?? 1, cover: p.pins[0]?.thumb,
    }))
    .sort((a, b) => b.updatedAt - a.updatedAt)
}
/** normaliza o projeto p/ a forma federada (compatível com projetos antigos de 1 IFC) */
export function projectModels(p: Project): ModelRef[] {
  if (p.models && p.models.length) return p.models
  return [{ name: p.name || "Modelo", blob: p.ifc }]
}

export function newId(): string {
  return (crypto as Crypto & { randomUUID?: () => string }).randomUUID?.() ?? "id-" + Date.now() + "-" + Math.floor(Math.random() * 1e6)
}
