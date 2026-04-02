/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_GATEWAY_URL: string;
  readonly VITE_GATEWAY_TOKEN: string;
  readonly VITE_MOCK: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare const __APP_VERSION__: string;
