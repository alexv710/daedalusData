<template>
  <canvas ref="canvas"></canvas>
</template>

<script setup>
import * as THREE from 'three'
import { ArcballControls } from 'three/addons/controls/ArcballControls.js'

// Props to set scene dimensions and an optional horizontal offset.
const props = defineProps({
  width: { type: Number, required: true },
  height: { type: Number, required: true },
  offsetX: { type: Number, default: 0 },
})

// Refs for canvas, camera and renderer.
const canvas = ref(null)
const cameraRef = ref(null)
const rendererRef = ref(null)

// Resize handler: updates the camera aspect and renderer size.
const handleResize = () => {
  if (cameraRef.value && rendererRef.value) {
    console.log('Resizing scene to:', props.width, props.height)
    cameraRef.value.aspect = props.width / props.height
    cameraRef.value.updateProjectionMatrix()
    rendererRef.value.setSize(props.width, props.height)
  }
}

// Watch for changes in props dimensions.
watch(() => [props.width, props.height], () => {
  handleResize()
})

// --- Shader Code ---
const vertexShader = `
attribute vec4 instanceUV;
attribute float instanceHighlight;
attribute float instanceAspectRatio;
attribute vec3 instancePosition;
varying vec2 vUV;
varying float vHighlight;
varying vec2 vDimensions;

void main() {
    // Compute UV coordinates: add the local uv (from the plane) scaled by the sub-region size
    vUV = instanceUV.xy + instanceUV.zw * uv;
    vHighlight = instanceHighlight;
    
    // Compute dimensions based on the aspect ratio.
    float width = max(1.0, instanceAspectRatio);
    float height = max(1.0, 1.0 / instanceAspectRatio);
    vDimensions = vec2(width, height);
    
    // Scale the base plane geometry.
    vec3 scaledPosition = position * vec3(width, height, 1.0);
    
    // Use the instance matrix (set from instancePosition) to position the plane.
    vec4 worldPosition = instanceMatrix * vec4(scaledPosition, 1.0);
    gl_Position = projectionMatrix * modelViewMatrix * worldPosition;
}
`

const fragmentShader = `
uniform sampler2D map;
uniform vec3 highlightColor;
uniform float highlightIntensity;
varying vec2 vUV;
varying float vHighlight;
varying vec2 vDimensions;

void main() {
    // Sample the atlas using our computed UV coordinates.
    vec4 texColor = texture2D(map, vUV);
    float adjustedHighlight = vHighlight * highlightIntensity;
    vec3 finalColor = mix(texColor.rgb, highlightColor, adjustedHighlight);
    gl_FragColor = vec4(finalColor, texColor.a);
}
`

// --- Instanced Mesh Creation with Shader Attributes ---
/**
 * Creates an instanced mesh that uses the atlas texture and metadata so that each instance shows its own sub-image.
 *
 * @param {THREE.Texture} atlasTexture - The loaded atlas texture.
 * @param {object} atlasData - Atlas metadata object.
 * @returns {THREE.InstancedMesh}
 */
function createInstancedMesh(atlasTexture, atlasData) {
  // Convert atlasData object into an array.
  const atlasInfoArray = Object.entries(atlasData).map(([filename, info]) => ({
    filename,
    ...info,
  }))
  const count = atlasInfoArray.length

  // Create a simple plane geometry.
  const geometry = new THREE.PlaneGeometry(1, 1)

  // Create arrays for custom per-instance attributes.
  const instanceUVs = new Float32Array(count * 4)
  const instanceHighlights = new Float32Array(count)
  const instanceAspectRatios = new Float32Array(count)
  const instancePositions = new Float32Array(count * 3)

  // Compute per-instance data from atlas info.
  for (let i = 0; i < count; i++) {
    const info = atlasInfoArray[i]
    // Compute UV coordinates relative to the atlas.
    const uvX = info.x / atlasTexture.image.width
    const uvWidth = info.width / atlasTexture.image.width
    const uvHeight = info.height / atlasTexture.image.height
    const uvH = -uvHeight // Flip vertically.
    const uvY = info.y / atlasTexture.image.height - uvH
    instanceUVs.set([uvX, uvY, uvWidth, uvH], i * 4)
    instanceHighlights[i] = 0.0
    instanceAspectRatios[i] = info.width / info.height
    // For now, assign random positions.
    instancePositions[i * 3] = (Math.random() - 0.5) * 50
    instancePositions[i * 3 + 1] = (Math.random() - 0.5) * 50
    instancePositions[i * 3 + 2] = 0
  }

  // Attach custom attributes.
  geometry.setAttribute('instanceUV', new THREE.InstancedBufferAttribute(instanceUVs, 4))
  geometry.setAttribute('instanceHighlight', new THREE.InstancedBufferAttribute(instanceHighlights, 1))
  geometry.setAttribute('instanceAspectRatio', new THREE.InstancedBufferAttribute(instanceAspectRatios, 1))
  geometry.setAttribute('instancePosition', new THREE.InstancedBufferAttribute(instancePositions, 3))

  // Create a ShaderMaterial using our custom shaders.
  const material = new THREE.ShaderMaterial({
    uniforms: {
      map: { value: atlasTexture },
      highlightColor: { value: new THREE.Color(0xff0000) },
      highlightIntensity: { value: 0.5 },
    },
    vertexShader,
    fragmentShader,
    transparent: true,
  })

  // Create the instanced mesh.
  const instancedMesh = new THREE.InstancedMesh(geometry, material, count)
  const matrix = new THREE.Matrix4()
  for (let i = 0; i < count; i++) {
    const x = instancePositions[i * 3]
    const y = instancePositions[i * 3 + 1]
    const z = instancePositions[i * 3 + 2]
    matrix.makeTranslation(x, y, z)
    instancedMesh.setMatrixAt(i, matrix)
  }
  instancedMesh.instanceMatrix.needsUpdate = true

  return instancedMesh
}

