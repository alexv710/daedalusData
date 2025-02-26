<script setup lang="ts">
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
  <v-card outlined class="ma-0 pa-0" style="max-width:600px; margin:auto;">
    <v-card-title class="justify-space-between align-center text-h6">
      <span>Projection</span>
    </v-card-title>
    <v-card-text class="ma-0 pa-1">
      <v-select
        v-model="selectedProjection"
        dense
        hide-details
        label="Select Projection"
        :items="imageStore.availableProjections"
        class="ma-0 pa-0"
        @update:model-value="onSelect"
      />
    </v-card-text>
  </v-card>
</template>
