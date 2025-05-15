import nx from '@nx/eslint-plugin';
import typescriptParser from '@typescript-eslint/parser'; // Needed for TS parsing

export default [
  // Basic language options for TypeScript
  {
    languageOptions: {
      parser: typescriptParser,
      parserOptions: { // NO 'project' HERE
        ecmaFeatures: { jsx: true },
        ecmaVersion: 'latest',
        sourceType: 'module',
      },
    },
  },
  // The specific rule we want to test, applied ONLY to CinemaModule.tsx
  {
    files: ['apps/frontend/shell/src/app/modules/CinemaModule.tsx'], // VERY SPECIFIC
    plugins: {
      '@nx': nx, // Register the plugin
    },
    rules: {
      '@nx/enforce-module-boundaries': [
        'error',
        {
          enforceBuildableLibDependency: true,
          allow: [], // No special general allowances for this test
          depConstraints: [
            {
              sourceTag: 'scope:frontend-shell',
              onlyDependOnLibsWithTags: [
                'scope:shared',
                'type:util',
                'scope:frontend-video',
                'scope:frontend-chat',
                'scope:frontend-auth',
              ],
            },
          ],
        },
      ],
      // Add other rules you want to test on this file if necessary
    },
  },
  // Ignore everything else
  {
    ignores: [
      'node_modules/**',
      'dist/**',
      'apps/frontend/video/src/components/VideoPlayer.tsx', // Explicitly ignore problematic files
      'apps/frontend/video/src/types/ScreenOrientation.d.ts',
      'apps/frontend/video/src/types/Shaka.d.ts',
      '**/*.js', // Ignore JS files for this specific TS test if they cause noise
      // Add other patterns to ignore if the output is still noisy
      'apps/frontend/!(shell)/**', // Ignore other apps
      'apps/frontend/shell/src/app/!(modules)/**', // Ignore other parts of shell
      'apps/frontend/shell/src/app/modules/!(CinemaModule.tsx)', // Ignore other modules
    ],
  },
  ...nx.configs['flat/base'],
  ...nx.configs['flat/typescript'],
  ...nx.configs['flat/javascript'],
  {
    ignores: ['**/dist'],
  },
  {
    files: ['**/*.ts', '**/*.tsx', '**/*.js', '**/*.jsx'],
    rules: {
      '@nx/enforce-module-boundaries': [
        'error',
        {
          enforceBuildableLibDependency: true,
          allow: ['^.*/eslint(\\.base)?\\.config\\.[cm]?js$'],
          depConstraints: [
            // Default for all projects: can only depend on libs tagged 'scope:shared' or 'type:util'
            // This rule might be too restrictive if apps are not considered "libs" here.
            // {
            //   sourceTag: '*',
            //   onlyDependOnLibsWithTags: ['scope:shared', 'type:util'],
            // },

            // Rule for frontend-shell:
            // It can depend on libs tagged 'scope:shared', 'type:util',
            // AND also on projects tagged 'scope:frontend-video', 'scope:frontend-chat', 'scope:frontend-auth'.
            // The key is that 'scope:frontend-video' etc. are tags on LIBS that shell can depend on.
            // If video, chat, auth are APPS, this rule needs to be structured differently or they need to be libs.

            // Let's try a more permissive approach first to stop the error, then tighten.
            // This rule says: if a project is tagged 'scope:frontend-shell',
            // it's allowed to import from any project that has one of the listed tags.
            {
              sourceTag: 'scope:frontend-shell',
              onlyDependOnLibsWithTags: [
                'scope:shared',       // Assuming you have shared libs with this tag
                'type:util',          // Assuming you have util libs with this tag
                'scope:frontend-video', // Tag on the video app
                'scope:frontend-chat',  // Tag on the chat app
                'scope:frontend-auth'   // Tag on the auth app
              ],
            },

            // Add a general rule for other apps if needed, e.g.,
            // {
            //   sourceTag: 'type:app', // If all your apps have a 'type:app' tag
            //   onlyDependOnLibsWithTags: ['scope:shared', 'type:util'],
            //   // Add 'notDependOnLibsWithTags' to prevent app-to-app if not shell
            //   notDependOnLibsWithTags: ['type:app'] // This would prevent app-to-app for non-shell apps
            // },

            // If the above doesn't work, a simpler (but less granular) temporary test:
            // {
            //   sourceTag: '*',
            //   onlyDependOnLibsWithTags: ['*'] // Allows anything to depend on anything if tagged
            // }
          ],
        },
      ],
    },
  },
  {
    files: [
      '**/*.ts',
      '**/*.tsx',
      '**/*.cts',
      '**/*.mts',
      '**/*.js',
      '**/*.jsx',
      '**/*.cjs',
      '**/*.mjs',
    ],
    rules: {},
  },
];
