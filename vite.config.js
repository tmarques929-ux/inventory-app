import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Vite configuration
// For more information see https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // Vercel sets the PORT environment variable during builds; use it if available
    port: process.env.PORT ? parseInt(process.env.PORT) : 5173,
  },
});