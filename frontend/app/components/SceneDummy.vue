<script setup lang="ts">
import * as THREE from 'three'
import { ref, onMounted, onUnmounted, watch } from 'vue'


const sceneRef = shallowRef<THREE.Scene>(null)
const controlsRef = shallowRef<THREE.Control>(null)
const cameraRef = shallowRef<THREE.Camera>(null)
const rendererRef = shallowRef<THREE.WebGLRenderer | null>(null)


const { setupControls } = useThree()

const props = defineProps({
  width: { type: Number, required: true },
  height: { type: Number, required: true },
  offsetX: { type: Number, default: 0 },
})

const canvasRef = ref<HTMLCanvasElement | null>(null)
let cube: THREE.Mesh

const init = () => {
  sceneRef.value = new THREE.Scene()
  cameraRef.value = new THREE.PerspectiveCamera(75, props.width / props.height, 0.1, 1000)
  rendererRef.value = new THREE.WebGLRenderer({ canvas: canvasRef.value as HTMLCanvasElement })

  rendererRef.value.setSize(props.width, props.height)

  const geometry = new THREE.BoxGeometry()
  const material = new THREE.MeshBasicMaterial({ color: 0x00ff00, wireframe: true })
  cube = new THREE.Mesh(geometry, material)
  sceneRef.value.add(cube)

  cameraRef.value.position.z = 5


  controlsRef.value = setupControls(cameraRef.value, rendererRef.value.domElement, sceneRef.value)
}

const animate = () => {
  requestAnimationFrame(animate)

  cube.rotation.x += 0.01
  cube.rotation.y += 0.01

  rendererRef.value.render(sceneRef.value, cameraRef.value)
}

const handleResize = () => {
  if (cameraRef.value && rendererRef.value) {
    cameraRef.value.aspect = props.width / props.height
    cameraRef.value.updateProjectionMatrix()
    rendererRef.value.setSize(props.width, props.height)
  }
}

const updatePosition = () => {
  if (canvasRef.value) {
    canvasRef.value.style.position = 'absolute'
    canvasRef.value.style.left = `${props.offsetX}px`
  }
}

onMounted(() => {
  init()
  animate()
  updatePosition()
})

onUnmounted(() => {
  if (rendererRef.value) {
    rendererRef.value.dispose()
  }
  if (cube) {
    cube.geometry.dispose()
    if (cube.material instanceof THREE.Material) {
      cube.material.dispose()
    }
  }
})

watch([() => props.width, () => props.height], handleResize)
watch(() => props.offsetX, updatePosition)

defineExpose({
  handleResize,
  updatePosition,
})
</script>

<template>
  <canvas ref="canvasRef"></canvas>
</template>
