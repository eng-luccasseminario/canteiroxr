# CanteiroXR

**Webapp de Realidade Aumentada (RA), Realidade Virtual (RV) e ambientes 360° para engenharia civil.**
Carregue um modelo **BIM/IFC**, navegue e inspecione os elementos, fixe **fotos 360°** em pontos do
projeto, entre no modelo em **RV** (VR Box, sem app), e ancore o projeto no mundo real em **escala 1:1**
com um **marcador A4 (RA)** — tudo direto do navegador do celular, sem loja de apps.

> Stack: **Vite · React · TypeScript · Tailwind CSS · shadcn/ui (Radix) · framer-motion · lucide-react · three.js · web-ifc · AR.js/A-Frame**.
> Roda 100% no cliente (sem back-end): os projetos ficam salvos localmente no navegador (**IndexedDB**).

---

## ✨ Funcionalidades

- **Projeto BIM + 360°** — carrega `.ifc` (via [web-ifc](https://github.com/ThatOpen/engine_web-ifc)), 1 mesh por elemento:
  - Navegação em 1ª pessoa — **WASD** (PC) / setas na tela (celular) + órbita (arraste); **←/→** giram a vista
  - **Selecionar / Ocultar / Isolar** elementos e ver os **atributos** do elemento clicado
  - **Modelo federado**: sobe **vários IFC** (compatibilização) no mesmo projeto
  - **Árvore do modelo** por disciplina/categoria + **raio-X** (opacidade por grupo)
  - **Anotações**: pinta o elemento de uma cor e adiciona uma **observação** (marcador “!” clicável)
  - **Exportar CSV** de todos os ativos (nome, categoria, fabricante, código, valor, validade, O&M, observação)
  - **Pinos 360°**: anexa fotos equiretangulares em pontos do modelo (tour com transição suave entre cenas)
  - **Modo RV** (VR Box) a partir de qualquer ponto de observação
  - **Modo RA**: fixa uma folha **A4 vertical em escala real (1:1)** numa parede e ancora o projeto no marcador
- **Ambientes 360°** — tour de fotos 360° equiretangulares com hotspots e **VR Box**
- **VR Box estereoscópico** — tela dividida + giroscópio (não usa WebXR; funciona no Safari do iPhone)
- **Persistência local** — projetos (IFC + pinos + âncora + anotações) salvos em IndexedDB, sem servidor

---

## ✅ Pré-requisitos

- **[Node.js](https://nodejs.org/) 18+** (recomendado 20/22) e **npm 9+**
- Um navegador moderno. Para **RV/RA no celular** é preciso **HTTPS** (giroscópio e câmera só
  funcionam em contexto seguro) — use o deploy na Vercel ou um túnel (ex.: `cloudflared`).

---

## ⬇️ Como clonar

```bash
git clone https://github.com/eng-luccasseminario/canteiroxr.git
cd canteiroxr
```

---

## 🤖 Clonar com um agente de IA (Google Antigravity) — sem digitar comandos

Se você usa uma IDE com agente (ex.: **Google Antigravity**), **não precisa** rodar os comandos à mão.
Abra a pasta onde quer o projeto e **cole este prompt** no agente:

```text
Clone o repositório https://github.com/eng-luccasseminario/canteiroxr.git para esta pasta,
entre no projeto e instale TODAS as dependências (npm install).
Em seguida, rode o app em modo desenvolvimento na PORTA 3000.
Se a porta 3000 já estiver ocupada por outro processo, ENCERRE esse processo
e suba este projeto novo no lugar, também na porta 3000.
Ao terminar, me diga a URL local (http://localhost:3000) para eu abrir no navegador.
```

O agente vai clonar, instalar as bibliotecas e deixar o app rodando em **http://localhost:3000**.
Depois, é só pedir mudanças por prompt (cores, textos, novas funções etc.).

> 📘 Guia visual completo (criar conta no Antigravity, conectar, onde colar o prompt, gerar renders
> hiper-realistas com IA e converter em 360°): veja a apostila **“Como Clonar o App e Personalizar”**.

---

## 🛠️ Instalação

1. Instale as dependências:
   ```bash
   npm install
   ```
   **Resultado esperado:** pasta `node_modules/` criada, sem erros.

> **Configuração (.env):** este projeto **não usa variáveis de ambiente** nem chaves de API —
> não há back-end. Nada a configurar.

---

## ▶️ Como rodar / usar

1. Suba o servidor de desenvolvimento:
   ```bash
   npm run dev
   ```
   **Resultado esperado:** `Local: http://localhost:3000/` (porta fixada em 3000).

2. Abra `http://localhost:3000` e escolha um modo:

| Ação | Onde | O que faz |
|---|---|---|
| **Carregar exemplo** | Projeto BIM + 360° | Abre a casa de demonstração já com 2 pinos 360° (suíte e sala) |
| **Carregar IFC** | Projeto BIM + 360° | Sobe seu modelo `.ifc` |
| **Setas (topo)** | Projeto | Anda no modelo (frente/trás/lados, subir/descer) |
| **Toque num elemento** | Projeto | Seleciona → **Ocultar / Isolar / Mostrar tudo** |
| **Pino 360** | Projeto | Toca num ponto → anexa foto 360° → vira um portal clicável |
| **RA** | Projeto | Toca numa parede → folha A4 1:1 → imprime o marcador → abre a câmera |
| **VR** | Projeto / 360° | Tela dividida + giroscópio para VR Box |

3. **Teste no celular (RV/RA):** faça o build e sirva por **HTTPS** (Vercel ou túnel). No iOS, use
   **Compartilhar → Adicionar à Tela de Início** para rodar em tela cheia.

---

## 📜 Comandos disponíveis

| Comando | Descrição |
|---|---|
| `npm run dev` | Servidor de desenvolvimento (HMR) em `http://localhost:3000` (porta 3000) |
| `npm run build` | Type-check (`tsc -b`) + build de produção em `dist/` |
| `npm run preview` | Serve o build de `dist/` localmente |
| `npm run lint` | Análise estática com Oxlint |

---

## 🗂️ Estrutura do projeto

```
canteiroxr/
├── index.html                 # entrada da SPA
├── public/
│   ├── ar.html                # visualizador de RA (AR.js/A-Frame) — página isolada
│   ├── marcador-a4.html       # folha A4 imprimível com o marcador Hiro
│   ├── manifest.webmanifest   # PWA (tela cheia via "Adicionar à Tela de Início")
│   └── samples/               # ativos de demonstração (casa IFC + 360°)
├── src/
│   ├── engine/                # motores three.js (imperativo)
│   │   ├── ImmersiveEngine.ts # base: renderer + StereoCamera + giroscópio + fullscreen
│   │   ├── VrIfcEngine.ts      # modelo IFC: seleção, pinos, âncora RA, movimento
│   │   ├── PanoEngine.ts       # esfera 360° + tour (hotspots)
│   │   └── vrSettings.ts       # ajustes do VR Box (persistidos)
│   ├── components/            # UI (shadcn/ui + controles)
│   │   ├── ui/                 # button, slider, card, sheet
│   │   ├── TopBar / MoveControls / VrOverlay / VrBoxSettings / ...
│   ├── screens/              # telas: Home, ProjectScreen, PanoScreen
│   ├── lib/                  # projectDb.ts (IndexedDB), utils.ts
│   └── App.tsx               # roteamento por estado
├── tailwind.config.js
└── vite.config.ts
```

---

## 🖼️ Telas do sistema

> Prints em `docs/screenshots/`. Como o app é fortemente 3D/imersivo e voltado para o celular,
> as telas de RV/RA são melhores vistas ao vivo no dispositivo.

- **Home** — seleção entre **Projeto BIM + 360°** e **Ambientes 360°**.
- **Projeto BIM** — modelo IFC com setas de locomoção (topo), painel de ações (baixo), barra de
  seleção (ocultar/isolar) e pinos 360°.
- **Modo RA** — folha A4 vertical em escala real sobre a parede + cota do chão até a altura.
- **Modo 360° / RV** — esfera equiretangular e a tela dividida do VR Box.

---

## 🩺 Solução de problemas

| Problema | Causa / Solução |
|---|---|
| Giroscópio/câmera não ligam no iPhone | Exigem **HTTPS**. Rode via Vercel ou túnel (`cloudflared`), não por `http://`. |
| Barra do Safari não some (não fica em tela cheia) | iOS não permite fullscreen de página. Use **Adicionar à Tela de Início** (roda standalone). |
| Modelo grande travando | Modelos muito grandes pesam (1 mesh por elemento). Prefira modelos otimizados. |
| RA fora de escala | Ajuste **Escala** e **Girar/Parede-chão** na tela da câmera — a calibração 1:1 fica salva. |
| `Blocked request... allowedHosts` no túnel | Sirva o **build** (`npm run build` + servidor estático) em vez do dev server. |

---

## 📦 Ativos de demonstração (`public/samples/`)

- `casa_residencial.ifc` — casa residencial de demonstração (base **AC20-FZK-Haus** / KIT, arquivo público) **tratada em PT-BR**: cada ativo tem nome em português e um property set **“Dados do Ativo (PT-BR)”** com fabricante, código, valor, validade/garantia e plano de O&M (**dados de exemplo didáticos**). É a base do botão **Exportar CSV**.
- `sala-360.jpg` — derivado do HDRI **"Combination Room"** de [Poly Haven](https://polyhaven.com) (CC0)
- `quarto-suite-360.jpg` — imagem de exemplo do projeto [Panolens](https://github.com/pchen66/panolens.js)
- `hiro-marker.png` — marcador Hiro do [AR.js](https://github.com/AR-js-org/AR.js)

---

## 📄 Licença

Distribuído sob a licença **[MIT](LICENSE)** — © 2026 Luccas Seminario.
Os direitos autorais são retidos pelo autor; o uso é livre nos termos da MIT.
