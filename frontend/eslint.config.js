// eslint.config.js
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';

import antfu from '@antfu/eslint-config';
import eslintPluginFormat from 'eslint-plugin-format';
import globals from 'globals';

const __dirname = dirname(fileURLToPath(import.meta.url));
const nuxtEslintConfigPath = join(__dirname, '.nuxt/eslint.config.mjs');

const configArray = [];

configArray.push(
  ...antfu({
    unocss: true,
    formatters: {
      css: true,
      html: true,
      markdown: true,
    },
    stylistic: {
      quotes: 'single',
      semi: false,
    },
    rules: {
      'style/semi': ['error', 'never'],
      'node/prefer-global/process': 'off',
      'vue/no-deprecated-functional-template': 'off',
      'vue/one-component-per-file': 'off',
      'no-console': ['warn', { allow: ['info', 'warn', 'error'] }],
    },
  }),
  {
    plugins: {
      format: eslintPluginFormat,
    },
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
  },
);

// Conditionally add the Nuxt ESLint config if it exists
if (existsSync(nuxtEslintConfigPath)) {
  try {
    const nuxtEslintConfig = await import(nuxtEslintConfigPath);
    configArray.push(nuxtEslintConfig.default);
  } catch (error) {
    console.warn(`Failed to load Nuxt ESLint config: ${error.message}`);
  }
}

export default configArray;