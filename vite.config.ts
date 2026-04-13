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
})
