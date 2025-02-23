import { acceptHMRUpdate, defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { v4 as uuidv4 } from 'uuid'

export interface Label {
  id: string
  value: string
  color?: string
  description?: string
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

  // --- Loading Actions ---
  async function loadManifest() {
    try {
      const response = await fetch('/data/labels/label_manifest.json')
      if (!response.ok) {
        throw new Error('Failed to load label manifest, please create a new alphabet first.')
      }
      const data: LabelManifest = await response.json()
      manifest.value = data.alphabets
    } catch (error) {
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
      } catch (error) {
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
    } catch (error) {
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
    } catch (error) {
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
        method: 'DELETE'
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
    } catch (error: any) {
      console.error('Error removing alphabet:', error)
    }
  }

  async function addLabel(alphabetId: string, label: Label) {
    const alphabet = alphabets.value.find(a => a.id === alphabetId)
    if (!alphabet) return
    // Generate a new label id.
    label.id = uuidv4()
    alphabet.labels.push(label)
    await saveAlphabet(alphabet)
  }

  async function removeLabel(alphabetId: string, labelId: string) {
    const alphabet = alphabets.value.find(a => a.id === alphabetId)
    if (!alphabet) return
    alphabet.labels = alphabet.labels.filter(l => l.id !== labelId)
    await saveAlphabet(alphabet)
  }

  async function moveLabel(labelId: string, sourceAlphabetId: string, targetAlphabetId: string) {
    const source = alphabets.value.find(a => a.id === sourceAlphabetId)
    const target = alphabets.value.find(a => a.id === targetAlphabetId)
    if (!source || !target) return
    const label = source.labels.find(l => l.id === labelId)
    if (!label) return
    source.labels = source.labels.filter(l => l.id !== labelId)
    target.labels.push(label)
    await saveAlphabet(source)
    await saveAlphabet(target)
  }

  async function addLabelToAlphabet(label: Label, alphabetId: string) {
    await addLabel(alphabetId, label)
  }

  return {
    manifest,
    alphabets,
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
  }
})

if (import.meta.hot)
  import.meta.hot.accept(acceptHMRUpdate(useLabelStore, import.meta.hot))
