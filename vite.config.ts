import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  // Serve per-exam JSON from ./data at the site root.
  // E.g. /saa-c03/questions.json -> ./data/saa-c03/questions.json
  publicDir: path.resolve(__dirname, "./data"),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
