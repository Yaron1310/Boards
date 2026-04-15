
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import { fileURLToPath } from 'url';

// ES Module replacement for __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  // The root must be the folder containing index.html and src
  root: __dirname,
  build: {
    // Output to the parent directory (the plugin root)
    outDir: path.resolve(__dirname, '..'),
    // Don't wipe the .php and .txt files when building
    emptyOutDir: false,
    rollupOptions: {
      // Our entry point is the tsx file, not an html file
      input: 'src/index.tsx',
      output: {
        entryFileNames: 'index.js',
        assetFileNames: 'index.css',
      },
    },
  },
})
