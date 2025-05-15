import rootConfig from '../../../eslint.config.mjs'; // Path to your root config
import nxEslintPlugin from '@nx/eslint-plugin';
import tsParser from '@typescript-eslint/parser';
// import other plugins like react, react-hooks if used in this project

export default [
  // First, spread the configurations from the root
  ...rootConfig,
  // Then, add project-specific overrides and settings
  {
    files: ['**/*.ts', '**/*.tsx', '**/*.js', '**/*.jsx'], // Files within this project
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaFeatures: { jsx: true },
        ecmaVersion: 'latest',
        sourceType: 'module',
        project: ['./tsconfig.app.json', './tsconfig.spec.json'], // Points to shell's tsconfig files
      },
    },
    plugins: {
      '@nx': nxEslintPlugin,
      // ... other plugins
    },
    rules: {
      // ... shell-specific rules or overrides
      '@nx/enforce-module-boundaries': [ // Example if you want to override/specify for shell
        'error',
        {
          enforceBuildableLibDependency: true,
          allow: [],
          depConstraints: [
            {
              sourceTag: 'scope:frontend-shell', // Make sure this tag is in shell's project.json
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
    },
  },
  // You might also include Nx's preconfigured flat configs for React/TS if not fully covered by root
  // For example, if your root doesn't include nx.configs['flat/typescript']
  // you might add it here, but ensure it doesn't conflict with the parserOptions above.
];