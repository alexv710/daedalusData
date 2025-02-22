<script setup>
const imageStore = useImageStore()
const availableProjections = ref([])
const selectedProjection = ref(null)

onMounted(async () => {
  // Load available projections from the store.
  await imageStore.loadProjections()
  availableProjections.value = imageStore.availableProjections
  // Set the default selection to the first available projection.
  if (availableProjections.value.length) {
    selectedProjection.value = availableProjections.value[0]
    imageStore.selectProjection(selectedProjection.value)
  }
})

// When the selection changes, update the store.
function onSelect(value) {
  imageStore.selectProjection(value)
}
</script>

<template>
  <v-card outlined class="ma-4 pa-4">
    <v-card-title>Select Projection</v-card-title>
    <v-card-text>
      <v-select
        label="Projection"
        :items="availableProjections"
        v-model="selectedProjection"
        @update:modelValue="onSelect"
        clearable
      ></v-select>
    </v-card-text>
  </v-card>
</template>
