/// <reference types="vitest" />

import { lingui } from "@lingui/vite-plugin";
import react from "@vitejs/plugin-react";
import path from "path";
import { fileURLToPath } from "url";
import { visualizer } from "rollup-plugin-visualizer";
import { analyzer } from "vite-bundle-analyzer";
import svgr from "vite-plugin-svgr";
import tsconfigPaths from "vite-tsconfig-paths";
import { defineConfig, loadEnv, type PluginOption } from "vite";

import { BREAKPOINTS } from "./src/shared/lib/breakpoints";

export default defineConfig(({ mode }) => {
  // Load env file based on `mode` in the current working directory.
  const root = path.dirname(fileURLToPath(import.meta.url));
  const env = loadEnv(mode, root, "");
  return {
    worker: {
      format: "es",
    },
    css: {
      preprocessorOptions: {
        scss: {
          additionalData: `
            $screen-md: ${BREAKPOINTS.mobile}px;
            $screen-lg: ${BREAKPOINTS.tablet}px;
            $screen-xl: ${BREAKPOINTS.desktop}px;
            $screen-sm: ${BREAKPOINTS.smallMobile}px;
          `,
        },
      },
    },
    server: {
      host: true,
      proxy: {
        // Dev: proxy rocky-backend's real routes directly. demo.rocky.exchange
        // (and its /api, /auth BFF-shaped compatibility routes) is being
        // deprecated -- api.rocky.exchange exposes rocky-backend's actual
        // /v1/* and /fapi/* surface with no /api prefix, which is what
        // getTradingBackendUrl()'s DEV-mode "" fallback relies on this proxy
        // to resolve.
        "/v1": {
          target: env.VITE_PROXY_API_URL || "https://api.rocky.exchange",
          changeOrigin: true,
          secure: true,
        },
        "/fapi": {
          target: env.VITE_PROXY_API_URL || "https://api.rocky.exchange",
          changeOrigin: true,
          secure: true,
        },
        // Spot backend (/api/v3/*) — mirrors the /fapi proxy above so dev
        // can hit local rocky-backend api-gateway or api.rocky.exchange
        // without cross-origin CORS. Set VITE_PROXY_SPOT_URL to override
        // (e.g. `http://127.0.0.1:8080` when running the full local stack).
        "/api/v3": {
          target:
            env.VITE_PROXY_SPOT_URL ||
            env.VITE_PROXY_API_URL ||
            "https://api.rocky.exchange",
          changeOrigin: true,
          secure: true,
        },
      },
    },
    plugins: [
      svgr({
        include: "**/*.svg?react",
      }),
      tsconfigPaths(),
      react({
        babel: {
          plugins: ["macros"],
        },
      }),
      lingui(),
      visualizer() as PluginOption,
      mode === "analyze" && analyzer(),
    ],
    resolve: {
      alias: {
        // New module structure aliases
        "@": path.resolve(__dirname, "src"),
        "@/modules": path.resolve(__dirname, "src/modules"),
        "@/shared": path.resolve(__dirname, "src/shared"),
        "@/app": path.resolve(__dirname, "src/app"),
        // App directory alias
        app: path.resolve(__dirname, "src/app"),
        components: path.resolve(__dirname, "src/shared/components"),
        config: path.resolve(__dirname, "src/shared/config"),
        context: path.resolve(__dirname, "src/modules/lighter/context"),
        domain: path.resolve(__dirname, "src/modules/lighter/domain"),
        fonts: path.resolve(__dirname, "src/shared/fonts"),
        img: path.resolve(__dirname, "src/shared/img"),
        lib: path.resolve(__dirname, "src/shared/lib"),
        locales: path.resolve(__dirname, "src/shared/locales"),
        pages: path.resolve(__dirname, "src/modules/lighter/pages"),
        features: path.resolve(__dirname, "src/modules/lighter/features"),
        modules: path.resolve(__dirname, "src/modules"),
        landing: path.resolve(__dirname, "src/modules/lighter/pages"),
        shared: path.resolve(__dirname, "src/shared"),
        styles: path.resolve(__dirname, "src/shared/styles"),
        "typechain-types": path.resolve(__dirname, "src/modules/lighter/contracts/typechain-types"),
        "typechain-types-stargate": path.resolve(
          __dirname,
          "src/modules/lighter/contracts/typechain-types-stargate"
        ),
        sdk: path.resolve(__dirname, "src/shared/sdk"),
      },
    },
    build: {
      assetsInlineLimit: 0,
      outDir: "build",
      sourcemap: true,
      rollupOptions: {
        output: {
          manualChunks: {
            utilities: ["date-fns", "lodash"],
            charts: ["recharts"],
            ui: ["@headlessui/react", "framer-motion", "react-select"],
          },
        },
      },
    },
    test: {
      environment: "happy-dom",
      globalSetup: "./vitest.global-setup.js",
      exclude: ["./autotests", "node_modules", "./sdk"],
      setupFiles: ["@vitest/web-worker"],
    },
  };
});
