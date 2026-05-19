import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],

  build: {
    // ⚠️ NUNCA gerar source maps em produção
    // Source maps expõem o código original e tornam mais fácil
    // identificar a estrutura da aplicação para ataques
    sourcemap: false,

    // Minificação agressiva
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console: true,    // remove console.log em produção
        drop_debugger: true,
      },
    },
  },

  // Variáveis de ambiente devem começar com VITE_
  // Configure no painel do Vercel: Settings > Environment Variables
  envPrefix: 'VITE_',
})
