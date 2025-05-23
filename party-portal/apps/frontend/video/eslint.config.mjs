// filepath: [eslint.config.mjs](http://_vscodecontentref_/3)
import baseConfig from '../../../eslint.config.mjs'; // Import the root ESLint config
import nx from '@nx/eslint-plugin';
import typescriptParser from '@typescript-eslint/parser';

export default [
  ...baseConfig, // Extend the root ESLint config
  ...nx.configs['flat/react'], // Add Nx React-specific rules
  {
    files: ['**/*.ts', '**/*.tsx', '**/*.js', '**/*.jsx'], // Apply to all files in this project
    languageOptions: {
      parser: typescriptParser,
      parserOptions: {
        ecmaFeatures: { jsx: true },
        ecmaVersion: 'latest',
        sourceType: 'module',
        project: './tsconfig.app.json', // Use the video's tsconfig.app.json
      },
    },
    rules: {
      // Add any video-specific rules here if needed
    },
  },
];