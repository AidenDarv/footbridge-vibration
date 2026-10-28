import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';

export default tseslint.config(
  { ignores: ['dist/', 'node_modules/', 'validation/reference/'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  prettier,
  {
    // The engine must stay pure: no DOM or browser globals (CLAUDE.md, Architecture rules).
    files: ['src/engine/**/*.ts'],
    rules: {
      'no-restricted-globals': ['error', 'window', 'document', 'localStorage', 'navigator'],
      'no-restricted-properties': ['error', { object: 'Math', property: 'random' }],
    },
  },
);
