/// <reference types="vite-plugin-svgr/client" />
/// <reference types="vite/client" />

interface ImportMetaEnv {
  // Backend API URLs
  readonly VITE_PROXY_API_URL: string;
  readonly VITE_PROXY_SEPOLIA_API_URL: string;
  readonly VITE_PROXY_WS_URL: string;
  readonly VITE_PROXY_SEPOLIA_WS_URL: string;
  readonly VITE_BACKEND_URL: string;

  // Feature Flags
  readonly VITE_USE_API_POSITIONS: string;
  readonly VITE_USE_API_ORDERS: string;
  readonly VITE_USE_API_ORDER_SUBMIT: string;

  // App Configuration
  readonly VITE_APP_IS_HOME_SITE: string;
  readonly VITE_IS_HOME_SITE: string;
  readonly VITE_APP_VERSION: string;
  readonly VITE_APP_UI_FEE_RECEIVER: string;

  // Sentry
  readonly VITE_SENTRY_DSN: string;

  // Git Info
  readonly VITE_GIT_COMMIT_HASH: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
