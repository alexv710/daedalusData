<script setup>
const imageStore = useImageStore()

const searchQuery = ref('')
const showActiveOnly = ref(false)
const expandedPanels = ref([])

const filteredAttributes = computed(() => {
  let attrs = imageStore.availableAttributes

  if (searchQuery.value) {
    const query = searchQuery.value.toLowerCase()
    attrs = attrs.filter(attr => attr.toLowerCase().includes(query))
  }

  if (showActiveOnly.value) {
    attrs = attrs.filter(attr => imageStore.activeFilters[attr]?.active)
  }

  return attrs
})

const hasActiveFilters = computed(() =>
  Object.values(imageStore.activeFilters).some(filter => filter.active),
)

const activeFilterCount = computed(() =>
  Object.values(imageStore.activeFilters).filter(filter => filter.active).length,
)

function formatNumber(value) {
  if (value === undefined || value === null)
    return '-'
  return Number(value).toLocaleString(undefined, { maximumFractionDigits: 2 })
}

function onRangeChange(attribute, values) {
  imageStore.updateNumericFilter(attribute, values[0], values[1])
}

// Helper to check for null value in array with safe comparison
function containsNull(arr) {
  return arr.includes(null)
}

// Helper to check for string "null" value
function containsNullString(arr) {
  return arr.includes('null')
}

function onCategoryChange(attribute, newSelection) {
  const currentSelection = [...imageStore.activeFilters[attribute].selected]
  const hadNull = containsNull(currentSelection)
  const hadNullString = containsNullString(currentSelection)
  const hasNullNow = containsNull(newSelection)
  const hasNullStringNow = containsNullString(newSelection)

  if (newSelection.length < currentSelection.length) {
    const removed = currentSelection.filter(item => !newSelection.includes(item))
    const nullWasExplicitlyRemoved = containsNull(removed)
    const nullStringWasExplicitlyRemoved = containsNullString(removed)

    // If null was in original and was not explicitly removed, keep it
    if (hadNull && !nullWasExplicitlyRemoved && !hasNullNow) {
      newSelection.push(null)
    }

    if (hadNullString && !nullStringWasExplicitlyRemoved && !hasNullStringNow) {
      newSelection.push('null')
    }
  }
  imageStore.updateCategoricalFilter(attribute, newSelection)
}

function isAllSelected(attribute) {
  const filter = imageStore.activeFilters[attribute]
  if (!filter || !filter.values || !filter.selected)
    return false
  return filter.values.length === filter.selected.length
}

function onSelectAllChange(attribute, isSelected) {
  if (isSelected) {
    const allValues = [...imageStore.activeFilters[attribute].values]
    imageStore.updateCategoricalFilter(attribute, allValues)
  }
  else {
    imageStore.updateCategoricalFilter(attribute, [])
  }
}

function resetAllFilters() {
  imageStore.resetFilters()
}

function resetFilter(attribute) {
  imageStore.resetFilter(attribute)
}

watch(() => imageStore.totalImages, (newVal) => {
  if (newVal > 0 && Object.keys(imageStore.activeFilters).length === 0) {
    imageStore.initializeFilters()
  }
})

onMounted(() => {
  if (imageStore.totalImages > 0 && Object.keys(imageStore.activeFilters).length === 0) {
    imageStore.initializeFilters()
  }
})
</script>

