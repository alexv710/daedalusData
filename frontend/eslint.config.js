// @ts-check
import antfu from '@antfu/eslint-config'
import nuxt from './.nuxt/eslint.config.mjs'

export default nuxt(
  antfu({
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
  },
  ),
  {
    ignores: [
      'node_modules/',
      '.nuxt/',
      'dist/',
      '.output/',
      '.pnpm-store/',
    ],
  },
)
