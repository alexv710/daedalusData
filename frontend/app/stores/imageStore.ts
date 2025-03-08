import { acceptHMRUpdate, defineStore } from 'pinia'

export const useImageStore = defineStore('image', () => {
  // A Map to store image metadata (static data).
  // Key: image id (e.g. "bulbasaur")
  // Value: metadata object (any information you need)
  const images = ref(new Map())

  const selectedIds = ref(new Set())
  const highlightedIds = ref(new Set())
  const hoveredId = ref(null)
  const focusedId = ref(null)
  const isImageFocusLocked = ref(false)
  const activeFilters = ref({})
  const filteredImageIds = ref(new Set())
  const instanceToImageMap = ref(new Map<number, string>())
  const imageToInstanceMap = ref(new Map<string, number>())

  // For popup window management
  const imageDetailWindow = ref(null)

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

  const selectedInstanceIds = computed(() =>
    Array.from(selectedIds.value).map(imageKey => imageToInstanceMap.value.get(imageKey)).filter(Boolean),
  )

  const highlightedImages = computed(() =>
    Array.from(highlightedIds.value).map(id => images.value.get(id)),
  )

  // Get the focused image metadata
  const focusedImage = computed(() => {
    return focusedId.value ? images.value.get(focusedId.value) : null
  })

  // Get the hovered image metadata
  const hoveredImage = computed(() => {
    return hoveredId.value ? images.value.get(hoveredId.value) : null
  })

  // Get currently displayed image (focused if locked, otherwise hovered)
  const displayedImage = computed(() => {
    if (isImageFocusLocked.value && focusedId.value) {
      return images.value.get(focusedId.value)
    }
    else if (hoveredId.value) {
      return images.value.get(hoveredId.value)
    }
    return null
  })

  // Get the ID of the displayed image
  const displayedId = computed(() => {
    if (isImageFocusLocked.value && focusedId.value) {
      return focusedId.value
    }
    else if (hoveredId.value) {
      return hoveredId.value
    }
    return null
  })

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
        if (img && typeof img[attr] === 'number' && !Number.isNaN(img[attr])) {
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

  function initializeFilters() {
    const newFilters = {}

    // Set up for each available attribute
    availableAttributes.value.forEach((attr) => {
      // Determine if the attribute has numeric values
      const isNumeric = availableNumericAttributes.value.includes(attr)

      if (isNumeric) {
        // For numeric attributes, store min/max range
        let min = Infinity
        let max = -Infinity

        // Find the actual min/max values
        images.value.forEach((img) => {
          if (img && typeof img[attr] === 'number') {
            min = Math.min(min, img[attr])
            max = Math.max(max, img[attr])
          }
        })

        // Initialize with full range (no filtering)
        newFilters[attr] = {
          type: 'numeric',
          min,
          max,
          currentMin: min,
          currentMax: max,
          active: false,
        }
      }
      else {
        // For categorical attributes, get all possible values
        const values = new Set()

        images.value.forEach((img) => {
          if (img && img[attr] !== undefined) {
            values.add(String(img[attr]))
          }
        })

        // Initialize with all values selected (no filtering)
        newFilters[attr] = {
          type: 'categorical',
          values: Array.from(values).sort(),
          selected: Array.from(values).sort(),
          active: false,
        }
      }
    })

    activeFilters.value = newFilters
  }

  // Apply all active filters and update filteredImageIds
  function applyFilters() {
    // If no filters are active, include all images
    const hasActiveFilters = Object.values(activeFilters.value).some(filter => filter.active)

    // Create a Set to store filtered instance IDs
    const newFilteredInstanceIds = new Set()

    if (!hasActiveFilters) {
      // Get all instance IDs that have corresponding image keys
      // Iterate through imageToInstanceMap to ensure we're getting valid mappings
      imageKeys.value.forEach((imageKey) => {
        const instanceId = imageToInstanceMap.value.get(imageKey)
        if (instanceId !== undefined) {
          newFilteredInstanceIds.add(instanceId)
        }
      })
    }
    else {
      // Filter the images based on active filters
      imageKeys.value.forEach((id) => {
        const img = images.value.get(id)
        if (!img)
          return

        // Check if the image passes all active filters
        const passesAllFilters = Object.entries(activeFilters.value).every(([attr, filter]) => {
          // Skip inactive filters
          if (!filter.active)
            return true

          const value = img[attr]

          // Handle missing values - exclude by default when filter is active
          if (value === undefined || value === null)
            return false

          if (filter.type === 'numeric') {
            // For numeric filters, check if value is within range
            return value >= filter.currentMin && value <= filter.currentMax
          }
          else if (filter.type === 'categorical') {
            // For categorical filters, check if value is in selected values
            return filter.selected.includes(String(value))
          }

          return true
        })

        if (passesAllFilters) {
          // Convert image key to instance ID
          const instanceId = imageToInstanceMap.value.get(id)
          if (instanceId !== undefined) {
            newFilteredInstanceIds.add(instanceId)
          }
        }
      })
    }

    // Update the filtered image IDs
    filteredImageIds.value = newFilteredInstanceIds

    // Remove selections for any filtered-out images
    removeFilteredOutSelections()
  }

  function removeFilteredOutSelections() {
    // Create a temporary set for image keys that remain selected
    const newSelectedIds = new Set()

    // Only keep selections that are in the filtered set
    selectedIds.value.forEach((imageKey) => {
      const instanceId = imageToInstanceMap.value.get(imageKey)
      if (instanceId !== undefined && filteredImageIds.value.has(instanceId)) {
        newSelectedIds.add(imageKey)
      }
    })

    selectedIds.value = newSelectedIds
  }

  // Update a numerical filter
  function updateNumericFilter(attribute, min, max) {
    const filter = activeFilters.value[attribute]
    if (!filter || filter.type !== 'numeric')
      return

    filter.currentMin = min
    filter.currentMax = max
    filter.active = (min > filter.min || max < filter.max)

    applyFilters()
  }

  // Update a categorical filter
  function updateCategoricalFilter(attribute, selected) {
    const filter = activeFilters.value[attribute]
    if (!filter || filter.type !== 'categorical')
      return

    filter.selected = selected
    filter.active = (selected.length < filter.values.length)

    applyFilters()
  }

  // Reset all filters
  function resetFilters() {
    Object.keys(activeFilters.value).forEach((attr) => {
      const filter = activeFilters.value[attr]

      if (filter.type === 'numeric') {
        filter.currentMin = filter.min
        filter.currentMax = filter.max
      }
      else if (filter.type === 'categorical') {
        filter.selected = [...filter.values]
      }

      filter.active = false
    })

    applyFilters()
  }

  // Reset a specific filter
  function resetFilter(attribute) {
    const filter = activeFilters.value[attribute]
    if (!filter)
      return

    if (filter.type === 'numeric') {
      filter.currentMin = filter.min
      filter.currentMax = filter.max
    }
    else if (filter.type === 'categorical') {
      filter.selected = [...filter.values]
    }

    filter.active = false
    applyFilters()
  }

  // Initialize filters after loading metadata
  const originalLoadImageMetadata = loadImageMetadata
  loadImageMetadata = async function () {
    await originalLoadImageMetadata()
    initializeFilters()
    applyFilters()
  }

  // Computed property to get filtered images
  const filteredImages = computed(() =>
    Array.from(filteredImageIds.value)
      .flatMap((instanceId) => {
        const imageKey = instanceToImageMap.value[instanceId]
        return imageKey ? [images.value.get(imageKey)] : []
      }),
  )

  // Count of filtered images
  const filteredImageCount = computed(() => filteredImageIds.value.size)
  // Actions for selection.
  function clearSelection() {
    selectedIds.value.clear()
  }

  function addSelection(id) {
    const instanceId = imageToInstanceMap.value.get(id)
    if (instanceId !== undefined && filteredImageIds.value.has(instanceId)) {
      selectedIds.value.add(id)
    }
  }

  function addManySelection(ids) {
    const filteredIds = ids.filter((id) => {
      const instanceId = imageToInstanceMap.value.get(id)
      return instanceId !== undefined && filteredImageIds.value.has(instanceId)
    })

    selectedIds.value = new Set([...selectedIds.value, ...filteredIds])
  }

  function removeSelection(id) {
    selectedIds.value.delete(id)
  }

  function removeManySelection(ids) {
    ids.forEach((id) => {
      selectedIds.value.delete(id)
    })
  }

  function toggleSelection(id) {
    if (selectedIds.value.has(id)) {
      selectedIds.value.delete(id)
    }
    else {
      const instanceId = imageToInstanceMap.value.get(id)
      if (instanceId !== undefined && filteredImageIds.value.has(instanceId)) {
        selectedIds.value.add(id)
      }
    }
  }

  function batchSelect(ids: Set<string>) {
    const filteredIds = [...ids].filter((id) => {
      const instanceId = imageToInstanceMap.value.get(id)
      return instanceId !== undefined && filteredImageIds.value.has(instanceId)
    })

    selectedIds.value = new Set([...selectedIds.value, ...filteredIds])
  }
  // Actions for highlighting.
  function clearHighlights() {
    highlightedIds.value.clear()
  }
  function addHighlight(id) {
    highlightedIds.value.add(id)
  }
  function batchHighlight(ids) {
    highlightedIds.value = new Set([...highlightedIds.value, ...ids])
  }
  function removeHighlight(id) {
    highlightedIds.value.delete(id)
  }
  function toggleHighlight(id) {
    if (highlightedIds.value.has(id)) {
      highlightedIds.value.delete(id)
    }
    else {
      highlightedIds.value.add(id)
    }
  }

  // Actions for focus/hover state
  function setHoveredImage(id) {
    hoveredId.value = id

    // If we have a detail window open and it's not locked, update it
    if (imageDetailWindow.value && !isImageFocusLocked.value) {
      updateDetailWindow(id)
    }
  }

  function setFocusedImage(id) {
    focusedId.value = id
  }

  function lockImageFocus(id) {
    focusedId.value = id
    isImageFocusLocked.value = true

    // If we have a detail window open, update it
    if (imageDetailWindow.value) {
      updateDetailWindow(id)
    }
  }

  function unlockImageFocus() {
    isImageFocusLocked.value = false

    // If not locked, show the currently hovered image in the detail window
    if (imageDetailWindow.value && hoveredId.value) {
      updateDetailWindow(hoveredId.value)
    }

    focusedId.value = null
  }

  // Detail window management
  function openDetailWindow(imageId) {
    // Close any existing window
    closeDetailWindow()

    // Build the URL for the detail page with the image ID as a parameter
    const detailUrl = `/image-detail?id=${encodeURIComponent(imageId)}`

    // Open the window - customize size and features as needed
    imageDetailWindow.value = window.open(
      detailUrl,
      'imageDetail',
      'width=800,height=800,resizable=yes,scrollbars=yes',
    )

    // For debugging
    console.log(`Opened detail window for image: ${imageId}`)
  }

  function closeDetailWindow() {
    if (imageDetailWindow.value && !imageDetailWindow.value.closed) {
      imageDetailWindow.value.close()
    }
    imageDetailWindow.value = null
  }

  function updateDetailWindow(imageId) {
    if (imageDetailWindow.value && !imageDetailWindow.value.closed) {
      // Navigate to a new URL with the updated image ID
      imageDetailWindow.value.location.href = `/image-detail?id=${encodeURIComponent(imageId)}`
    }
  }

  function toggleDetailWindow() {
    const id = displayedId.value
    if (!id)
      return

    if (imageDetailWindow.value && !imageDetailWindow.value.closed) {
      closeDetailWindow()
    }
    else {
      openDetailWindow(id)
    }
  }

  // Check if the window is open
  function isDetailWindowOpen() {
    return imageDetailWindow.value !== null && !imageDetailWindow.value.closed
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
    hoveredId,
    focusedId,
    isImageFocusLocked,
    loadImageMetadata,
    imageKeys,
    totalImages,
    selectedImages,
    highlightedImages,
    focusedImage,
    hoveredImage,
    displayedImage,
    displayedId,
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
    setHoveredImage,
    setFocusedImage,
    lockImageFocus,
    unlockImageFocus,
    currentProjection,
    availableProjections,
    loadProjections,
    selectProjection,
    availableAttributes,
    attributeItems,
    availableNumericAttributes,
    attributeChartData,
    openDetailWindow,
    closeDetailWindow,
    updateDetailWindow,
    toggleDetailWindow,
    isDetailWindowOpen,
    activeFilters,
    filteredImageIds,
    filteredImages,
    filteredImageCount,
    initializeFilters,
    applyFilters,
    updateNumericFilter,
    updateCategoricalFilter,
    resetFilters,
    resetFilter,
    imageToInstanceMap,
    instanceToImageMap,
    addManySelection,
    removeManySelection,
    selectedInstanceIds,
  }
})

if (import.meta.hot)
  import.meta.hot.accept(acceptHMRUpdate(useImageStore, import.meta.hot))
