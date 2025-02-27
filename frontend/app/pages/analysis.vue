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

// Helper function to get a display name for the current image
function getDisplayName() {
  const id = imageStore.displayedId
  if (!id)
    return 'None'

  // If the image has a name property, use it
  const img = imageStore.displayedImage
  if (img && img.name)
    return img.name

  // Otherwise return the ID or a cleaned filename
  return id.split('/').pop() || id
}

definePageMeta({
  layout: 'minimal',
})
</script>

<template>
  <div class="h-screen">
    <div ref="sceneContainer" class="h-full">
      <Scene
        v-if="containerSize.width > 0 && containerSize.height > 0 && currentProjection"
        ref="sceneRef"
        :height="containerSize.height"
        :width="containerSize.width"
        @image-focus-change="handleImageFocusChange"
      />
    </div>

    <!-- Small toolbar at the bottom for status info -->
    <div class="fixed bottom-0 left-0 right-0 flex items-center justify-between border-t border-gray-300 bg-white px-4 py-2 dark:border-gray-700 dark:bg-gray-800">
      <div class="flex items-center">
        <span v-if="displayedImage" class="mr-4 text-sm">
          <strong>Current image:</strong> {{ getDisplayName() }}
        </span>

        <span v-if="isImageFocusLocked" class="rounded-full bg-blue-100 px-2 py-1 text-sm dark:bg-blue-900">
          Locked (press ESC to unlock)
        </span>
      </div>

      <div class="flex gap-3">
        <button
          v-if="displayedImage"
          class="rounded bg-gray-200 px-3 py-1 text-sm dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600"
          @click="imageStore.toggleDetailWindow()"
        >
          {{ imageStore.isDetailWindowOpen() ? 'Close' : 'Show' }} Detail Window
        </button>

        <button
          v-if="isImageFocusLocked"
          class="rounded bg-gray-200 px-3 py-1 text-sm dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600"
          @click="resetFocus"
        >
          Unlock (ESC)
        </button>
      </div>
    </div>
  </div>
</template>
