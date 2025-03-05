import { acceptHMRUpdate, defineStore } from 'pinia'
import { v4 as uuidv4 } from 'uuid'

export interface Label {
  id: string
  value: string
  color: string
  description?: string
  images?: string[]
}

export interface LabelAlphabet {
  id: string
  name: string
  description?: string
  labels: Label[]
  isOpen?: boolean
}

export interface LabelManifest {
  alphabets: string[]
}

export const useLabelStore = defineStore('labels', () => {
  // --- State ---
  const manifest = ref([] as string[])
  const alphabets = ref([] as LabelAlphabet[])
  const selectedLabelId = ref<string | null>(null)
  const highlightedLabelIds = ref(new Set<string>())
  const selectedAlphabetId = ref<string | null>(null)
  const instanceToImageMap = ref(new Map<number, string>())
  const imageToInstanceMap = ref(new Map<string, number>())

  // --- Computed ---
  const highlightedLabels = computed(() => {
    const result: Record<string, { color: string, instanceIds: number[] }> = {}

    for (const labelId of highlightedLabelIds.value) {
      const label = alphabets.value.flatMap(a => a.labels).find(l => l.id === labelId)
      if (label) {
        const imageIds = label.images || []
        const instanceIds: number[] = []

        for (const imageId of imageIds) {
          const instanceId = imageToInstanceMap.value.get(imageId)
          if (instanceId !== undefined) {
            instanceIds.push(instanceId)
          }
        }
        result[labelId] = { color: label.color, instanceIds }
      }
    }

    return result
  })

  const selectedLabel = computed(() => {
    if (!selectedLabelId.value || !selectedAlphabetId.value)
      return null
    const alphabet = alphabets.value.find(a => a.id === selectedAlphabetId.value)
    if (!alphabet)
      return null
    return alphabet.labels.find(l => l.id === selectedLabelId.value) || null
  })

  // --- Loading Actions ---
  async function loadManifest() {
    try {
      const response = await fetch('/data/labels/label_manifest.json')
      if (!response.ok) {
        throw new Error('Failed to load label manifest, please create a new alphabet first.')
      }
      const data: LabelManifest = await response.json()
      manifest.value = data.alphabets
    }
    catch (error) {
      console.error(error)
      manifest.value = []
    }
  }

  async function loadAlphabets() {
    alphabets.value = []
    for (const filename of manifest.value) {
      try {
        const response = await fetch(`/data/labels/${filename}`)
        if (!response.ok) {
          throw new Error(`Failed to load ${filename}`)
        }
        const alphabet: LabelAlphabet = await response.json()
        alphabets.value.push(alphabet)
      }
      catch (error) {
        console.error(error)
      }
    }
  }

  // --- Persistence Actions ---
  async function saveManifest() {
    console.log('Saving manifest:', { alphabets: manifest.value })
    try {
      await fetch('/api/labels/manifest', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ alphabets: manifest.value }),
      })
      console.log('Manifest saved')
    }
    catch (error) {
      console.error('Error saving manifest:', error)
    }
  }

  async function saveAlphabet(alphabet: LabelAlphabet, filename?: string) {
    const fileToSave = filename || `alphabet_${alphabet.id}.json`
    console.log('Saving alphabet:', alphabet, 'to', fileToSave)
    try {
      await fetch(`/api/labels/${fileToSave}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(alphabet),
      })
    }
    catch (error) {
      console.error('Error saving alphabet:', error)
    }
  }

  // --- CRUD Actions for Alphabets and Labels ---
  async function addAlphabet(alphabet: LabelAlphabet) {
    // Generate an ID if not already provided.
    if (!alphabet.id) {
      alphabet.id = uuidv4()
    }
    alphabet.labels = alphabet.labels || []
    alphabet.isOpen = true
    alphabets.value.push(alphabet)
    const filename = `alphabet_${alphabet.id}.json`
    manifest.value.push(filename)
    await saveManifest()
    await saveAlphabet(alphabet, filename)
  }

  async function removeAlphabet(alphabetId: string) {
    const filename = `alphabet_${alphabetId}.json`
    try {
      // Send DELETE request to API endpoint to remove the file.
      const response = await fetch(`/api/labels/${filename}`, {
        method: 'DELETE',
      })
      if (!response.ok) {
        throw new Error(`Failed to delete ${filename} on the server.`)
      }
      // Remove the alphabet from local state.
      alphabets.value = alphabets.value.filter(a => a.id !== alphabetId)
      // Remove the filename from the manifest.
      manifest.value = manifest.value.filter(f => f !== filename)
      // Update the manifest on the server.
      await saveManifest()
      console.log(`Alphabet ${alphabetId} removed successfully.`)
    }
    catch (error: any) {
      console.error('Error removing alphabet:', error)
    }
  }

  async function addLabel(alphabetId: string, label: Label) {
    const alphabet = alphabets.value.find(a => a.id === alphabetId)
    if (!alphabet)
      return
    // Generate a new label id.
    label.id = uuidv4()
    // Initialize images array if not present
    label.images = label.images || []
    alphabet.labels.push(label)
    await saveAlphabet(alphabet)
  }

  async function removeLabel(alphabetId: string, labelId: string) {
    const alphabet = alphabets.value.find(a => a.id === alphabetId)
    if (!alphabet)
      return
    alphabet.labels = alphabet.labels.filter(l => l.id !== labelId)
    await saveAlphabet(alphabet)
  }

  async function moveLabel(labelId: string, sourceAlphabetId: string, targetAlphabetId: string) {
    const source = alphabets.value.find(a => a.id === sourceAlphabetId)
    const target = alphabets.value.find(a => a.id === targetAlphabetId)
    if (!source || !target)
      return
    const label = source.labels.find(l => l.id === labelId)
    if (!label)
      return
    source.labels = source.labels.filter(l => l.id !== labelId)
    target.labels.push(label)
    await saveAlphabet(source)
    await saveAlphabet(target)
  }

  async function addLabelToAlphabet(label: Label, alphabetId: string) {
    await addLabel(alphabetId, label)
  }

  // --- Label Highlighting ---
  function highlightLabel(labelId: string) {
    if (highlightedLabelIds.value.has(labelId)) {
      highlightedLabelIds.value.delete(labelId)
    }
    else {
      highlightedLabelIds.value.add(labelId)
    }
  }

  function clearLabelHighlight() {
    highlightedLabelIds.value.clear()
  }

  // --- Label Selection ---
  function selectLabel(alphabetId: string, labelId: string) {
    selectedAlphabetId.value = alphabetId
    selectedLabelId.value = labelId
  }

  function clearLabelSelection() {
    selectedAlphabetId.value = null
    selectedLabelId.value = null
  }

  // --- Image Assignment ---
  async function addImagesToLabel(alphabetId: string, labelId: string, imageIds: string[]) {
    const alphabet = alphabets.value.find(a => a.id === alphabetId)
    if (!alphabet)
      return

    const label = alphabet.labels.find(l => l.id === labelId)
    if (!label)
      return

    // Initialize images array if not present
    if (!label.images) {
      label.images = []
    }

    // Add new image IDs (avoiding duplicates)
    const uniqueImageIds = imageIds.filter(id => !label.images?.includes(id))
    if (uniqueImageIds.length === 0)
      return

    label.images = [...label.images, ...uniqueImageIds]

    // Save the updated alphabet
    await saveAlphabet(alphabet)
  }

  async function addSelectedImagesToLabel() {
    if (!selectedLabelId.value || !selectedAlphabetId.value)
      return

    const imageStore = useImageStore()
    const selectedImageIds = Array.from(imageStore.selectedIds)

    if (selectedImageIds.length === 0)
      return

    await addImagesToLabel(selectedAlphabetId.value, selectedLabelId.value, selectedImageIds)
  }

  async function removeSelectedImagesFromLabel() {
    if (!selectedLabelId.value || !selectedAlphabetId.value)
      return

    const imageStore = useImageStore()
    const selectedImageIds = Array.from(imageStore.selectedIds)

    if (selectedImageIds.length === 0)
      return

    const alphabet = alphabets.value.find(a => a.id === selectedAlphabetId.value)
    if (!alphabet)
      return

    const label = alphabet.labels.find(l => l.id === selectedLabelId.value)
    if (!label || !label.images)
      return

    label.images = label.images.filter(id => !selectedImageIds.includes(id))

    await saveAlphabet(alphabet)
  }

  async function removeImageFromLabel(alphabetId: string, labelId: string, imageId: string) {
    const alphabet = alphabets.value.find(a => a.id === alphabetId)
    if (!alphabet)
      return

    const label = alphabet.labels.find(l => l.id === labelId)
    if (!label || !label.images)
      return

    label.images = label.images.filter(id => id !== imageId)

    await saveAlphabet(alphabet)
  }

  // --- Get Images for a Label ---
  function getLabelImages(alphabetId: string, labelId: string): string[] {
    const alphabet = alphabets.value.find(a => a.id === alphabetId)
    if (!alphabet)
      return []

    const label = alphabet.labels.find(l => l.id === labelId)
    if (!label || !label.images)
      return []

    return label.images
  }

  return {
    manifest,
    alphabets,
    selectedLabelId,
    selectedAlphabetId,
    selectedLabel,
    highlightedLabelIds,
    loadManifest,
    loadAlphabets,
    saveManifest,
    saveAlphabet,
    addAlphabet,
    removeAlphabet,
    addLabel,
    removeLabel,
    moveLabel,
    addLabelToAlphabet,
    selectLabel,
    clearLabelSelection,
    highlightLabel,
    clearLabelHighlight,
    addImagesToLabel,
    addSelectedImagesToLabel,
    removeSelectedImagesFromLabel,
    removeImageFromLabel,
    getLabelImages,
    highlightedLabels,
    instanceToImageMap,
    imageToInstanceMap,
  }
})

if (import.meta.hot)
  import.meta.hot.accept(acceptHMRUpdate(useLabelStore, import.meta.hot))
