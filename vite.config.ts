import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const supabaseUrl = env.VITE_SUPABASE_URL?.trim();
  const supabaseAnonKey = env.VITE_SUPABASE_ANON_KEY?.trim();

  if (mode === "production" && (!supabaseUrl || !supabaseAnonKey)) {
    throw new Error(
      "[build] VITE_SUPABASE_URL et VITE_SUPABASE_ANON_KEY sont requis. " +
        "Sur Vercel : Settings → Environment Variables (Production), puis Redeploy. " +
        "En local : copiez .env.example vers .env.",
    );
  }

  return {
  define: {
    "import.meta.env.VITE_SUPABASE_URL": JSON.stringify(supabaseUrl ?? ""),
    "import.meta.env.VITE_SUPABASE_ANON_KEY": JSON.stringify(supabaseAnonKey ?? ""),
  },
  server: {
    host: "::",
    port: 8080,
    allowedHosts: [".ngrok-free.dev", ".ngrok.io", "localhost", "127.0.0.1"],
    hmr: {
      overlay: false,
    },
    proxy: {
      "/api/fx-rate": {
        target: "https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/fx-rate/, ""),
      },
    },
  },
  plugins: [react(), mode === "development" && componentTagger()].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
    dedupe: ["react", "react-dom", "react/jsx-runtime", "react/jsx-dev-runtime", "@tanstack/react-query", "@tanstack/query-core"],
  },
  build: {
    // p5 / three-vanta / bootstrap : chunks lourds volontairement lazy-loadés
    chunkSizeWarningLimit: 1200,
    // p5 analyse sketch.toString() au runtime : conserver les noms évite les erreurs Acorn en prod
    esbuild: {
      keepNames: true,
    },
    rollupOptions: {
      output: {
        // Découpage minimal : uniquement libs lourdes et isolées (évite les cycles charts/i18n).
        manualChunks(id) {
          if (!id.includes("node_modules")) return;
          if (id.includes("/p5/") || id.includes("\\p5\\")) return "p5";
          if (id.includes("three") || id.includes("vanta")) return "three-vanta";
        },
      },
    },
  },
  };
});
