/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_APP_BRAND_NAME?: string;
  readonly VITE_APP_BRAND_SHORT_NAME?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
