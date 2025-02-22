import antfu from '@antfu/eslint-config'
import nuxt from './.nuxt/eslint.config.mjs'

export default nuxt(
  antfu({
    unocss: true,
    formatters: true,
  }),
  {
    ignores: [
      'node_modules/',
      '.nuxt/',
      'dist/',
      '.output/',
      '.pnpm-store/',
    ],
  }
)
