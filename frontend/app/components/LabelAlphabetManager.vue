<script setup lang="ts">
import { v4 as uuidv4 } from 'uuid'

// Store and theme initialization
const labelStore = useLabelStore()
const imageStore = useImageStore()

// UI state management
const showForm = ref(false)
const isEditing = ref(false)
const formType = ref<'Label Alphabet' | 'Label'>('Label Alphabet')
const formState = ref({ name: '', description: '', color: '#000000', alphabetId: '' })
const editingItem = ref<any>(null)

// Drag and drop state
const isDragging = ref(false)
const dragData = ref<{ label: any, sourceAlphabetId: string } | null>(null)

// Feedback message management
const feedback = ref('')
const showFeedback = ref(false)
const feedbackTimeout = ref<number | null>(null)

// Computed properties
const hasSelectedImages = computed(() => imageStore.selectedIds.size > 0)
const selectedImagesCount = computed(() => imageStore.selectedIds.size)
const alphabetOptions = computed(() =>
  labelStore.alphabets.map(a => ({ title: a.name, value: a.id })),
)

// Watch for selected label changes
watch(() => labelStore.selectedLabel, (newValue) => {
  if (newValue)
    showAssignFeedback()
})

// Alphabet management
function toggleAlphabet(alphabetId: string) {
  const alphabet = labelStore.alphabets.find(a => a.id === alphabetId)
  if (alphabet)
    alphabet.isOpen = !alphabet.isOpen
}

// Form handling functions
function openAddAlphabet() {
  isEditing.value = false
  formType.value = 'Label Alphabet'
  formState.value = { name: '', description: '', color: '#000000', alphabetId: '' }
  showForm.value = true
}

function openAddLabel(alphabetId?: string) {
  isEditing.value = false
  formType.value = 'Label'
  formState.value = { name: '', description: '', color: '#000000', alphabetId: alphabetId || '' }
  showForm.value = true
}

function openEditAlphabet(alphabet: any) {
  isEditing.value = true
  formType.value = 'Label Alphabet'
  editingItem.value = alphabet
  formState.value = {
    name: alphabet.name,
    description: alphabet.description || '',
    color: '',
    alphabetId: '',
  }
  showForm.value = true
}

function openEditLabel(label: any, alphabetId: string) {
  isEditing.value = true
  formType.value = 'Label'
  editingItem.value = { label, alphabetId }
  formState.value = {
    name: label.value,
    description: label.description || '',
    color: label.color || '#000000',
    alphabetId,
  }
  showForm.value = true
}

async function submitForm() {
  if (formType.value === 'Label Alphabet') {
    if (isEditing.value && editingItem.value) {
      // Update existing alphabet
      const index = labelStore.alphabets.findIndex(a => a.id === editingItem.value.id)
      if (index !== -1) {
        labelStore.alphabets[index].name = formState.value.name
        labelStore.alphabets[index].description = formState.value.description
        await labelStore.saveAlphabet(labelStore.alphabets[index], `alphabet_${editingItem.value.id}.json`)
      }
    }
    else {
      // Create new alphabet
      const newAlphabet = {
        id: uuidv4(),
        name: formState.value.name,
        description: formState.value.description,
        labels: [],
        isOpen: true,
      }
      await labelStore.addAlphabet(newAlphabet)
    }
  }
  else if (formType.value === 'Label') {
    if (isEditing.value && editingItem.value) {
      // Update existing label
      const { label, alphabetId } = editingItem.value
      const alphabet = labelStore.alphabets.find(a => a.id === alphabetId)
      if (alphabet) {
        const labelIndex = alphabet.labels.findIndex((l: any) => l.id === label.id)
        if (labelIndex !== -1) {
          alphabet.labels[labelIndex].value = formState.value.name
          alphabet.labels[labelIndex].description = formState.value.description
          alphabet.labels[labelIndex].color = formState.value.color
          await labelStore.saveAlphabet(alphabet, `alphabet_${alphabet.id}.json`)
        }
      }
    }
    else {
      // Create new label
      if (!formState.value.alphabetId) {
        alert('Please select an alphabet.')
        return
      }
      const newLabel = {
        id: uuidv4(),
        value: formState.value.name,
        description: formState.value.description,
        color: formState.value.color,
      }
      await labelStore.addLabel(formState.value.alphabetId, newLabel)
    }
  }
  showForm.value = false
}

function cancelForm() {
  showForm.value = false
}

