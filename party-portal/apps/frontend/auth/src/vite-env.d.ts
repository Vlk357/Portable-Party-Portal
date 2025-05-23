/// <reference types="vite/client" />

// You can also declare specific env variables for better type safety
interface ImportMetaEnv {
  readonly VITE_CHAT_WEBSOCKET_URL: string;
  // Add other env variables used in this app here
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