<template>
  <v-card class="max-h-screen overflow-y-auto" elevation="2">
    <v-card-title class="flex items-center justify-between">
      <span>Filters</span>
      <div class="flex items-center">
        <v-badge
          v-if="activeFilterCount > 0"
          color="primary"
          :content="activeFilterCount.toString()"
          location="top end"
        >
          <v-btn
            density="compact"
            size="small"
            :disabled="!hasActiveFilters"
            class="mr-2"
            color="error"
            variant="text"
            @click="resetAllFilters"
          >
            Reset All
          </v-btn>
        </v-badge>
        <span v-else>
          <v-btn
            density="compact"
            size="small"
            :disabled="!hasActiveFilters"
            class="mr-2"
            color="error"
            variant="text"
            @click="resetAllFilters"
          >
            Reset All
          </v-btn>
        </span>
      </div>
    </v-card-title>

    <v-divider />

    <v-card-text class="pt-3">
      <div class="mb-3 flex items-center">
        <v-text-field
          v-model="searchQuery"
          density="compact"
          hide-details
          placeholder="Search filters..."
          prepend-icon="mdi-magnify"
          variant="outlined"
          class="mr-2"
        />

        <v-checkbox
          v-model="showActiveOnly"
          density="compact"
          hide-details
          label="Active only"
        />
      </div>

      <v-alert
        v-if="imageStore.filteredImageCount !== imageStore.totalImages"
        density="compact"
        type="info"
        variant="tonal"
        class="text-body-2 mb-3"
      >
        Showing {{ imageStore.filteredImageCount }} of {{ imageStore.totalImages }} images
      </v-alert>

      <div v-if="filteredAttributes.length === 0" class="text-body-2 py-3 text-center text-gray">
        No filters match your search
      </div>

      <v-expansion-panels
        v-model="expandedPanels"
        variant="accordion"
        multiple
      >
        <v-expansion-panel
          v-for="attr in filteredAttributes"
          :key="attr"
          :value="attr"
          class="filter-panel relative"
          :class="{ 'active-filter': imageStore.activeFilters[attr]?.active }"
        >
          <v-expansion-panel-title>
            <div class="flex items-center justify-between">
              <span class="capitalize">{{ attr }}</span>
              <v-chip
                v-if="imageStore.activeFilters[attr]?.active"
                size="x-small"
                color="primary"
                class="ml-2"
              >
                Active
              </v-chip>
            </div>
          </v-expansion-panel-title>

          <v-expansion-panel-text>
            <template v-if="imageStore.activeFilters[attr]?.type === 'numeric'">
              <div class="text-caption mb-1 flex justify-between">
                <span>{{ formatNumber(imageStore.activeFilters[attr].currentMin) }}</span>
                <span>{{ formatNumber(imageStore.activeFilters[attr].currentMax) }}</span>
              </div>

              <v-range-slider
                :model-value="[
                  imageStore.activeFilters[attr].currentMin,
                  imageStore.activeFilters[attr].currentMax,
                ]"
                :min="imageStore.activeFilters[attr].min"
                :max="imageStore.activeFilters[attr].max"
                :step="(imageStore.activeFilters[attr].max - imageStore.activeFilters[attr].min) / 100"
                density="compact"
                color="primary"
                hide-details
                @update:model-value="onRangeChange(attr, $event)"
              />
            </template>

            <template v-else-if="imageStore.activeFilters[attr]?.type === 'categorical'">
              <div class="max-h-200px overflow-y-auto">
                <!-- Add Select All checkbox -->
                <v-checkbox
                  :model-value="isAllSelected(attr)"
                  label="Select All"
                  hide-details
                  density="compact"
                  class="font-weight-bold mb-1"
                  @update:model-value="onSelectAllChange(attr, $event)"
                />
                <v-divider class="my-1" />
                <!-- Debug info - show count of selected items vs total -->
                <div class="text-caption mb-1">
                  Selected: {{ imageStore.activeFilters[attr]?.selected?.length || 0 }} /
                  {{ imageStore.activeFilters[attr]?.values?.length || 0 }}
                </div>
                <v-checkbox
                  v-for="value in imageStore.activeFilters[attr].values"
                  :key="value === null ? 'null-value' : String(value)"
                  :model-value="imageStore.activeFilters[attr].selected"
                  :value="value"
                  :label="value === null ? 'Empty (null)' : (value === 'null' ? 'String \'null\'' : (value || 'Empty string'))"
                  hide-details
                  density="compact"
                  @update:model-value="onCategoryChange(attr, $event)"
                />
              </div>
            </template>

            <div class="mt-2 text-right">
              <v-btn
                size="x-small"
                color="error"
                variant="text"
                :disabled="!imageStore.activeFilters[attr]?.active"
                @click="resetFilter(attr)"
              >
                Reset
              </v-btn>
            </div>
          </v-expansion-panel-text>
        </v-expansion-panel>
      </v-expansion-panels>
    </v-card-text>
  </v-card>
</template>

<style>
.active-filter {
  background-color: rgba(var(--v-theme-primary), 0.05);
}

.active-filter::before {
  content: '';
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 3px;
  background-color: rgb(var(--v-theme-primary));
}
</style>
