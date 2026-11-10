import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';

export default tseslint.config(
  { ignores: ['dist', 'public/data', 'node_modules', 'playwright-report', 'test-results', '.cache', 'workers/*/node_modules', 'workers/*/.wrangler'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['src/**/*.{ts,tsx}'],
    languageOptions: { globals: globals.browser },
    plugins: { 'react-hooks': reactHooks },
    rules: { ...reactHooks.configs.recommended.rules },
  },
  {
    files: ['scripts/**/*.ts', 'tests/**/*.ts', 'e2e/**/*.ts', 'workers/**/*.{ts,mjs}', '*.config.{ts,js}'],
    languageOptions: { globals: globals.node },
  },
);
