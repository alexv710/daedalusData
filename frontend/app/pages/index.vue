<script setup lang="ts">
interface FileInfo {
  name: string
  size: number
  lastModified: string
}

interface DatasetInfo {
  images: FileInfo[]
  metadata: FileInfo[]
  features: FileInfo[]
  projections: FileInfo[]
}

const dataset = ref<DatasetInfo>({
  images: [],
  metadata: [],
  features: [],
  projections: [],
})

const loading = ref(true)
const error = ref<string | null>(null)
const atlasExists = ref(false)
const activeStep = ref(0)
const steps = [
  { name: 'Images', completed: false, icon: 'mdi-image-multiple', tooltip: 'Add images to your dataset' },
  { name: 'Metadata', completed: false, icon: 'mdi-file-document-outline', tooltip: 'Add metadata for your images' },
  { name: 'Features', completed: false, icon: 'mdi-chart-bubble', tooltip: 'Extract features from your images' },
  { name: 'Projections', completed: false, icon: 'mdi-chart-scatter-plot', tooltip: 'Calculate dimensionality reductions' },
  { name: 'Atlas', completed: false, icon: 'mdi-image-filter-frames', tooltip: 'Generate the image atlas' },
]

// Atlas generation state
const atlasGenerating = ref(false)
const atlasProgress = ref(0)
const atlasProgressMessage = ref('')
const atlasError = ref<string | null>(null)
const atlasStatusInterval = ref<number | null>(null)

