<script setup lang="ts">
import { useLabelStore } from '@/stores/labelStore'
import { v4 as uuidv4 } from 'uuid'
import { computed, onMounted, ref } from 'vue'

const labelStore = useLabelStore()

// Form state for adding/editing alphabets and labels.
const showForm = ref(false)
const isEditing = ref(false)
const formType = ref<'Label Alphabet' | 'Label'>('Label Alphabet')
const formState = ref({ name: '', description: '', color: '#000000', alphabetId: '' })
const editingItem = ref<any>(null)

const alphabetOptions = computed(() =>
  labelStore.alphabets.map(a => ({ title: a.name, value: a.id })),
)

function toggleAlphabet(alphabetId: string) {
  const alphabet = labelStore.alphabets.find(a => a.id === alphabetId)
  if (alphabet)
    alphabet.isOpen = !alphabet.isOpen
}

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
      // Update alphabet
      const index = labelStore.alphabets.findIndex(a => a.id === editingItem.value.id)
      if (index !== -1) {
        labelStore.alphabets[index].name = formState.value.name
        labelStore.alphabets[index].description = formState.value.description
        // Save update (store action may be expanded)
        await labelStore.saveAlphabet(labelStore.alphabets[index], `alphabet_${editingItem.value.id}.json`)
      }
    }
    else {
      // Create a new alphabet.
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
      // Update existing label.
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
      // Create a new label.
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

// --- Drag & Drop ---
const dragData = ref<{ label: any, sourceAlphabetId: string } | null>(null)

function onDragStart(e: DragEvent, label: any, sourceAlphabetId: string) {
  dragData.value = { label, sourceAlphabetId }
  e.dataTransfer?.setData('text/plain', JSON.stringify({ labelId: label.id, sourceAlphabetId }))
}

function onDragOver(e: DragEvent) {
  e.preventDefault()
}

async function onDrop(e: DragEvent, targetAlphabetId: string) {
  e.preventDefault()
  if (dragData.value) {
    const { label, sourceAlphabetId } = dragData.value
    if (sourceAlphabetId !== targetAlphabetId) {
      await labelStore.moveLabel(label.id, sourceAlphabetId, targetAlphabetId)
    }
    dragData.value = null
  }
}

function onDragEnd() {
  dragData.value = null
}

onMounted(async () => {
  await labelStore.loadManifest()
  await labelStore.loadAlphabets()
})
</script>

<template>
  <v-card outlined class="ma-0 pa-0" style="max-width:600px; margin:auto;">
    <v-card-title class="text-h6">
      Label Alphabet Manager
    </v-card-title>
    <v-card-text class="ma-0 pa-1">
      <v-container fluid>
        <v-row
          v-for="alphabet in labelStore.alphabets"
          :key="alphabet.id"
          class="mb-2 pa-1"
        >
          <v-col cols="12">
            <v-row class="align-center" no-gutters>
              <v-col cols="auto">
                <v-btn class="mr-1" @click="toggleAlphabet(alphabet.id)">
                  <template #prepend>
                    <v-icon small>
                      {{ alphabet.isOpen ? 'mdi-chevron-down' : 'mdi-chevron-right' }}
                    </v-icon>
                  </template>
                </v-btn>
              </v-col>
              <v-col>
                <v-tooltip bottom>
                  <template #activator="{ props }">
                    <span v-bind="props" class="font-weight-bold">{{ alphabet.name }}</span>
                  </template>
                  <span>
                    <strong>{{ alphabet.name }}</strong><br>
                    {{ alphabet.description }}
                  </span>
                </v-tooltip>
              </v-col>
              <v-col cols="auto">
                <v-btn icon small @click="openEditAlphabet(alphabet)">
                  <v-icon small>
                    mdi-pencil
                  </v-icon>
                </v-btn>
                <v-btn icon small @click="labelStore.removeAlphabet(alphabet.id)">
                  <v-icon small color="red">
                    mdi-delete
                  </v-icon>
                </v-btn>
              </v-col>
            </v-row>
            <v-row
              v-if="alphabet.isOpen"
              class="ml-4"
              @dragover="onDragOver"
              @drop="onDrop($event, alphabet.id)"
            >
              <v-col
                v-for="label in alphabet.labels"
                :key="label.id"
                cols="auto"
                draggable="true"
                @dragstart="onDragStart($event, label, alphabet.id)"
                @dragend="onDragEnd"
              >
                <v-tooltip bottom>
                  <template #activator="{ props }">
                    <v-chip
                      v-bind="props"
                      :color="label.color || 'grey lighten-2'"
                      class="ma-1"
                      close
                      @click:close="labelStore.removeLabel(alphabet.id, label.id)"
                      @click="openEditLabel(label, alphabet.id)"
                    >
                      {{ label.value }}
                    </v-chip>
                  </template>
                  <span>
                    <strong>{{ label.value }}</strong><br>
                    {{ label.description }}
                  </span>
                </v-tooltip>
              </v-col>
            </v-row>
          </v-col>
        </v-row>
      </v-container>
      <v-row class="mt-2" justify="center">
        <v-btn small @click="openAddLabel()">
          Add Label
        </v-btn>
        <v-btn class="mb-2" color="primary" small @click="openAddAlphabet">
          Add Alphabet
        </v-btn>
      </v-row>
    </v-card-text class="ma-0 pa-1">
    <v-dialog v-model="showForm" max-width="500px">
      <v-card>
        <v-card-title class="text-h6">
          {{ isEditing ? 'Edit' : 'Add' }} {{ formType }}
        </v-card-title>
        <v-card-text>
          <v-text-field v-model="formState.name" label="Name" dense />
          <v-textarea v-model="formState.description" label="Description" dense />
          <v-text-field
            v-if="formType === 'Label'"
            v-model="formState.color"
            label="Color"
            type="color"
            dense
          />
          <v-select
            v-if="formType === 'Label' && !isEditing"
            v-model="formState.alphabetId"
            :items="alphabetOptions"
            label="Select Alphabet"
            dense
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
