<template>
  <div
    class="bg-green h-screen"
    ref="sceneContainer"
  >
    <SceneDummy
      :height="containerSize.height"
      :width="containerSize.width"
      :offsetX="40">
    </SceneDummy>
  </div>
</template>

<script setup>
const sceneContainer = ref(null)
const containerSize = ref({ width: 0, height: 0 })

useResizeObserver(sceneContainer, (entries) => {
  const entry = entries[0]
  console.log(entry)
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
