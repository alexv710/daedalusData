<script setup>
const imageId = ref('')
const imageData = ref(null)

onMounted(async () => {
  // Get the image ID from the URL parameters
  const urlParams = new URLSearchParams(window.location.search)
  imageId.value = urlParams.get('id') || ''

  if (imageId.value) {
    try {
      // Fetch all image metadata from the JSON file
      const response = await fetch('/data/metadata/images.json')
      if (response.ok) {
        const allImagesData = await response.json()

        // Extract the key without file extension if it has one
        const key = imageId.value.split('.')[0]

        // Get the metadata for this specific image
        imageData.value = allImagesData[key] || null

        if (!imageData.value) {
          console.error(`Image metadata not found for key: ${key}`)
        }
      }
      else {
        console.error('Failed to fetch image metadata')
      }
    }
    catch (error) {
      console.error('Error fetching image metadata:', error)
    }
  }
})

function isDisplayableField(key) {
  const skipFields = ['id', '_id', '__v']
  return !skipFields.includes(key)
}

function formatKey(key) {
  return key
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, str => str.toUpperCase())
    .trim()
}

function formatValue(value) {
  if (value === null || value === undefined)
    return 'N/A'

  // Handle arrays
  if (Array.isArray(value)) {
    if (value.length === 0)
      return 'None'
    return value.join(', ')
  }

  // Handle objects
  if (typeof value === 'object') {
    return JSON.stringify(value)
  }

  // Handle booleans
  if (typeof value === 'boolean') {
    return value ? 'Yes' : 'No'
  }

  // Handle dates
  if (value instanceof Date || (typeof value === 'string' && !isNaN(Date.parse(value)))) {
    return new Date(value).toLocaleString()
  }

  return value.toString()
}
</script>

<template>
  <div class="image-detail-window">
    <div class="header">
      <h1>{{ imageId }}</h1>
    </div>

    <div v-if="imageData" class="content">
      <div class="image-container">
        <img :src="`/data/images/${imageId}.png`" :alt="imageId">
      </div>

      <div class="metadata">
        <h2>Metadata</h2>
        <div class="metadata-grid">
          <div v-for="(value, key) in imageData" :key="key" class="metadata-row">
            <template v-if="isDisplayableField(key)">
              <div class="metadata-key">
                {{ formatKey(key) }}
              </div>
              <div class="metadata-value">
                {{ formatValue(value) }}
              </div>
            </template>
          </div>
        </div>
      </div>
    </div>

    <div v-else class="loading">
      Loading image data...
    </div>
  </div>
</template>

  <style scoped>
  .image-detail-window {
  font-family:
    system-ui,
    -apple-system,
    BlinkMacSystemFont,
    'Segoe UI',
    Roboto,
    sans-serif;
  padding: 20px;
  max-width: 1200px;
  margin: 0 auto;
}

.header {
  margin-bottom: 20px;
  border-bottom: 1px solid #e2e8f0;
  padding-bottom: 15px;
}

.header h1 {
  font-size: 24px;
  font-weight: 600;
  color: #1a202c;
}

.content {
  display: flex;
  flex-direction: column;
  gap: 30px;
}

.image-container {
  display: flex;
  justify-content: center;
  background-color: #f7fafc;
  border-radius: 8px;
  padding: 20px;
  box-shadow:
    0 4px 6px -1px rgba(0, 0, 0, 0.1),
    0 2px 4px -1px rgba(0, 0, 0, 0.06);
}

.image-container img {
  max-width: 100%;
  max-height: 70vh;
  object-fit: contain;
}

.metadata {
  background-color: #f7fafc;
  border-radius: 8px;
  padding: 20px;
  box-shadow:
    0 4px 6px -1px rgba(0, 0, 0, 0.1),
    0 2px 4px -1px rgba(0, 0, 0, 0.06);
}

.metadata h2 {
  font-size: 20px;
  font-weight: 600;
  margin-bottom: 15px;
  color: #2d3748;
}

.metadata-grid {
  display: grid;
  gap: 12px;
}

.metadata-row {
  display: grid;
  grid-template-columns: 200px 1fr;
  gap: 16px;
}

.metadata-key {
  font-weight: 500;
  color: #4a5568;
}

.loading {
  text-align: center;
  padding: 40px;
  color: #718096;
  font-size: 18px;
}

@media (max-width: 640px) {
  .metadata-row {
    grid-template-columns: 1fr;
    gap: 4px;
  }

  .metadata-key {
    font-weight: 600;
  }
}
</style>
