<script setup lang="ts">
import { appName } from '~/constants'

const color = useColorMode()
const theme = useTheme()

useHead({
  title: appName,
})

onMounted(() => {
  theme.global.name.value = color.value
})
</script>

<template>
  <VitePwaManifest />
  <NuxtLayout>
    <NuxtPage />
  </NuxtLayout>
</template>

<style>
html,
body,
#__nuxt {
  height: 100vh;
  margin: 0;
  padding: 0;
}

html.dark {
  background: #222;
  color: white;
}
</style>
