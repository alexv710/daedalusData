<script setup lang="ts">
const drawerLeft = ref(true)
const drawerRight = ref(true)
const activeTab = ref(0)

const imageStore = useImageStore()
const colorMode = useColorMode()

// State for tracking visible charts
const visibleBoxPlots = ref<string[]>([])
const violinCharts = ref<number[]>([])

// Color palettes for the theme
const colorPalettes = {
  light: [
    '#3b82f6', // blue-500
    '#8b5cf6', // violet-500
    '#14b8a6', // teal-500
    '#f97316', // orange-500
    '#06b6d4', // cyan-500
    '#ec4899', // pink-500
    '#10b981', // emerald-500
    '#6366f1', // indigo-500
    '#f59e0b', // amber-500
    '#a855f7', // purple-500
  ],
  dark: [
    '#60a5fa', // blue-400
    '#a78bfa', // violet-400
    '#2dd4bf', // teal-400
    '#fb923c', // orange-400
    '#22d3ee', // cyan-400
    '#f472b6', // pink-400
    '#34d399', // emerald-400
    '#818cf8', // indigo-400
    '#fbbf24', // amber-400
    '#c084fc', // purple-400
  ],
}

// For the toolbar
const sceneRef = ref(null)
const displayedImage = computed(() => imageStore.displayedImage)
const isImageFocusLocked = computed(() => imageStore.isImageFocusLocked)

// Get colors based on the current theme
const chartColors = computed(() => {
  return colorMode.value === 'dark' ? colorPalettes.dark : colorPalettes.light
})

// Get attributes that aren't already shown
const availableBoxPlotAttributes = computed(() => {
  return imageStore.attributeItems.filter(attr => !visibleBoxPlots.value.includes(attr.value))
})

// Use the attribute chart data directly from the store
const groupedCharts = computed(() => {
  const allData = imageStore.attributeChartData

  // Filter to only include the attributes that are visible
  const result = {}
  visibleBoxPlots.value.forEach((attr) => {
    if (allData[attr]) {
      result[attr] = allData[attr]
    }
  })

  return result
})

// Add a new boxplot chart
function addBoxPlotChart(attribute) {
  if (!visibleBoxPlots.value.includes(attribute.value)) {
    visibleBoxPlots.value.push(attribute.value)
  }
}

// Remove a boxplot chart
function removeBoxPlotChart(attribute) {
  visibleBoxPlots.value = visibleBoxPlots.value.filter(attr => attr !== attribute)
}

// Add a new violin chart
function addViolinChart() {
  // Add a new chart with a unique ID (using timestamp or simple incrementing counter)
  const newId = violinCharts.value.length > 0
    ? Math.max(...violinCharts.value) + 1
    : 1
  violinCharts.value.push(newId)
}

// Remove a violin chart
function removeViolinChart(index) {
  // Remove the chart with the specific ID
  violinCharts.value = violinCharts.value.filter(id => id !== index)
}

// For toolbar functionality
function resetFocus() {
  if (sceneRef.value) {
    sceneRef.value.resetFocus()
  }
}

// Helper function to get a display name for the current image
function getDisplayName() {
  const id = imageStore.displayedId
  if (!id)
    return 'None'

  // If the image has a name property, use it
  const img = imageStore.displayedImage
  if (img && img.name)
    return img.name

  // Otherwise return the ID or a cleaned filename
  return id.split('/').pop() || id
}
</script>

