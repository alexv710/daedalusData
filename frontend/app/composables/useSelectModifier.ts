// Name of the key that adds to the image selection: Cmd on macOS, Ctrl elsewhere.
// Resolved after mount so the server-rendered markup matches the first client render.
export function useSelectModifier() {
  const selectModifier = ref('Ctrl')

  onMounted(() => {
    if (/Mac|iPhone|iPad/.test(navigator.platform)) {
      selectModifier.value = 'Cmd'
    }
  })

  return selectModifier
}
