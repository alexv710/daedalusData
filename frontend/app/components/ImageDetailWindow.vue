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
</script>

<template>
  <v-container class="mx-auto max-w-4xl px-4">
    <v-row v-if="imageData">
      <v-col cols="12">
        <v-card elevation="3" class="rounded-lg">
          <v-card-title class="text-xl font-semibold">
            {{ imageId }}
          </v-card-title>
          <v-card-text class="flex justify-center p-4">
            <v-img :src="`/data/images/${imageId}.png`" :alt="imageId" max-height="70vh" contain />
          </v-card-text>
        </v-card>
      </v-col>

      <v-col cols="12" class="mt-6">
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
    </v-row>

    <v-row v-else>
      <v-col cols="12" class="py-10 text-center">
        <v-progress-circular indeterminate color="primary" />
        <div class="mt-4 text-gray-800 dark:text-gray-300">
          Loading image data...
        </div>
      </v-col>
    </v-row>
  </v-container>
</template>
