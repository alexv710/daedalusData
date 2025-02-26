<script setup lang="ts">
const props = defineProps({
  availableAttributes: {
    type: Array,
    default: () => [],
  },
  chartType: {
    type: String,
    validator: value => ['boxplot', 'violin'].includes(value),
    required: true,
  },
})

const emit = defineEmits(['add-chart'])

const dialog = ref(false)
const selectedAttribute = ref(null)

// Function to handle button click
function handleButtonClick() {
  if (props.chartType === 'violin') {
    // For violin plots, directly add without showing the dialog
    emit('add-chart')
  } else {
    // For boxplots, open the dialog to select an attribute
    dialog.value = true
  }
}

function addChart() {
  if (selectedAttribute.value) {
    emit('add-chart', selectedAttribute.value)
    selectedAttribute.value = null
  }
  
  dialog.value = false
}
</script>

<template>
  <v-btn
    color="primary"
    size="small"
    prepend-icon="mdi-plus"
    class="mb-3 mt-2"
    @click="handleButtonClick"
  >
    Add Chart
  </v-btn>

  <!-- Only show dialog for boxplot charts -->
  <v-dialog v-model="dialog" max-width="500">
    <v-card>
      <v-card-title class="text-h6">
        Add New Count Chart
      </v-card-title>

      <v-card-text>
        <v-select
          v-model="selectedAttribute"
          :items="availableAttributes"
          label="Select Attribute"
          variant="outlined"
          density="compact"
          return-object
          class="mb-4"
        />
      </v-card-text>

      <v-card-actions>
        <v-spacer />
        <v-btn
          variant="text"
          @click="dialog = false"
        >
          Cancel
        </v-btn>
        <v-btn
          color="primary"
          variant="flat"
          :disabled="!selectedAttribute"
          @click="addChart"
        >
          Add
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>