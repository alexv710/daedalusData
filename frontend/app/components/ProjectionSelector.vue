<script setup lang="ts">
import { useImageStore } from '@/stores/imageStore'
import { onMounted, ref } from 'vue'

const imageStore = useImageStore()
const selectedProjection = ref('')

onMounted(async () => {
  await imageStore.loadProjections()
  if (imageStore.availableProjections.length) {
    selectedProjection.value = imageStore.availableProjections[0]
    imageStore.selectProjection(selectedProjection.value)
  }
})

function onSelect(value: string) {
  selectedProjection.value = value
  imageStore.selectProjection(value)
}
</script>

<template>
  <v-card outlined class="ma-0 pa-0" max-width="300">
    <v-card-title class="text-h6 ma-0 pa-1">
      Projection
    </v-card-title>
    <v-card-text class="ma-0 pa-1">
      <v-select
        v-model="selectedProjection"
        dense
        hide-details
        label="Select Projection"
        :items="imageStore.availableProjections"
        clearable
        @update:model-value="onSelect"
        class="ma-0 pa-0"
      />
    </v-card-text>
  </v-card>
</template>
