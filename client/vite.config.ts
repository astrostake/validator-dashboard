import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from "path"
import fs from "fs"


const rootPackageJson = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, '../package.json'), 'utf-8')
);

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  define: {
    '__APP_VERSION__': JSON.stringify(rootPackageJson.version),
  },
})