function formatFileSize(bytes: number) {
  if (bytes < 1024)
    return `${bytes} B`
  if (bytes < 1024 * 1024)
    return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function checkStepStatus() {
  // Step 1: Images
  steps[0].completed = dataset.value.images.length > 0

  // Step 2: Metadata
  steps[1].completed = dataset.value.metadata.length > 0

  // Step 3: Features
  steps[2].completed = dataset.value.features.length > 0

  // Step 4: Projections
  steps[3].completed = dataset.value.projections.length > 0

  // Step 5: Atlas
  steps[4].completed = atlasExists.value

  // Set active step to the first incomplete step
  const firstIncompleteIndex = steps.findIndex(step => !step.completed)
  activeStep.value = firstIncompleteIndex !== -1 ? firstIncompleteIndex : steps.length - 1
}

function checkAtlasExists() {
  // Perform a HEAD request to check for the atlas file
  fetch('/data/atlas.png', { method: 'HEAD' })
    .then((res) => {
      atlasExists.value = res.ok
      if (res.ok) {
        // Also check for atlas.json to ensure the metadata exists
        return fetch('/data/atlas.json', { method: 'HEAD' })
      }
      return Promise.resolve({ ok: false })
    })
    .then((res) => {
      // Only mark as complete if both image and json exist
      atlasExists.value = atlasExists.value && res.ok
      checkStepStatus()
    })
    .catch(() => {
      atlasExists.value = false
      checkStepStatus()
    })
}

function startAtlasGeneration() {
  if (atlasGenerating.value)
    return

  atlasGenerating.value = true
  atlasProgress.value = 5
  atlasProgressMessage.value = 'Starting atlas generation...'
  atlasError.value = null

  // Start the atlas generation process
  fetch('/api/atlasGenerator', {
    method: 'POST',
  })
    .then((res) => {
      if (!res.ok)
        throw new Error('Failed to generate atlas')
      return res.json()
    })
    .then((data) => {
      console.log('Atlas generated:', data)
      // Set to 100% complete
      atlasProgress.value = 100
      atlasProgressMessage.value = 'Atlas generation complete!'

      // Re-check if the atlas now exists
      setTimeout(() => {
        checkAtlasExists()
        atlasGenerating.value = false
        stopPollingAtlasStatus()
      }, 1000)
    })
    .catch((e) => {
      console.error('Failed to generate atlas:', e)
      atlasError.value = `Failed to generate atlas: ${e.message || 'Unknown error'}`
      atlasGenerating.value = false
      stopPollingAtlasStatus()
    })

  // Start polling for status updates
  startPollingAtlasStatus()
}

function startPollingAtlasStatus() {
  // Poll for atlas generation status every 2 seconds
  if (atlasStatusInterval.value)
    clearInterval(atlasStatusInterval.value)

  atlasStatusInterval.value = window.setInterval(() => {
    fetch('/api/atlasStatus')
      .then(res => res.json())
      .then((data) => {
        if (data.status === 'in_progress') {
          atlasProgress.value = data.progress || Math.min(90, atlasProgress.value + 5)
          atlasProgressMessage.value = data.message || 'Processing images...'
        }
        else if (data.status === 'error') {
          atlasError.value = data.error || 'An error occurred during atlas generation'
          atlasGenerating.value = false
          stopPollingAtlasStatus()
        }
        else if (data.status === 'complete') {
          atlasProgress.value = 100
          atlasProgressMessage.value = 'Atlas generation complete!'
          atlasGenerating.value = false
          stopPollingAtlasStatus()
          checkAtlasExists()
        }
      })
      .catch((err) => {
        console.error('Error checking atlas status:', err)
        // Don't stop polling on network errors, just try again next interval
      })
  }, 2000)
}

function stopPollingAtlasStatus() {
  if (atlasStatusInterval.value) {
    clearInterval(atlasStatusInterval.value)
    atlasStatusInterval.value = null
  }
}

function navigateToJupyter() {
  window.open('http://localhost:8888', '_blank')
}

function navigateToAnalysis() {
  navigateTo('/analysis')
}

definePageMeta({
  layout: 'empty',
})

onMounted(async () => {
  try {
    // Fetch available files for each category
    const [imagesRes, metadataRes, featuresRes, projectionsRes] = await Promise.all([
      fetch('/api/files/images'),
      fetch('/api/files/metadata'),
      fetch('/api/files/features'),
      fetch('/api/files/projections'),
    ])

    const images = await imagesRes.json()
    const metadata = await metadataRes.json()
    const features = await featuresRes.json()
    const projections = await projectionsRes.json()

    dataset.value = {
      images: images.files || [],
      metadata: metadata.files || [],
      features: features.files || [],
      projections: projections.files || [],
    }

    // Check if atlas exists
    checkAtlasExists()
  }
  catch (e) {
    error.value = `Failed to load dataset information: ${e}`
  }
  finally {
    loading.value = false
  }
})

// Make sure to clean up on component unmount
onUnmounted(() => {
  stopPollingAtlasStatus()
})
</script>

<template>
  <div class="mx-auto max-w-6xl p-4">
    <h1 class="mb-6 text-center text-2xl font-bold">
      DaedalusData Workflow
    </h1>

    <v-card class="mb-8">
      <v-card-text>
        <div v-if="loading" class="py-8 text-center">
          <v-progress-circular indeterminate color="primary" />
          <div class="mt-4">
            Loading dataset information...
          </div>
        </div>

        <div v-else-if="error" class="py-8 text-center text-red-500">
          {{ error }}
        </div>

        <div v-else>
          <v-stepper v-model="activeStep" class="elevation-0">
            <v-stepper-header>
              <template v-for="(step, i) in steps" :key="i">
                <v-stepper-item
                  :value="i"
                  :complete="step.completed"
                  :title="step.name"
                  :icon="step.icon"
                />

                <v-divider v-if="i < steps.length - 1" />
              </template>
            </v-stepper-header>

            <v-stepper-window>
              <!-- Step 1: Images -->
              <v-stepper-window-item value="0">
                <v-card-text>
                  <h2 class="mb-4 text-xl font-semibold">
                    Add Images to Your Dataset
                  </h2>

                  <div v-if="dataset.images.length > 0" class="mb-4">
                    <v-alert type="success" variant="tonal">
                      <strong>{{ dataset.images.length }}</strong> images found in your dataset.
                      Total size: {{ formatFileSize(dataset.images.reduce((acc, img) => acc + img.size, 0)) }}
                    </v-alert>

                    <div class="grid grid-cols-2 mt-4 gap-4 lg:grid-cols-6 md:grid-cols-4">
                      <div
                        v-for="image in dataset.images.slice(0, 6)"
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
                        </div>
                      </div>
                    </div>

                    <div v-if="dataset.images.length > 6" class="mt-4 text-center text-gray-600">
                      And {{ dataset.images.length - 6 }} more images...
                    </div>
                  </div>

                  <div v-else>
                    <v-alert type="warning" variant="tonal">
                      No images found in your dataset.
                    </v-alert>

                    <div class="mt-4">
                      <p>To add images to your dataset:</p>
                      <ol class="ml-6 mt-2 list-decimal space-y-2">
                        <li>Place your image files (PNG format) in the <code>data/images/</code> directory</li>
                        <li>The image filenames (without extension) should match the keys in your metadata</li>
                      </ol>
                    </div>
                  </div>
                </v-card-text>
              </v-stepper-window-item>

              <!-- Step 2: Metadata -->
              <v-stepper-window-item value="1">
                <v-card-text>
                  <h2 class="mb-4 text-xl font-semibold">
                    Add Metadata for Your Images
                  </h2>

                  <div v-if="dataset.metadata.length > 0" class="mb-4">
                    <v-alert type="success" variant="tonal">
                      <strong>{{ dataset.metadata.length }}</strong> metadata files found.
                    </v-alert>

                    <div class="grid grid-cols-1 mt-4 gap-4 md:grid-cols-2">
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

                  <div v-else>
                    <v-alert type="warning" variant="tonal">
                      No metadata files found in your dataset.
                    </v-alert>

                    <div class="mt-4">
                      <p>To add metadata to your dataset:</p>
                      <ol class="ml-6 mt-2 list-decimal space-y-2">
                        <li>Create a JSON file in the <code>data/metadata/</code> directory</li>
                        <li>The format should be a flat JSON object where keys are image names (without file extension)</li>
                        <li>
                          Example: <code>images.json</code> with content like:
                          <pre class="mt-2 overflow-x-auto rounded bg-gray-100 p-2">
                          {
                            "image1": {
                              "type": "sample",
                              "size": 10.5,
                              "category": "A"
                            },
                            "image2": {
                              "type": "control",
                              "size": 8.3,
                              "category": "B"
                            }
                          }</pre>
                        </li>
                      </ol>
                    </div>
                  </div>
                </v-card-text>
              </v-stepper-window-item>

              <!-- Step 3: Features -->
              <v-stepper-window-item value="2">
                <v-card-text>
                  <h2 class="mb-4 text-xl font-semibold">
                    Extract Features from Your Images
                  </h2>

                  <div v-if="dataset.features.length > 0" class="mb-4">
                    <v-alert type="success" variant="tonal">
                      <strong>{{ dataset.features.length }}</strong> feature files found.
                    </v-alert>

                    <div class="grid grid-cols-1 mt-4 gap-4 md:grid-cols-2">
                      <div
                        v-for="feature in dataset.features"
                        :key="feature.name"
                        class="border rounded-lg p-4"
                      >
                        <h3 class="font-semibold">
                          {{ feature.name }}
                        </h3>
                        <p class="text-sm text-gray-600">
                          Size: {{ formatFileSize(feature.size) }}
                        </p>
                        <p class="text-sm text-gray-600">
                          Last modified: {{ new Date(feature.lastModified).toLocaleString() }}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div v-else>
                    <v-alert type="warning" variant="tonal">
                      No feature files found. You need to extract features from your images.
                    </v-alert>

                    <div class="mt-4">
                      <p>To extract features from your images:</p>
                      <ol class="ml-6 mt-2 list-decimal space-y-2">
                        <li>Open the Jupyter notebook environment</li>
                        <li>Run the feature extraction notebook</li>
                        <li>Features will be saved to the <code>data/features/</code> directory</li>
                      </ol>

                      <v-btn
                        color="primary"
                        class="mt-4"
                        prepend-icon="mdi-notebook"
                        @click="navigateToJupyter"
                      >
                        Open Jupyter Notebooks
                      </v-btn>
                    </div>
                  </div>
                </v-card-text>
              </v-stepper-window-item>

              <!-- Step 4: Projections -->
              <v-stepper-window-item value="3">
                <v-card-text>
                  <h2 class="mb-4 text-xl font-semibold">
                    Calculate Dimensionality Reductions
                  </h2>

                  <div v-if="dataset.projections.length > 0" class="mb-4">
                    <v-alert type="success" variant="tonal">
                      <strong>{{ dataset.projections.length }}</strong> projection files found.
                    </v-alert>

                    <div class="grid grid-cols-1 mt-4 gap-4 md:grid-cols-2">
                      <div
                        v-for="projection in dataset.projections"
                        :key="projection.name"
                        class="border rounded-lg p-4"
                      >
                        <h3 class="font-semibold">
                          {{ projection.name }}
                        </h3>
                        <p class="text-sm text-gray-600">
                          Size: {{ formatFileSize(projection.size) }}
                        </p>
                        <p class="text-sm text-gray-600">
                          Last modified: {{ new Date(projection.lastModified).toLocaleString() }}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div v-else>
                    <v-alert type="warning" variant="tonal">
                      No projection files found. You need to calculate dimensionality reductions.
                    </v-alert>

                    <div class="mt-4">
                      <p>To create projections for your dataset:</p>
                      <ol class="ml-6 mt-2 list-decimal space-y-2">
                        <li>Open the Jupyter notebook environment</li>
                        <li>Run the dimensionality reduction notebook</li>
                        <li>Projections will be saved to the <code>data/projections/</code> directory</li>
                      </ol>

                      <v-btn
                        color="primary"
                        class="mt-4"
                        prepend-icon="mdi-notebook"
                        @click="navigateToJupyter"
                      >
                        Open Jupyter Notebooks
                      </v-btn>
                    </div>
                  </div>
                </v-card-text>
              </v-stepper-window-item>

              <!-- Step 5: Atlas -->
              <v-stepper-window-item value="4">
                <v-card-text>
                  <h2 class="mb-4 text-xl font-semibold">
                    Generate Image Atlas
                  </h2>

                  <div v-if="atlasExists" class="mb-4">
                    <v-alert type="success" variant="tonal">
                      Atlas has been generated successfully.
                    </v-alert>

                    <div class="mt-4 border rounded-lg p-4">
                      <h3 class="mb-2 font-semibold">
                        Atlas Preview
                      </h3>
                      <img
                        src="/data/atlas.png"
                        alt="Atlas"
                        class="h-64 w-full border rounded object-contain"
                      >
                    </div>

                    <div class="mt-4 flex flex-wrap gap-2">
                      <v-btn
                        color="primary"
                        prepend-icon="mdi-refresh"
                        :disabled="atlasGenerating"
                        @click="startAtlasGeneration"
                      >
                        Regenerate Atlas
                      </v-btn>

                      <v-btn
                        color="success"
                        prepend-icon="mdi-chart-box"
                        @click="navigateToAnalysis"
                      >
                        Explore Dataset
                      </v-btn>
                    </div>
                  </div>

                  <div v-else>
                    <v-alert
                      v-if="atlasError"
                      type="error"
                      variant="tonal"
                      class="mb-4"
                    >
                      {{ atlasError }}
                    </v-alert>

                    <v-alert
                      v-else
                      type="info"
                      variant="tonal"
                      class="mb-4"
                    >
                      No atlas found. Generate an atlas to optimize image loading and visualization.
                    </v-alert>

                    <div v-if="atlasGenerating" class="mt-4">
                      <p class="mb-2">
                        {{ atlasProgressMessage }}
                      </p>
                      <v-progress-linear
                        v-model="atlasProgress"
                        color="primary"
                        height="20"
                        striped
                      >
                        <template #default>
                          {{ Math.ceil(atlasProgress) }}%
                        </template>
                      </v-progress-linear>
                      <p class="mt-2 text-sm text-gray-600">
                        This may take a few minutes for large datasets...
                      </p>
                    </div>

                    <div v-else class="mt-4">
                      <p>The atlas combines all images into a single file for efficient loading and display.</p>

                      <v-btn
                        color="primary"
                        class="mt-4"
                        prepend-icon="mdi-image-filter-frames"
                        :disabled="!steps[0].completed || atlasGenerating"
                        @click="startAtlasGeneration"
                      >
                        Generate Atlas
                      </v-btn>
                    </div>
                  </div>
                </v-card-text>
              </v-stepper-window-item>
            </v-stepper-window>
          </v-stepper>
        </div>
      </v-card-text>
    </v-card>

    <!-- Dataset Overview -->
    <v-card>
      <v-card-title>Dataset Statistics</v-card-title>
      <v-card-text>
        <div v-if="loading" class="py-4 text-center">
          Loading dataset information...
        </div>

        <div v-else-if="error" class="py-4 text-center text-red-500">
          {{ error }}
        </div>

        <div v-else class="grid grid-cols-1 gap-4 lg:grid-cols-4 md:grid-cols-2">
          <div class="border rounded-lg p-4">
            <h3 class="flex items-center font-semibold">
              <v-icon color="primary" class="mr-2">
                mdi-image-multiple
              </v-icon>
              Images
            </h3>
            <p class="mt-2 text-2xl font-bold">
              {{ dataset.images.length }}
            </p>
            <p class="text-sm text-gray-600">
              Size: {{ formatFileSize(dataset.images.reduce((acc, img) => acc + img.size, 0)) }}
            </p>
          </div>

          <div class="border rounded-lg p-4">
            <h3 class="flex items-center font-semibold">
              <v-icon color="primary" class="mr-2">
                mdi-file-document-outline
              </v-icon>
              Metadata
            </h3>
            <p class="mt-2 text-2xl font-bold">
              {{ dataset.metadata.length }}
            </p>
            <p v-if="dataset.metadata.length > 0" class="text-sm text-gray-600">
              Latest: {{ dataset.metadata[0]?.name }}
            </p>
          </div>

          <div class="border rounded-lg p-4">
            <h3 class="flex items-center font-semibold">
              <v-icon color="primary" class="mr-2">
                mdi-chart-bubble
              </v-icon>
              Features
            </h3>
            <p class="mt-2 text-2xl font-bold">
              {{ dataset.features.length }}
            </p>
            <p v-if="dataset.features.length > 0" class="text-sm text-gray-600">
              Latest: {{ dataset.features[0]?.name }}
            </p>
          </div>

          <div class="border rounded-lg p-4">
            <h3 class="flex items-center font-semibold">
              <v-icon color="primary" class="mr-2">
                mdi-chart-scatter-plot
              </v-icon>
              Projections
            </h3>
            <!-- -1 because of the manifest file -->
            <p class="mt-2 text-2xl font-bold">
              {{ dataset.projections.length - 1 }}
            </p>
            <p v-if="dataset.projections.length > 0" class="text-sm text-gray-600">
              Latest: {{ dataset.projections[0]?.name }}
            </p>
          </div>
        </div>
      </v-card-text>
    </v-card>
  </div>
</template>
