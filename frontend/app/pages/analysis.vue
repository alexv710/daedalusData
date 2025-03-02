<script setup>
const sceneRef = ref(null)
const sceneContainer = ref(null)
const containerSize = ref({ width: 0, height: 0 })

const imageStore = useImageStore()
const currentProjection = computed(() => imageStore.currentProjection)
const displayedImage = computed(() => imageStore.displayedImage)
const isImageFocusLocked = computed(() => imageStore.isImageFocusLocked)

// Load images and projections when the component is mounted
onMounted(async () => {
  await imageStore.loadImageMetadata()
  await imageStore.loadProjections()

  // Initial size update
  if (sceneContainer.value) {
    containerSize.value = {
      width: sceneContainer.value.clientWidth,
      height: sceneContainer.value.clientHeight,
    }
  }

  // Add keyboard event listener for ESC key
  window.addEventListener('keydown', handleKeyDown)
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeyDown)
  // Close the detail window if open
  imageStore.closeDetailWindow()
})

// Handle container resizing
useResizeObserver(sceneContainer, (entries) => {
  const entry = entries[0]
  if (entry) {
    containerSize.value = {
      width: entry.contentRect.width,
      height: entry.contentRect.height,
    }
  }
})

// Function to handle image focus changes
function handleImageFocusChange(imageKey) {
  if (imageKey) {
    // If we get a new imageKey, update the hover state
    imageStore.setHoveredImage(imageKey)

    // If there's no detail window open yet and we have an image, open it
    if (displayedImage.value && !imageStore.isDetailWindowOpen()) {
      imageStore.openDetailWindow(imageKey)
    }
  }
  else if (!isImageFocusLocked.value) {
    // Clear hover state if not locked and no image is hovered
    imageStore.setHoveredImage(null)
  }
}

// Function to reset image focus
function resetFocus() {
  if (sceneRef.value) {
    sceneRef.value.resetFocus()
  }
}

// Function to handle keydown events (mainly for ESC key)
function handleKeyDown(event) {
  if (event.key === 'Escape' && isImageFocusLocked.value) {
    resetFocus()
  }
}

definePageMeta({
  layout: 'minimal',
})
</script>

<template>
  <div ref="sceneContainer" class="h-screen">
    <Scene
      v-if="containerSize.width > 0 && containerSize.height > 0 && currentProjection"
      ref="sceneRef"
      :height="containerSize.height"
      :width="containerSize.width"
      @image-focus-change="handleImageFocusChange"
    />
  </div>
</template>
