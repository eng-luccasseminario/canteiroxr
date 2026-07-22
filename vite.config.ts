import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
  server: {
    port: 3000,                          // roda em http://localhost:3000
    host: true,                          // expõe na rede (0.0.0.0) p/ o túnel Cloudflare
    allowedHosts: [".trycloudflare.com"], // aceita qualquer subdomínio do túnel Cloudflare
  },
  preview: {
    port: 3000,
  },
})
