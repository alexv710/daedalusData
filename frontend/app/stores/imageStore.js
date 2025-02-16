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
    // Populate the Map with metadata. You can add extra state here.
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

  // Optionally, add additional computed values (e.g. statistics).
  const totalImages = computed(() => images.value.size)

  return { images, loadImageMetadata, imageKeys, totalImages }
})

if (import.meta.hot)
  import.meta.hot.accept(acceptHMRUpdate(useImageStore, import.meta.hot))