// Drag and drop handling
function onDragStart(e: DragEvent, label: any, sourceAlphabetId: string) {
  dragData.value = { label, sourceAlphabetId }
  e.dataTransfer?.setData('text/plain', JSON.stringify({ labelId: label.id, sourceAlphabetId }))
}

function onDragOver(e: DragEvent) {
  e.preventDefault()
}

async function onDrop(e: DragEvent, targetAlphabetId: string) {
  e.preventDefault()
  isDragging.value = false
  if (dragData.value) {
    const { label, sourceAlphabetId } = dragData.value
    if (sourceAlphabetId !== targetAlphabetId) {
      await labelStore.moveLabel(label.id, sourceAlphabetId, targetAlphabetId)
    }
    dragData.value = null
  }
}

function onDragEnd() {
  isDragging.value = false
  dragData.value = null
}

// Label selection handling
function selectLabel(label: any, alphabetId: string, event: MouseEvent) {
  // Skip selection if close button was clicked
  if ((event.target as HTMLElement).closest('.v-chip__close')) {
    return
  }

  const isSelected = labelStore.selectedLabelId === label.id
    && labelStore.selectedAlphabetId === alphabetId

  if (isSelected) {
    labelStore.clearLabelSelection()
  }
  else {
    labelStore.selectLabel(alphabetId, label.id)
    showAssignFeedback()
  }

  event.stopPropagation()
}

function isLabelSelected(label: any, alphabetId: string): boolean {
  return labelStore.selectedLabelId === label.id
    && labelStore.selectedAlphabetId === alphabetId
}

// Image assignment functions
async function assignSelectedImages() {
  if (!labelStore.selectedLabel)
    return

  await labelStore.addSelectedImagesToLabel()

  showFeedback.value = true
  feedback.value = `✓ Added ${selectedImagesCount.value} images to "${labelStore.selectedLabel.value}"`

  if (feedbackTimeout.value)
    clearTimeout(feedbackTimeout.value)
  feedbackTimeout.value = window.setTimeout(() => {
    showFeedback.value = false
  }, 3000)
}

function showAssignFeedback() {
  if (!labelStore.selectedLabel || !hasSelectedImages.value)
    return

  showFeedback.value = true
  feedback.value = `${selectedImagesCount.value} images ready to assign to "${labelStore.selectedLabel.value}"`

  if (feedbackTimeout.value)
    clearTimeout(feedbackTimeout.value)
  feedbackTimeout.value = window.setTimeout(() => {
    showFeedback.value = false
  }, 5000)
}

// Load data on component mount
onMounted(async () => {
  await labelStore.loadManifest()
  await labelStore.loadAlphabets()
})
</script>

