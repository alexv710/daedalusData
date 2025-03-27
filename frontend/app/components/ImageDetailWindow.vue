<script setup>
const imageId = ref('')
const imageData = ref(null)
const loading = ref(true)
const metadataError = ref(false)
const imageUrl = ref('')
const possibleExtensions = ['png', 'jpg', 'jpeg']

onMounted(async () => {
  // Get the image ID from the URL parameters
  const urlParams = new URLSearchParams(window.location.search)
  imageId.value = urlParams.get('id') || ''

  if (imageId.value) {
    try {
      // Find the correct image extension by trying each one
      await findCorrectImageExtension()

      // Fetch all image metadata from the JSON file
      const response = await fetch('api/file/metadata/images.json')
      if (response.ok) {
        const allImagesData = await response.json()

        // Extract the key without file extension if it has one
        const key = imageId.value.split('.')[0]

        // Get the metadata for this specific image
        imageData.value = allImagesData[key] || null

        if (!imageData.value) {
          console.error(`Image metadata not found for key: ${key}`)
          metadataError.value = true
        }
      }
      else {
        console.error('Failed to fetch image metadata')
        metadataError.value = true
      }
    }
    catch (error) {
      console.error('Error fetching image metadata:', error)
      metadataError.value = true
    }
    finally {
      loading.value = false
    }
  }
  else {
    loading.value = false
  }
})

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
  if (value instanceof Date || (typeof value === 'string' && !Number.isNaN(Date.parse(value)))) {
    return new Date(value).toLocaleString()
  }

  return value.toString()
}

async function findCorrectImageExtension() {
  for (const ext of possibleExtensions) {
    const testUrl = `/api/file/images/${imageId.value}.${ext}`
    try {
      // Send a HEAD request to check if the image exists with this extension
      const response = await fetch(testUrl)
      if (response.ok) {
        imageUrl.value = testUrl
        console.info(`Found image with extension: ${ext}`)
        return
      }
    }
    catch (error) {
      console.info(`Image not found with extension: ${ext}`)
    }
  }

  // If we reach here, none of the extensions worked
  // Default to the first extension as a fallback
  imageUrl.value = `/api/file/images/${imageId.value}.${possibleExtensions[0]}`
  console.warn('Could not verify image extension, using default:', possibleExtensions[0])
}
</script>

<template>
  <v-container class="mx-auto max-w-4xl px-4">
    <v-row v-if="loading">
      <v-col cols="12" class="py-10 text-center">
        <v-progress-circular indeterminate color="primary" />
        <div class="mt-4 text-gray-800 dark:text-gray-300">
          Loading image data...
        </div>
      </v-col>
    </v-row>

    <v-row v-else-if="imageId">
      <v-col cols="12">
        <v-card elevation="3" class="rounded-lg">
          <v-card-title class="text-xl font-semibold">
            {{ imageId }}
          </v-card-title>
          <v-card-text class="flex justify-center p-4">
            <v-img v-if="imageUrl" :src="imageUrl" :alt="imageId" max-height="70vh" contain />
            <div v-else class="py-4 text-center">
              <v-alert type="warning" variant="tonal">
                Unable to load image. Please check the image ID.
              </v-alert>
            </div>
          </v-card-text>
        </v-card>
      </v-col>

      <v-col v-if="imageData" cols="12" class="mt-6">
        <v-card elevation="3" class="rounded-lg">
          <v-card-title class="py-3 text-lg font-medium">
            Metadata
          </v-card-title>
          <v-divider />
          <v-card-text class="p-0">
            <v-list density="compact">
              <v-list-item
                v-for="(value, key) in imageData"
                :key="key"
                class="border-b border-gray-100 px-4 py-2"
              >
                <template #prepend>
                  <div class="min-w-32 text-gray-900 font-medium dark:text-gray-100">
                    {{ formatKey(key) }}
                  </div>
                </template>
                <v-list-item-subtitle>
                  {{ formatValue(value) }}
                </v-list-item-subtitle>
              </v-list-item>
            </v-list>
          </v-card-text>
        </v-card>
      </v-col>

      <v-col v-else cols="12" class="mt-6">
        <v-card elevation="3" class="rounded-lg">
          <v-card-title class="py-3 text-lg font-medium">
            Metadata
          </v-card-title>
          <v-divider />
          <v-card-text class="p-4 text-center">
            <v-alert type="info" variant="tonal" class="mb-0">
              No metadata available for this image.
            </v-alert>
          </v-card-text>
        </v-card>
      </v-col>
    </v-row>

    <v-row v-else>
      <v-col cols="12" class="py-10 text-center">
        <v-alert type="error" variant="tonal">
          No image ID provided. Please specify an image ID in the URL.
        </v-alert>
      </v-col>
    </v-row>
  </v-container>
</template>
