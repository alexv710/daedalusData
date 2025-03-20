import { fileURLToPath } from 'node:url'
import { defineVitestConfig } from '@nuxt/test-utils/config'

export default defineVitestConfig({
  test: {
    globals: true,
    environment: 'happy-dom',
    include: ['server/**/*.test.ts', 'server/**/*.spec.ts', 'app/**/*.test.ts', 'app/**/*.spec.ts'],
    environmentOptions: {
      nuxt: {
        rootDir: fileURLToPath(new URL('.', import.meta.url)),
        overrides: {
        },
        mock: {
          intersectionObserver: true,
          indexedDb: true,
        },
      },
    },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'lcov'],
      exclude: [
        'node_modules/**',
        '.nuxt/**',
        '.output/**',
        'dist/**',
        'app/components/icons/**',
      ],
    },
    deps: {
      inline: [
        'pinia',
      ],
    },
    alias: {
      '~/': fileURLToPath(new URL('./app/', import.meta.url)),
      '@/': fileURLToPath(new URL('./app/', import.meta.url)),
    },
  },
})
