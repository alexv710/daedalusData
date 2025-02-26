import { acceptHMRUpdate, defineStore } from 'pinia'
import { computed, ref } from 'vue'

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
    Array.from(selectedIds.value).map(id => images.value.get(id)),
  )
  const highlightedImages = computed(() =>
    Array.from(highlightedIds.value).map(id => images.value.get(id)),
  )

  // Get all available attributes from images
  const availableAttributes = computed(() => {
    const attributes = new Set<string>()

    images.value.forEach((img) => {
      if (!img)
        return

      Object.keys(img).forEach((key) => {
        if (key !== 'name' && key !== 'id') {
          attributes.add(key)
        }
      })
    })

    return Array.from(attributes).sort()
  })

  // Get attributes formatted for v-select components
  const attributeItems = computed(() => {
    return availableAttributes.value.map(attr => ({
      title: attr,
      value: attr,
    }))
  })

  // Get all numeric attributes (for violin plots)
  const availableNumericAttributes = computed(() => {
    const numericAttributes = new Set<string>()

    // We need at least some images to check
    if (images.value.size === 0)
      return []

    // Filter for attributes that contain numeric values
    availableAttributes.value.forEach((attr) => {
      // Check if at least one image has a numeric value for this attribute
      let hasNumeric = false

      for (const img of images.value.values()) {
        if (img && typeof img[attr] === 'number' && !isNaN(img[attr])) {
          hasNumeric = true
          break
        }
      }

      if (hasNumeric) {
        numericAttributes.add(attr)
      }
    })

    return Array.from(numericAttributes).sort()
  })

  // Calculated attribute data for count charts
  const attributeChartData = computed(() => {
    const groups: Record<string, Record<string, number>> = {}

    // Loop over each selected image
    selectedImages.value.forEach((img) => {
      if (!img)
        return

      // For every property in the image, except name or id
      Object.keys(img).forEach((key) => {
        if (key === 'name' || key === 'id')
          return

        const value = img[key] ?? 'unknown'
        if (!groups[key])
          groups[key] = {}
        groups[key][value] = (groups[key][value] || 0) + 1
      })
    })

    // Convert the counts for each attribute into an array suitable for the chart
    const result: Record<string, Array<{ value: string, count: number }>> = {}
    Object.keys(groups).forEach((attribute) => {
      result[attribute] = Object.entries(groups[attribute]).map(([val, count]) => ({
        value: val,
        count,
      }))
    })

    return result
  })

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
    }
    else {
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
    }
    else {
      highlightedIds.value.add(key)
    }
  }

  // --- Projection management ---
  // Holds the currently selected projection file name.
  const currentProjection = ref(null)
  // Holds the list of available projection file names.
  const availableProjections = ref([])

  // Load available projection file names from the manifest.
  async function loadProjections() {
    try {
      const response = await fetch('/data/projections/projection_manifest.json')
      if (!response.ok) {
        throw new Error('Failed to fetch projection manifest.')
      }
      const manifest = await response.json()
      // manifest is assumed to be an array of file names.
      availableProjections.value = manifest
      if (manifest.length > 0) {
        currentProjection.value = manifest[0]
      }
    }
    catch (error) {
      console.error('Error loading projections:', error)
      availableProjections.value = []
      currentProjection.value = null
    }
  }

  function selectProjection(projectionFileName) {
    currentProjection.value = projectionFileName
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
    currentProjection,
    availableProjections,
    loadProjections,
    selectProjection,
    availableAttributes,
    attributeItems,
    availableNumericAttributes,
    attributeChartData,
  }
})

if (import.meta.hot)
  import.meta.hot.accept(acceptHMRUpdate(useImageStore, import.meta.hot))
