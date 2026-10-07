import js from '@eslint/js'
import { defineConfig, globalIgnores } from 'eslint/config'
import reactHooks from 'eslint-plugin-react-hooks'
import tseslint from 'typescript-eslint'

export default defineConfig(globalIgnores(['dist']), {
  files: ['**/*.{ts,tsx}'],
  extends: [
    js.configs.recommended,
    tseslint.configs.strictTypeChecked,
    reactHooks.configs.flat.recommended,
  ],
  languageOptions: {
    parserOptions: {
      projectService: true,
      tsconfigRootDir: import.meta.dirname,
    },
  },
  rules: {
    'no-duplicate-imports': 'error',
    '@typescript-eslint/no-import-type-side-effects': 'error',
    // Only matters under React Compiler, which this app does not use.
    'react-hooks/incompatible-library': 'off',
  },
})
