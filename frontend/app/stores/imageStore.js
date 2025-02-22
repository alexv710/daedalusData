import { acceptHMRUpdate, defineStore } from 'pinia'
import { ref, computed } from 'vue'

export const useImageStore = defineStore('image', () => {
  // A Map to store image metadata.
  // Key: image key (e.g. "bulbasaur")
  // Value: metadata object (including any additional UI state)
  const images = ref(new Map())

  // Load metadata from the JSON file and populate the store.
  async function loadImageMetadata() {
    const response = await fetch('/data/metadata/images.json')
    if (!response.ok) {
      throw new Error('Failed to fetch image metadata')
    }
    const rawData = await response.json()
    // Populate the Map with metadata and extra state.
    for (const key in rawData) {
      images.value.set(key, {
        ...rawData[key],
        selected: false,
        highlighted: false,
      })
    }
  }

  // A computed property to list all image keys.
  const imageKeys = computed(() => Array.from(images.value.keys()))
  // Total number of images.
  const totalImages = computed(() => images.value.size)

  // Computed property to track selected images.
  const selectedImages = computed(() =>
    Array.from(images.value.entries())
      .filter(([key, meta]) => meta.selected)
      .map(([key]) => key)
  )

  // Computed property to track highlighted images.
  const highlightedImages = computed(() =>
    Array.from(images.value.entries())
      .filter(([key, meta]) => meta.highlighted)
      .map(([key]) => key)
  )

  // Action to update an image's selection/highlight state.
  function updateImageState(key, { selected, highlighted }) {
    const meta = images.value.get(key)
    if (meta) {
      if (typeof selected === 'boolean') {
        meta.selected = selected
      }
      if (typeof highlighted === 'boolean') {
        meta.highlighted = highlighted
      }
    }
  }

  return {
    images,
    loadImageMetadata,
    imageKeys,
    totalImages,
    selectedImages,
    highlightedImages,
    updateImageState,
  }
})

if (import.meta.hot)
  import.meta.hot.accept(acceptHMRUpdate(useImageStore, import.meta.hot))
