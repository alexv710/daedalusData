<script setup lang="ts">
const color = useColorMode()
const theme = useTheme()

useHead({
  meta: [{
    id: 'theme-color',
    name: 'theme-color',
    content: () => color.value === 'dark' ? '#222222' : '#ffffff',
  }],
})

function toggleDark() {
  color.preference = color.value === 'dark' ? 'light' : 'dark'
  theme.global.name.value = theme.global.current.value.dark ? 'light' : 'dark'
}
</script>

<template>
  <button
    class="rounded-md p-2 transition-colors hover:bg-gray-100 !outline-none dark:hover:bg-gray-800"
    aria-label="Toggle dark mode"
    @click="toggleDark"
  >
    <div class="i-carbon-sun dark:i-carbon-moon h-6 w-6 text-xl" />
  </button>
</template>