// --- Controls Setup ---
/**
 * Sets up ArcballControls for the scene using your configuration.
 *
 * @param {THREE.Camera} camera
 * @param {HTMLElement} rendererElement
 * @param {THREE.Scene} scene
 * @returns {ArcballControls}
 */
function setupControls(camera, rendererElement, scene) {
  const controls = new ArcballControls(camera, rendererElement, scene)
  controls.unsetMouseAction(0, THREE.MOUSE.ROTATE)
  controls.unsetMouseAction(0, THREE.MOUSE.PAN, 'CTRL')
  controls.unsetMouseAction(0)
  controls.unsetMouseAction(1)
  controls.unsetMouseAction(1, 'SHIFT')
  controls.unsetMouseAction(2)
  controls.unsetMouseAction(0, 'CTRL')
  controls.unsetMouseAction('WHEEL', 'SHIFT')
  controls.unsetMouseAction('WHEEL')

  controls.setMouseAction('PAN', 0)
  controls.setMouseAction('ROTATE', 2)
  controls.setMouseAction('ZOOM', 'WHEEL')
  controls.cursorZoom = true
  controls.enableRotate = false
  controls.minDistance = 1
  controls.maxDistance = 100
  controls.enablePan = true
  controls.panSpeed = 0.5
  controls.setGizmosVisible(true)
  return controls
}

// --- Main onMounted Block ---
onMounted(async () => {
  console.log('Creating scene with dimensions:', props.width, props.height)
  if (props.width <= 0 || props.height <= 0) {
    console.error('Invalid scene dimensions:', props.width, props.height)
    return
  }

  // Set up scene, camera, and renderer.
  const scene = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera(75, props.width / props.height, 0.1, 1000)
  camera.position.z = 50

  const renderer = new THREE.WebGLRenderer({ canvas: canvas.value, antialias: true })
  renderer.setSize(props.width, props.height)

  // Save references for resizing.
  cameraRef.value = camera
  rendererRef.value = renderer

  // Set up ArcballControls.
  const controls = setupControls(camera, renderer.domElement, scene)

  // Fetch atlas metadata from /data/atlas.json.
  try {
    const response = await fetch('/data/atlas.json')
    if (!response.ok) throw new Error('Failed to fetch atlas.json')
    const atlasData = await response.json()
    console.log('Fetched atlas data:', atlasData)

    // Load the atlas texture from /data/atlas.png.
    const textureLoader = new THREE.TextureLoader()
    textureLoader.load(
      '/data/atlas.png',
      (texture) => {
        texture.flipY = false
        console.log('Atlas texture loaded:', texture)
        const instancedMesh = createInstancedMesh(texture, atlasData)
        scene.add(instancedMesh)
      },
      undefined,
      (error) => {
        console.error('Error loading texture:', error)
      }
    )
  } catch (err) {
    console.error('Error fetching atlas data:', err)
  }

  // Add window resize listener.
  window.addEventListener('resize', handleResize)

  // Animation loop.
  function animate() {
    requestAnimationFrame(animate)
    controls.update()
    renderer.render(scene, camera)
  }
  animate()
})

// Clean up the resize listener when the component unmounts.
onUnmounted(() => {
  window.removeEventListener('resize', handleResize)
})

// Expose handleResize if needed.
defineExpose({
  handleResize,
})
</script>

<style scoped>
canvas {
  display: block;
  width: 100%;
  height: 100%;
}
</style>
