import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// Dev server runs on 5174 and proxies API calls to the Express backend on 5173.
// The production build (vite build) emits to client/dist, which the server serves.
export default defineConfig({
  plugins: [react()],
  server: {
    host: "0.0.0.0",
    port: 5174,
    proxy: {
      "/api": "http://localhost:5173"
    }
  },
  build: {
    outDir: "dist",
    sourcemap: true
  }
});
