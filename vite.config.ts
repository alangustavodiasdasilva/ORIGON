import fs from 'fs'
import path from "path"
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  base: '/ORIGON/',
  plugins: [
    react(),
    tailwindcss(),
    {
      name: 'copy-404',
      writeBundle() {
        fs.copyFileSync(
          path.resolve(__dirname, 'dist/index.html'),
          path.resolve(__dirname, 'dist/404.html')
        );
      }
    }
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    // Minificação agressiva com esbuild (rápido e eficiente)
    minify: 'esbuild',
    // Tamanho máximo de warning de chunk (projetos grandes)
    chunkSizeWarningLimit: 1500,
    // Otimizações de target moderno
    target: 'es2020',
    rollupOptions: {
      output: {
        // Estratégia de code splitting — cada vendor em chunk isolado
        // Resultado: página inicial carrega MUITO menos código
        manualChunks: (id) => {
          // React core — carrega primeiro, essencial
          if (id.includes('node_modules/react/') || id.includes('node_modules/react-dom/') || id.includes('node_modules/scheduler/')) {
            return 'vendor-react';
          }
          // React Router — separado pois é grande
          if (id.includes('node_modules/react-router')) {
            return 'vendor-router';
          }
          // Supabase — só carrega quando necessário para autenticação/dados
          if (id.includes('node_modules/@supabase')) {
            return 'vendor-supabase';
          }
          // Recharts + dependências (D3, etc.) — só nas páginas de gráficos
          if (id.includes('node_modules/recharts') || id.includes('node_modules/d3') || id.includes('node_modules/victory')) {
            return 'vendor-charts';
          }
          // XLSX — biblioteca pesada, só na página de export/import
          if (id.includes('node_modules/xlsx')) {
            return 'vendor-xlsx';
          }
          // Tesseract.js (OCR) — muito pesado, isolado completamente
          if (id.includes('node_modules/tesseract')) {
            return 'vendor-tesseract';
          }
          // jsPDF + html2canvas — só na página de export
          if (id.includes('node_modules/jspdf') || id.includes('node_modules/html2canvas')) {
            return 'vendor-pdf';
          }
          // Lucide (ícones) — separado para cache eficiente
          if (id.includes('node_modules/lucide')) {
            return 'vendor-icons';
          }
          // Radix UI — componentes base
          if (id.includes('node_modules/@radix-ui')) {
            return 'vendor-radix';
          }
          // Outros node_modules — agrupados
          if (id.includes('node_modules/')) {
            return 'vendor-misc';
          }
        },
        // Nomes de arquivos com hash para cache busting eficiente
        chunkFileNames: 'assets/js/[name]-[hash].js',
        entryFileNames: 'assets/js/[name]-[hash].js',
        assetFileNames: 'assets/[ext]/[name]-[hash].[ext]',
      },
    },
  },
  // Otimizações do servidor de desenvolvimento
  server: {
    // HMR mais rápido
    hmr: {
      overlay: true,
    },
  },
  // Otimiza dependências no dev — pré-bundle tudo para arranque rápido
  optimizeDeps: {
    include: [
      'react',
      'react-dom',
      'react-router-dom',
      '@supabase/supabase-js',
      'lucide-react',
      'date-fns',
      // tesseract.js usa CommonJS — precisa ser pré-bundled pelo Vite
      'tesseract.js',
    ],
  },
})
