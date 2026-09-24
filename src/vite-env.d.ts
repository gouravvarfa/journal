/// <reference types="vite/client" />

declare module 'virtual:pwa-register' {
  export function registerSW(options?: { immediate?: boolean }): void
}

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL?: string
}
