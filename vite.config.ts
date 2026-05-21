import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

/** Proxy vers le serveur Playwright PDF (npm run pdf-server, port 3847 par défaut). */
const pdfExportProxy = {
  "/pdf-export": {
    target: "http://127.0.0.1:3847",
    changeOrigin: true,
    rewrite: (path: string) => path.replace(/^\/pdf-export/, ""),
  },
};

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
    proxy: pdfExportProxy,
  },
  preview: {
    proxy: pdfExportProxy,
  },
  plugins: [react(), mode === "development" && componentTagger()].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
    dedupe: ["react", "react-dom", "react/jsx-runtime", "react/jsx-dev-runtime", "@tanstack/react-query", "@tanstack/query-core"],
  },
  };
});