<template>
  <v-app>
    <v-layout>
      <!-- Application Header -->
      <v-app-bar dense flat>
        <v-app-bar-nav-icon variant="text" @click.stop="drawerLeft = !drawerLeft" />
        <v-app-bar-title class="text-sm font-bold">
          DaedalusData
        </v-app-bar-title>
        <v-spacer />
        <v-btn variant="text" class="text-sm" to="/">
          Home
        </v-btn>
        <v-btn variant="text" class="text-sm" to="/analysis">
          Analysis
        </v-btn>
        <v-btn variant="text" class="text-sm" to="/test">
          Test
        </v-btn>
        <DarkToggle class="mr-4" />
        <v-app-bar-nav-icon variant="text" @click.stop="drawerRight = !drawerRight" />
      </v-app-bar>

      <!-- Left Navigation Drawer -->
      <v-navigation-drawer
        v-model="drawerLeft"
        permanent
        location="left"
        width="400"
        class="pa-0"
      >
        <v-list dense class="pa-0">
          <!-- Projection Selector -->
          <v-list-item class="pa-0">
            <v-card flat tile class="pa-0">
              <ProjectionSelector />
            </v-card>
          </v-list-item>
          <v-divider class="ma-0" />
          <!-- Label Alphabet Manager -->
          <v-list-item class="pa-0">
            <v-card flat tile class="pa-0">
              <LabelAlphabetManager />
            </v-card>
          </v-list-item>
        </v-list>
      </v-navigation-drawer>

      <!-- Main Content -->
      <v-main>
        <div class="relative h-full">
          <slot />
          <!-- Small toolbar at the bottom for status info -->
          <div class="bottom-toolbar border-t border-gray-300 px-4 py-2 dark:border-gray-700 dark:bg-gray-800">
            <div class="flex items-center justify-between">
              <div class="flex items-center">
                <span v-if="displayedImage" class="mr-4 text-sm">
                  <strong>Current image:</strong> {{ getDisplayName() }}
                </span>

                <span v-if="isImageFocusLocked" class="rounded-full bg-blue-100 px-2 py-1 text-sm dark:bg-blue-900">
                  Locked (press ESC to unlock)
                </span>
              </div>

              <div class="flex gap-3">
                <button
                  class="rounded bg-gray-200 px-3 py-1 text-sm dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600"
                  @click="imageStore.toggleDetailWindow()"
                >
                  {{ imageStore.isDetailWindowOpen() ? 'Close' : 'Show' }} Detail Window
                </button>

                <button
                  v-if="isImageFocusLocked"
                  class="rounded bg-gray-200 px-3 py-1 text-sm dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600"
                  @click="resetFocus"
                >
                  Unlock (ESC)
                </button>
              </div>
            </div>
          </div>
        </div>
      </v-main>

      <!-- Right Navigation Drawer -->
      <v-navigation-drawer
        v-model="drawerRight"
        permanent
        location="right"
        width="400"
        class="pa-0"
      >
        <v-card flat>
          <v-tabs v-model="activeTab" grow>
            <v-tab value="0">
              Counts
            </v-tab>
            <v-tab value="1">
              Distributions
            </v-tab>
          </v-tabs>

          <v-window v-model="activeTab">
            <!-- Count Charts Tab -->
            <v-window-item value="0">
              <div class="scrollable p-2">
                <!-- Add Chart Button -->
                <div class="mb-4 flex justify-center">
                  <AddChartDialog
                    chart-type="boxplot"
                    :available-attributes="availableBoxPlotAttributes"
                    @add-chart="addBoxPlotChart"
                  />
                </div>

                <!-- No charts message -->
                <div v-if="visibleBoxPlots.length === 0" class="py-8 text-center text-gray-500">
                  <v-icon color="grey" size="large">
                    mdi-chart-bell-curve
                  </v-icon>
                  <p class="mt-2">
                    Click "Add Chart" to visualize attribute counts.
                  </p>
                </div>

                <!-- Box plot charts -->
                <template v-for="attribute in visibleBoxPlots" :key="attribute">
                  <ChartWrapper
                    :title="attribute"
                    :show-remove-button="true"
                    @remove="removeBoxPlotChart(attribute)"
                  >
                    <BoxPlotChart
                      v-if="groupedCharts[attribute]"
                      :data="groupedCharts[attribute]"
                      x-label=""
                      y-label="Count"
                      :colors="chartColors"
                      :aspect-ratio="2"
                    />
                    <div v-else class="py-4 text-center text-gray-500">
                      No data available for this attribute
                    </div>
                  </ChartWrapper>
                </template>
              </div>
            </v-window-item>

            <!-- Distribution Analysis Tab -->
            <v-window-item value="1">
              <div class="scrollable p-2">
                <!-- Add Violin Chart Button -->
                <div class="mb-4 flex justify-center">
                  <AddChartDialog
                    chart-type="violin"
                    @add-chart="addViolinChart"
                  />
                </div>

                <!-- No charts message -->
                <div v-if="violinCharts.length === 0" class="py-8 text-center text-gray-500">
                  <v-icon color="grey" size="large">
                    mdi-chart-bell-curve
                  </v-icon>
                  <p class="mt-2">
                    Click "Add Chart" to visualize attribute counts.
                  </p>
                </div>

                <!-- Violin charts -->
                <template v-for="chartId in violinCharts" :key="`violin-${chartId}`">
                  <ChartWrapper
                    :title="`Distribution Analysis ${chartId}`"
                    :show-remove-button="true"
                    @remove="removeViolinChart(chartId)"
                  >
                    <TwoAttributeViolinPlot
                      :data="imageStore.selectedImages"
                      :color-mode="colorMode"
                      :show-violin="true"
                      :show-box-plot="true"
                      :show-data-points="false"
                    />
                  </ChartWrapper>
                </template>
              </div>
            </v-window-item>
          </v-window>
        </v-card>
      </v-navigation-drawer>
    </v-layout>
  </v-app>
</template>

<style scoped>
.bottom-toolbar {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  z-index: 5;
}
</style>
