<script setup lang="ts">
interface FileInfo {
  name: string
  size: number
  lastModified: string
}

interface DatasetInfo {
  images: FileInfo[]
  metadata: FileInfo[]
}

const dataset = ref<DatasetInfo>({
  images: [],
  metadata: [],
})
const loading = ref(true)
const error = ref<string | null>(null)

const formatFileSize = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

onMounted(async () => {
  try {
    // Fetch available files
    const [imagesRes, metadataRes] = await Promise.all([
      fetch('/api/files/images'),
      fetch('/api/files/metadata'),
    ])

    const images = await imagesRes.json()
    const metadata = await metadataRes.json()

    dataset.value = {
      images: images.files || [],
      metadata: metadata.files || [],
    }
  }
  catch (e) {
    error.value = 'Failed to load dataset information'
  }
  finally {
    loading.value = false
  }
})
</script>

<template>
  <div class="p-4">
    <v-btn class="mb-4">
      <NuxtLink to="/scene">Analyse Dataset</NuxtLink>
    </v-btn>

    <h1 class="mb-4 text-2xl font-bold">
      Dataset Explorer
    </h1>

    <div v-if="loading" class="py-8 text-center">
      Loading dataset information...
    </div>

    <div v-else-if="error" class="py-8 text-center text-red-500">
      {{ error }}
    </div>

    <div v-else>
      <!-- Dataset Statistics -->
      <div class="grid grid-cols-1 mb-8 gap-4 md:grid-cols-2">
        <div class="border rounded-lg p-4">
          <h2 class="mb-2 text-lg font-semibold">
            Images
          </h2>
          <p>Total: {{ dataset.images.length }}</p>
          <p class="text-sm text-gray-600">
            Total size: {{ formatFileSize(dataset.images.reduce((acc, img) => acc + img.size, 0)) }}
          </p>
        </div>
        <div class="border rounded-lg p-4">
          <h2 class="mb-2 text-lg font-semibold">
            Metadata Files
          </h2>
          <p>Total: {{ dataset.metadata.length }}</p>
          <p class="text-sm text-gray-600">
            Available files: {{ dataset.metadata.map(m => m.name).join(', ') }}
          </p>
        </div>
      </div>

      <!-- Image Grid -->
      <h2 class="mb-4 text-xl font-semibold">
        Image Preview
      </h2>
      <div class="grid grid-cols-2 gap-4 lg:grid-cols-6 md:grid-cols-4">
        <div
          v-for="image in dataset.images.slice(0, 12)"
          :key="image.name"
          class="aspect-square border rounded-lg p-2 transition-shadow hover:shadow-lg"
        >
          <img
            :src="`data/images/${image.name}`"
            :alt="image.name"
            class="h-full w-full object-contain"
          >
          <div class="mt-2 text-sm space-y-1">
            <div class="truncate text-center">
              {{ image.name }}
            </div>
            <div class="text-xs text-gray-500 text-center">
              {{ formatFileSize(image.size) }}
            </div>
          </div>
        </div>
      </div>
      <div v-if="dataset.images.length > 12" class="mt-4 text-center text-gray-600">
        And {{ dataset.images.length - 12 }} more images...
      </div>

      <!-- Metadata Preview -->
      <h2 class="mb-4 mt-8 text-xl font-semibold">
        Metadata Files
      </h2>
      <div class="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div
          v-for="meta in dataset.metadata"
          :key="meta.name"
          class="border rounded-lg p-4"
        >
          <h3 class="font-semibold">
            {{ meta.name }}
          </h3>
          <p class="text-sm text-gray-600">
            Size: {{ formatFileSize(meta.size) }}
          </p>
          <p class="text-sm text-gray-600">
            Last modified: {{ new Date(meta.lastModified).toLocaleString() }}
          </p>
        </div>
      </div>
    </div>
  </div>
</template>
