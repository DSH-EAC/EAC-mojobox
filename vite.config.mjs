import { defineConfig } from 'vite'

export default defineConfig({
  root: 'site',
  base: process.env.BASE_PATH || '/',
  publicDir: process.env.MOJOBOX_DEMO === '1' ? '../.cache/intake-demo/site/public' : 'public',
  build: {
    outDir: process.env.MOJOBOX_DEMO === '1' ? '../dist-demo' : '../dist',
    emptyOutDir: true
  }
})
