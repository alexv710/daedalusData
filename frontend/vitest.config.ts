import { fileURLToPath } from 'node:url'
import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [vue()],
  test: {
    globals: true,
    environment: 'jsdom',
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
    include: ['tests/**/*.test.ts', 'app/components/**/*.test.ts', 'app/stores/**/*.test.ts'],
    alias: {
      '~/': fileURLToPath(new URL('./app/', import.meta.url)),
      '@/': fileURLToPath(new URL('./app/', import.meta.url)),
    },
  },
})
