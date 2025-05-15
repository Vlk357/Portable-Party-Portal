/// <reference types='vitest' />
import { defineConfig, searchForWorkspaceRoot } from 'vite';
import react from '@vitejs/plugin-react';
import { nxViteTsPaths } from '@nx/vite/plugins/nx-tsconfig-paths.plugin';
import { nxCopyAssetsPlugin } from '@nx/vite/plugins/nx-copy-assets.plugin';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  root: __dirname,
  cacheDir: '../../../node_modules/.vite/apps/frontend/shell',
  server: {
    port: 5176, // Match the port in docker-compose
    host: true, // Allow access from network (Docker)
    fs: {
      // Allow serving files from the workspace root (important for monorepos)
      allow: [
        searchForWorkspaceRoot(process.cwd()),
        // You might need to add other specific paths if searchForWorkspaceRoot isn't enough
        // e.g., '../../node_modules' if your structure is complex and detection fails
      ],
    },
  },
  preview: {
    port: 4300,
    host: 'localhost',
  },
  plugins: [
    react(),
    tailwindcss(),
    /* {
      config: path.resolve(__dirname, '../../../tailwind.config.js'), // Force monorepo root config
    } */
    nxViteTsPaths(),
    nxCopyAssetsPlugin(['*.md']),
  ],
  resolve: {
    alias: {
      // Consider removing these if nxViteTsPaths() is handling them:
      // '@party-portal/auth': path.resolve(__dirname, '../auth/src'),
      // '@party-portal/chat': path.resolve(__dirname, '../chat/src'),
      // '@party-portal/video': path.resolve(__dirname, '../video/src'),
      // Add other aliases here ONLY if they are NOT in tsconfig.base.json paths
    },
  },
  // Uncomment this if you are using workers.
  // worker: {
  //  plugins: [ nxViteTsPaths() ],
  // },
  build: {
    outDir: '../../../dist/apps/frontend/shell',
    emptyOutDir: true,
    reportCompressedSize: true,
    commonjsOptions: {
      transformMixedEsModules: true,
    },
  },
  test: {
    watch: false,
    globals: true,
    environment: 'jsdom',
    include: ['src/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    reporters: ['default'],
    coverage: {
      reportsDirectory: '../../../coverage/apps/frontend/shell',
      provider: 'v8',
    },
  },
  base: '/', // Shell app should be served from the root
});
