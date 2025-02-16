<script setup>
const sceneRef = ref(null)
const sceneContainer = ref(null)
const containerSize = ref({ width: 0, height: 0 })

useResizeObserver(sceneContainer, (entries) => {
  const entry = entries[0]
  if (entry) {
    containerSize.value = {
      width: entry.contentRect.width,
      height: entry.contentRect.height,
    }
  }
})

onMounted(() => {
  // Initial size update
  if (sceneContainer.value) {
    containerSize.value = {
      width: sceneContainer.value.clientWidth,
      height: sceneContainer.value.clientHeight,
    }
  }
})
</script>

<template>
  <div
    ref="sceneContainer"
    class="bg-green h-screen"
  >
    <SceneDummy
      v-if="containerSize.width > 0 && containerSize.height > 0"
      ref="sceneRef"
      :height="containerSize.height"
      :width="containerSize.width"
    />
  </div>
</template>