<template>
  <v-card outlined class="m-auto max-w-600px">
    <v-card-title class="text-h6 justify-space-between align-center">
      <span>Label Alphabet Manager</span>
    </v-card-title>

    <v-card-text class="m-0 p-1">
      <v-container fluid>
        <!-- Assignment button -->
        <v-row class="justify-center">
          <v-btn
            v-if="labelStore.selectedLabel && hasSelectedImages"
            color="success"
            size="small"
            @click="assignSelectedImages"
          >
            Assign {{ selectedImagesCount }} Images
          </v-btn>
        </v-row>

        <!-- Alphabet containers -->
        <div
          v-for="alphabet in labelStore.alphabets"
          :key="alphabet.id"
          class="mb-2 overflow-hidden rounded-md"
        >
          <!-- Alphabet header -->
          <div
            class="flex cursor-pointer select-none items-center rounded-md px-2 py-2 transition-all duration-200 hover:bg-gray-100/40"
            @click="toggleAlphabet(alphabet.id)"
          >
            <v-icon size="small" class="mr-2">
              {{ alphabet.isOpen ? 'mdi-chevron-down' : 'mdi-chevron-right' }}
            </v-icon>
            <div class="flex-grow-1">
              <v-tooltip location="bottom">
                <template #activator="{ props }">
                  <span v-bind="props" class="font-bold">{{ alphabet.name }}</span>
                </template>
                <span>
                  <strong>{{ alphabet.name }}</strong><br>
                  {{ alphabet.description }}
                </span>
              </v-tooltip>
            </div>
            <div class="flex items-center">
              <v-btn icon size="x-small" @click.stop="openEditAlphabet(alphabet)">
                <v-icon size="small">
                  mdi-pencil
                </v-icon>
              </v-btn>
              <v-btn icon size="x-small" @click.stop="labelStore.removeAlphabet(alphabet.id)">
                <v-icon size="small" color="red">
                  mdi-delete
                </v-icon>
              </v-btn>
            </div>
          </div>

          <!-- Labels container -->
          <div
            v-if="alphabet.isOpen"
            class="mt-1 min-h-40px flex flex-wrap items-start rounded-md bg-gray-100/10 p-2 transition-all duration-200"
            :class="{ 'bg-gray-100/20 border border-dashed border-gray-300': isDragging }"
            @dragover.prevent="onDragOver"
            @drop="onDrop($event, alphabet.id)"
            @dragenter="isDragging = true"
            @dragleave="isDragging = false"
          >
            <!-- Label chips -->
            <v-chip
              v-for="label in alphabet.labels"
              :key="label.id"
              :color="label.color || 'grey lighten-2'"
              :variant="isLabelSelected(label, alphabet.id) ? 'elevated' : 'flat'"
              class="m-1 transition-all duration-100 hover:translate-y-[-1px] hover:transform hover:shadow-sm"
              :class="{ 'font-bold shadow-primary': isLabelSelected(label, alphabet.id) }"
              close
              :draggable="true"
              @click.left="selectLabel(label, alphabet.id, $event)"
              @click.right.prevent="menu = false"
              @click.right="labelStore.highlightLabel(label.id)"
              @click:close="labelStore.removeLabel(alphabet.id, label.id)"
              @dblclick="openEditLabel(label, alphabet.id)"
              @dragstart="onDragStart($event, label, alphabet.id)"
              @dragend="onDragEnd"
            >
              <v-tooltip location="bottom">
                <template #activator="{ props }">
                  <span v-bind="props">
                    {{ label.value }}
                    <v-icon v-if="isLabelSelected(label, alphabet.id)" size="x-small" class="ml-1">
                      mdi-check-circle
                    </v-icon>
                  </span>
                </template>
                <span>
                  <strong>{{ label.value }}</strong><br>
                  {{ label.description }}<br>
                  <template v-if="label.images && label.images.length > 0">
                    {{ label.images.length }} images assigned
                  </template>
                  <template v-else>
                    No images assigned
                  </template>
                </span>
              </v-tooltip>
            </v-chip>

            <!-- Empty state message -->
            <div
              v-if="!alphabet.labels || alphabet.labels.length === 0"
              class="w-full p-2 text-center text-sm text-gray-500 italic"
            >
              No labels yet - drag and drop labels here
            </div>
          </div>
        </div>
      </v-container>

      <!-- Action buttons -->
      <v-row class="mb-2 mt-2" justify="center">
        <v-btn size="small" @click="openAddLabel()">
          Add Label
        </v-btn>
        <v-btn class="mb-2 ml-2" color="primary" size="small" @click="openAddAlphabet">
          Add Alphabet
        </v-btn>
      </v-row>

      <!-- Feedback message -->
      <v-row class="mt-5 justify-center">
        <v-fade-transition>
          <v-chip
            v-if="showFeedback"
            color="info"
            class="mr-2"
          >
            {{ feedback }}
          </v-chip>
        </v-fade-transition>
      </v-row>
    </v-card-text>

    <!-- Edit/Add dialog -->
    <v-dialog v-model="showForm" max-width="500px">
      <v-card>
        <v-card-title class="text-h6">
          {{ isEditing ? 'Edit' : 'Add' }} {{ formType }}
        </v-card-title>
        <v-card-text>
          <v-text-field v-model="formState.name" label="Name" density="compact" />
          <v-textarea v-model="formState.description" label="Description" density="compact" />
          <v-text-field
            v-if="formType === 'Label'"
            v-model="formState.color"
            label="Color"
            type="color"
            density="compact"
          />
          <v-select
            v-if="formType === 'Label' && !isEditing"
            v-model="formState.alphabetId"
            :items="alphabetOptions"
            label="Select Alphabet"
            density="compact"
          />
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn variant="text" color="primary" @click="submitForm">
            Save
          </v-btn>
          <v-btn variant="text" color="grey" @click="cancelForm">
            Cancel
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </v-card>
</template>

<style scoped>
/* Custom shadow for selected labels - can't be easily done with UnoCSS */
.shadow-primary {
  box-shadow: 0 0 0 2px rgba(var(--v-theme-primary), 0.8);
}

/* Active grabbing cursor */
[draggable='true']:active {
  cursor: grabbing;
}
</style>
