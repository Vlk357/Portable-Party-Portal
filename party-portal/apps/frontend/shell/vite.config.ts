/// <reference types='vitest' />
import { defineConfig, searchForWorkspaceRoot } from 'vite';
import react from '@vitejs/plugin-react';
import { nxViteTsPaths } from '@nx/vite/plugins/nx-tsconfig-paths.plugin';
import { nxCopyAssetsPlugin } from '@nx/vite/plugins/nx-copy-assets.plugin';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa'; // Import the plugin

export default defineConfig({
  root: __dirname,
  cacheDir: '../../../node_modules/.vite/apps/frontend/shell',
  server: {
    port: 5176, // Match the port in docker-compose
    host: '0.0.0.0', // Allow access from network (Docker)
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
    VitePWA({
      registerType: 'autoUpdate', // Automatically update the PWA when new content is available
      injectRegister: 'auto', // or 'script' or null
      devOptions: {
        enabled: true, // Enable PWA in development for testing (optional)
        type: 'module', // Recommended for development
      },
      manifest: {
        name: 'Party Portal Shell',
        short_name: 'PartyPortal',
        description: 'Frontend shell for the Party Portal application.',
        theme_color: '#1f2937', // Example: bg-gray-800 from your screenshot
        background_color: '#ffffff', // A default background color
        start_url: '/',
        display: 'standalone', // Or 'fullscreen', 'minimal-ui'
        scope: '/',
        icons: [
          {
            src: '/icons/icon-192x192.png', // Path relative to your public folder
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: '/icons/icon-512x512.png', // Path relative to your public folder
            sizes: '512x512',
            type: 'image/png',
          },
          // {
          //   src: '/icons/icon-512x512-maskable.png', // Maskable icon (optional but recommended)
          //   sizes: '512x512',
          //   type: 'image/png',
          //   purpose: 'maskable',
          // }
        ],
      },
      // Service worker configuration (using generateSW strategy)
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,webmanifest}'], // Files to cache
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-cache',
              expiration: {
                maxEntries: 10,
                maxAgeSeconds: 60 * 60 * 24 * 365, // <== 365 days
              },
              cacheableResponse: {
                statuses: [0, 200],
              },
            },
          },
          {
            urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'gstatic-fonts-cache',
              expiration: {
                maxEntries: 10,
                maxAgeSeconds: 60 * 60 * 24 * 365, // <== 365 days
              },
              cacheableResponse: {
                statuses: [0, 200],
              },
            },
          },
          // Add more runtime caching rules as needed for APIs, images, etc.
          // Example for API calls (NetworkFirst)
          // {
          //   urlPattern: ({url}) => url.pathname.startsWith('/api'),
          //   handler: 'NetworkFirst',
          //   options: {
          //     cacheName: 'api-cache',
          //     networkTimeoutSeconds: 10, // Fallback to cache if network takes too long
          //     expiration: {
          //       maxEntries: 50,
          //       maxAgeSeconds: 60 * 60 * 24 * 7 // 7 days
          //     },
          //     cacheableResponse: {
          //       statuses: [0, 200]
          //     }
          //   }
          // }
        ],
      },
    }),
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
  // test: {
  //   watch: false,
  //   globals: true,
  //   environment: 'jsdom',
  //   include: ['src/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
  //   reporters: ['default'],
  //   coverage: {
  //     reportsDirectory: '../../../coverage/apps/frontend/shell',
  //     provider: 'v8',
  //   },
  // },
  base: '/', // Shell app should be served from the root
});
