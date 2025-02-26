<script setup lang="ts">
import { ref } from 'vue'

defineProps({
  title: {
    type: String,
    required: true,
  },
  showRemoveButton: {
    type: Boolean,
    default: false,
  },
})

defineEmits(['remove'])

const isOpen = ref(true)
</script>

<template>
  <div class="mb-3 overflow-hidden border border-gray-200 rounded-md dark:border-gray-700">
    <div
      class="flex cursor-pointer select-none items-center justify-between rounded-md bg-gray-50 px-3 py-2 transition-all duration-200 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700"
      @click="isOpen = !isOpen"
    >
      <div class="flex items-center">
        <v-icon size="small" class="mr-2">
          {{ isOpen ? 'mdi-chevron-down' : 'mdi-chevron-right' }}
        </v-icon>
        <span class="font-medium">{{ title }}</span>
      </div>

      <div class="flex items-center">
        <v-btn
          v-if="showRemoveButton"
          icon="mdi-close"
          size="small"
          variant="text"
          color="error"
          class="mr-1"
          @click.stop="$emit('remove')"
        />
      </div>
    </div>

    <v-expand-transition>
      <div v-if="isOpen" class="p-3">
        <slot />
      </div>
    </v-expand-transition>
  </div>
</template>
