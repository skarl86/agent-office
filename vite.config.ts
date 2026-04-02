import { resolve } from "node:path";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const rootDir = fileURLToPath(new URL(".", import.meta.url));
const pkg = JSON.parse(readFileSync(resolve(rootDir, "package.json"), "utf-8")) as { version: string };

const rawGatewayUrl =
  process.env.OPENCLAW_GATEWAY_URL || process.env.VITE_GATEWAY_URL || "ws://localhost:18789";
const gatewayUrl = new URL(rawGatewayUrl);
const gatewayTarget = `${
  gatewayUrl.protocol === "wss:" ? "https:" : gatewayUrl.protocol === "ws:" ? "http:" : gatewayUrl.protocol
}//${gatewayUrl.host}`;
const gatewayPath = `${gatewayUrl.pathname}${gatewayUrl.search}` || "/";

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": resolve(rootDir, "./src"),
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ["react", "react-dom", "react-router-dom"],
          zustand: ["zustand", "immer"],
          charts: ["recharts"],
          markdown: ["react-markdown", "remark-gfm"],
          i18n: ["i18next", "react-i18next", "i18next-browser-languagedetector"],
        },
      },
    },
  },
  server: {
    host: true,
    port: 5180,
    proxy: {
      "/gateway-ws": {
        target: gatewayTarget,
        ws: true,
        changeOrigin: true,
        rewrite: () => gatewayPath,
        configure: (proxy) => {
          proxy.on("error", () => {});
          proxy.on("proxyReqWs", (_proxyReq, _req, socket) => {
            socket.on("error", () => {});
          });
        },
      },
    },
  },
});
