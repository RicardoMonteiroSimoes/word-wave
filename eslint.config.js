import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettierConfig from 'eslint-config-prettier';

export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.strict,
  ...tseslint.configs.stylistic,
  prettierConfig,
  {
    files: ['src/**/*.ts', 'demo/**/*.ts'],
    languageOptions: {
      parserOptions: {
        projectService: {
          allowDefaultProject: ['demo/*.ts', 'vite.config.ts'],
        },
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  { ignores: ['dist/', 'demo/dist/'] },
);
