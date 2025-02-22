import { acceptHMRUpdate, defineStore } from 'pinia'
import { ref, computed } from 'vue'

export const useImageStore = defineStore('image', () => {
  // A Map to store image metadata (static data).
  // Key: image id (e.g. "bulbasaur")
  // Value: metadata object (any information you need)
  const images = ref(new Map())

  const selectedIds = ref(new Set())
  const highlightedIds = ref(new Set())

  // Load metadata from the JSON file and populate the store.
  async function loadImageMetadata() {
    const response = await fetch('/data/metadata/images.json')
    if (!response.ok) {
      throw new Error('Failed to fetch image metadata')
    }
    const rawData = await response.json()
    const newMap = new Map()
    for (const key in rawData) {
      newMap.set(key, { ...rawData[key] })
    }
    images.value = newMap
  }

  // Computed property to list all image ids.
  const imageKeys = computed(() => Array.from(images.value.keys()))
  const totalImages = computed(() => images.value.size)

  // Computed properties to get selected and highlighted image metadata.
  const selectedImages = computed(() =>
    Array.from(selectedIds.value).map((id) => images.value.get(id))
  )
  const highlightedImages = computed(() =>
    Array.from(highlightedIds.value).map((id) => images.value.get(id))
  )

  // Actions for selection.
  function clearSelection() {
    selectedIds.value.clear()
  }
  function addSelection(key) {
    selectedIds.value.add(key)
  }
  function removeSelection(key) {
    selectedIds.value.delete(key)
  }
  function toggleSelection(key) {
    if (selectedIds.value.has(key)) {
      selectedIds.value.delete(key)
    } else {
      selectedIds.value.add(key)
    }
  }
  function batchSelect(keys) {
    selectedIds.value = new Set([...selectedIds.value, ...keys])
  }

  // Actions for highlighting.
  function clearHighlights() {
    highlightedIds.value.clear()
  }
  function addHighlight(key) {
    highlightedIds.value.add(key)
  }
  function batchHighlight(keys) {
    highlightedIds.value = new Set([...highlightedIds.value, ...keys])
  }
  function removeHighlight(key) {
    highlightedIds.value.delete(key)
  }
  function toggleHighlight(key) {
    if (highlightedIds.value.has(key)) {
      highlightedIds.value.delete(key)
    } else {
      highlightedIds.value.add(key)
    }
  }

  return {
    images,
    selectedIds,
    highlightedIds,
    loadImageMetadata,
    imageKeys,
    totalImages,
    selectedImages,
    highlightedImages,
    clearSelection,
    addSelection,
    removeSelection,
    toggleSelection,
    batchSelect,
    batchHighlight,
    clearHighlights,
    addHighlight,
    removeHighlight,
    toggleHighlight,
  }
})

if (import.meta.hot)
  import.meta.hot.accept(acceptHMRUpdate(useImageStore, import.meta.hot))
