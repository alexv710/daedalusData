<script setup lang="ts">
const drawerLeft = ref(true)
const drawerRight = ref(true)

const imageStore = useImageStore()

// Compute the data for the boxplot chart.
const groupedCharts = computed(() => {
  const groups: Record<string, Record<string, number>> = {}

  // Loop over each selected image
  imageStore.selectedImages.forEach((img) => {
    if (!img) return
    // For every property in the image, except name or id
    Object.keys(img).forEach((key) => {
      if (key === 'name' || key === 'id') return
      const value = img[key] ?? 'unknown'
      if (!groups[key]) groups[key] = {}
      groups[key][value] = (groups[key][value] || 0) + 1
    })
  })

  // Convert the counts for each attribute into an array suitable for the chart
  const result: Record<string, Array<{ value: string; count: number }>> = {}
  Object.keys(groups).forEach((attribute) => {
    result[attribute] = Object.entries(groups[attribute]).map(([val, count]) => ({
      value: val,
      count,
    }))
  })
  return result
})

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
        width="300"
        class="scrollable pa-0"
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
        <slot />
      </v-main>

      <!-- Right Navigation Drawer -->
      <v-navigation-drawer
        v-model="drawerRight"
        permanent
        location="right"
        class="pa-0"
      >
        <div
          v-for="(data, attribute) in groupedCharts"
          :key="attribute"
          class="mb-6"
        >
          <h3 class="text-lg font-bold mb-2">{{ attribute }}</h3>
          <BoxPlotChart 
            :data="data" 
            xLabel="Value" 
            yLabel="Count" 
          />
        </div>
      </v-navigation-drawer>
    </v-layout>
  </v-app>
</template>

<style scoped>
.scrollable {
  overflow-y: auto;
}
</style>
