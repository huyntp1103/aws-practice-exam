import { defineConfig, type PluginOption } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
import fs from "node:fs";

// Copy dist/index.html to dist/404.html so static hosts (GitHub Pages) that
// don't know about SPA routing fall back to the React app for deep links.
function spaFallback(): PluginOption {
  return {
    name: "spa-fallback-404",
    apply: "build",
    closeBundle() {
      const distDir = path.resolve(__dirname, "dist");
      const indexHtml = path.join(distDir, "index.html");
      if (fs.existsSync(indexHtml)) {
        fs.copyFileSync(indexHtml, path.join(distDir, "404.html"));
      }
    },
  };
}

// Custom domain for GitHub Pages.
function ghPagesCname(): PluginOption {
  return {
    name: "gh-pages-cname",
    apply: "build",
    closeBundle() {
      const distDir = path.resolve(__dirname, "dist");
      fs.writeFileSync(path.join(distDir, "CNAME"), "aws.nguyetquedo.com\n");
    },
  };
}

export default defineConfig({
  plugins: [react(), spaFallback(), ghPagesCname()],
  // Serve per-exam JSON from ./data at the site root.
  // E.g. /saa-c03/questions.json -> ./data/saa-c03/questions.json
  publicDir: path.resolve(__dirname, "./data"),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
