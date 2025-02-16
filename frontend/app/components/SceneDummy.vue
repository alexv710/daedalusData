<script setup lang="ts">
import * as THREE from 'three'
import { ArcballControls } from 'three/addons/controls/ArcballControls.js'
import { defineExpose, defineProps, onMounted, onUnmounted, ref, shallowRef, watch } from 'vue'
import { useImageStore } from '~/stores/imageStore'

// ----- Props and Refs -----
const props = defineProps({
  width: { type: Number, required: true },
  height: { type: Number, required: true },
  offsetX: { type: Number, default: 0 },
})
// ----- Pinia Store Integration -----
// Load image metadata into the store.
const imageStore = useImageStore()
await imageStore.loadImageMetadata()

// Build mapping from instance index to image key.
const instanceToKeyMap = new Map<string, string>()
const imageKeys = Array.from(imageStore.images.keys())
imageKeys.forEach((key, i) => {
  instanceToKeyMap.set(i, key)
})
console.log('Instance to key map:', instanceToKeyMap)

const canvas = ref<HTMLCanvasElement | null>(null)
const cameraRef = ref<THREE.PerspectiveCamera | null>(null)
const rendererRef = ref<THREE.WebGLRenderer | null>(null)
const sceneRef = shallowRef<THREE.Scene | null>(null)
const instancedMeshRef = shallowRef<THREE.InstancedMesh | null>(null)

// ----- Additional State for Interaction -----
const lassoDrawing = ref(false)
const lassoDepthPoints = ref<number[]>([])
const isDragging = ref(false)
const dragThreshold = 5 // pixels

// ----- Resize Handling -----
function handleResize() {
  if (cameraRef.value && rendererRef.value) {
    console.log('Resizing scene to:', props.width, props.height)
    cameraRef.value.aspect = props.width / props.height
    cameraRef.value.updateProjectionMatrix()
    rendererRef.value.setSize(props.width, props.height)
  }
}
watch(() => [props.width, props.height], () => {
  handleResize()
})

// ----- Shader Code -----
const vertexShader = `
attribute vec4 instanceUV;
attribute float instanceHighlight;
attribute float instanceAspectRatio;
attribute vec3 instancePosition;
varying vec2 vUV;
varying float vHighlight;
varying vec2 vDimensions;
void main() {
    vUV = instanceUV.xy + instanceUV.zw * uv;
    vHighlight = instanceHighlight;
    float width = max(1.0, instanceAspectRatio);
    float height = max(1.0, 1.0 / instanceAspectRatio);
    vDimensions = vec2(width, height);
    vec3 scaledPosition = position * vec3(width, height, 1.0);
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
    vec4 texColor = texture2D(map, vUV);
    float adjustedHighlight = vHighlight * highlightIntensity;
    vec3 finalColor = mix(texColor.rgb, highlightColor, adjustedHighlight);
    gl_FragColor = vec4(finalColor, texColor.a);
}
`

// ----- Instanced Mesh Creation -----
function createInstancedMesh(atlasTexture: THREE.Texture, atlasData: any): THREE.InstancedMesh {
  const atlasInfoArray = Object.entries(atlasData).map(([filename, info]) => ({
    filename,
    ...info,
  }))
  const count = atlasInfoArray.length
  const geometry = new THREE.PlaneGeometry(1, 1)
  const instanceUVs = new Float32Array(count * 4)
  const instanceHighlights = new Float32Array(count)
  const instanceAspectRatios = new Float32Array(count)
  const instancePositions = new Float32Array(count * 3)
  for (let i = 0; i < count; i++) {
    const info = atlasInfoArray[i]
    const uvX = info.x / atlasTexture.image.width
    const uvWidth = info.width / atlasTexture.image.width
    const uvHeight = info.height / atlasTexture.image.height
    const uvH = -uvHeight // flip vertically
    const uvY = info.y / atlasTexture.image.height - uvH
    instanceUVs.set([uvX, uvY, uvWidth, uvH], i * 4)
    instanceHighlights[i] = 0.0
    instanceAspectRatios[i] = info.width / info.height
    instancePositions[i * 3] = (Math.random() - 0.5) * 50 + props.offsetX
    instancePositions[i * 3 + 1] = (Math.random() - 0.5) * 50
    instancePositions[i * 3 + 2] = 0
  }
  geometry.setAttribute('instanceUV', new THREE.InstancedBufferAttribute(instanceUVs, 4))
  geometry.setAttribute('instanceHighlight', new THREE.InstancedBufferAttribute(instanceHighlights, 1))
  geometry.setAttribute('instanceAspectRatio', new THREE.InstancedBufferAttribute(instanceAspectRatios, 1))
  geometry.setAttribute('instancePosition', new THREE.InstancedBufferAttribute(instancePositions, 3))
  const material = new THREE.ShaderMaterial({
    uniforms: {
      map: { value: atlasTexture },
      highlightColor: { value: new THREE.Color(0xFF0000) },
      highlightIntensity: { value: 0.5 },
    },
    vertexShader,
    fragmentShader,
    transparent: true,
  })
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

// ----- Controls Setup -----
function setupControls(camera: THREE.Camera, rendererElement: HTMLElement, scene: THREE.Scene): ArcballControls {
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

// ----- Raycasting & Lasso Handling -----
const raycaster = new THREE.Raycaster()
const mouseVec = new THREE.Vector2(1, 1)
const frustum = new THREE.Frustum()
const projScreenMatrix = new THREE.Matrix4()
const boundingBox = new THREE.Box3()
const instancePosition = new THREE.Vector3()
const instanceScale = new THREE.Vector3()
const localIntersection = new THREE.Vector3()
const DEBUG_LASSO = 'true'
const debugConvexHullMesh = shallowRef<THREE.Mesh | null>(null)

// Update mouse vector.
function updateMouse(event: MouseEvent) {
  event.preventDefault()
  const rect = rendererRef.value?.domElement.getBoundingClientRect()
  if (rect) {
    mouseVec.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
    mouseVec.y = -((event.clientY - rect.top) / rect.height) * 2 + 1
  }
}

// Helper to update instance highlight.
function setInstanceHighlight(mesh: THREE.InstancedMesh, index: number, value: number) {
  const attribute = mesh.geometry.getAttribute('instanceHighlight')
  attribute.setX(index, value)
  attribute.needsUpdate = true
}

// Reusable variables for raycasting.
const lastHovered = { index: -1, mesh: null }

// Main function to update hovered mesh or selection.
function updateHoveredMesh(
  interactionType: 'hover' | 'left-click' | 'right-click' | 'lasso',
  isControlPressed: boolean,
  lassoDepthPoints?: number[],
  scene?: THREE.Scene,
) {
  if (!cameraRef.value) {
    console.warn('Camera is null, skipping raycasting')
    return
  }
  // --- Lasso Mode ---
  if (interactionType === 'lasso' && lassoDepthPoints && lassoDepthPoints.length >= 18) {
    if (!scene) {
      console.warn('Scene is null, skipping lasso raycasting')
      return
    }
    if (debugConvexHullMesh.value) {
      scene.remove(debugConvexHullMesh.value)
      debugConvexHullMesh.value.geometry.dispose()
      debugConvexHullMesh.value.material.dispose()
      debugConvexHullMesh.value = null
    }
    const selectedInstances: { mesh: THREE.InstancedMesh, instanceId: number }[] = []
    const nearPoints: THREE.Vector3[] = []
    const farPoints: THREE.Vector3[] = []
    for (let i = 0; i < lassoDepthPoints.length; i += 6) {
      nearPoints.push(new THREE.Vector3(
        lassoDepthPoints[i],
        lassoDepthPoints[i + 1],
        lassoDepthPoints[i + 2],
      ))
      farPoints.push(new THREE.Vector3(
        lassoDepthPoints[i + 3],
        lassoDepthPoints[i + 4],
        lassoDepthPoints[i + 5],
      ))
    }
    const geometry = new THREE.BufferGeometry()
    const vertices = []
    const indices = []
    nearPoints.forEach(p => vertices.push(p.x, p.y, p.z))
    farPoints.forEach(p => vertices.push(p.x, p.y, p.z))
    const numPoints = nearPoints.length
    for (let i = 0; i < numPoints; i++) {
      const nextI = (i + 1) % numPoints
      indices.push(i, nextI, i + numPoints)
      indices.push(nextI, nextI + numPoints, i + numPoints)
      indices.push(i, i + numPoints, nextI)
      indices.push(nextI, i + numPoints, nextI + numPoints)
    }
    geometry.setIndex(indices)
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3))
    geometry.computeVertexNormals()
    console.log('Debug lasso:', DEBUG_LASSO)
    if (DEBUG_LASSO) {
      const material = new THREE.MeshBasicMaterial({
        color: 0xD9EAD3,
        transparent: true,
        opacity: 0.2,
        side: THREE.DoubleSide,
      })
      debugConvexHullMesh.value = new THREE.Mesh(geometry, material)
      scene.add(debugConvexHullMesh.value)
      console.log('Lasso debug mesh added to scene', debugConvexHullMesh.value)
    }
    const tempVector = new THREE.Vector3()
    const tempMatrix = new THREE.Matrix4()
    // Traverse all instanced meshes in the scene.
    const allMeshes: THREE.InstancedMesh[] = []
    scene?.traverse((obj) => {
      if (obj instanceof THREE.InstancedMesh) {
        allMeshes.push(obj)
      }
    })
    allMeshes.forEach((mesh) => {
      for (let instanceId = 0; instanceId < mesh.count; instanceId++) {
        mesh.getMatrixAt(instanceId, tempMatrix)
        tempVector.setFromMatrixPosition(tempMatrix)
        if (isPointInLassoVolume(tempVector, nearPoints, farPoints)) {
          selectedInstances.push({ mesh, instanceId })
        }
      }
    })
    console.log(`Lasso selected ${selectedInstances.length} instances`)
    // Update selection: clear if ctrl not pressed; else add.
    if (!isControlPressed) {
      imageStore.images.forEach((meta, key) => {
        meta.selected = false
      })
    }
    selectedInstances.forEach(({ mesh, instanceId }) => {
      const key = instanceToKeyMap.get(instanceId)
      if (key) {
        const meta = imageStore.images.get(key)
        if (meta)
          meta.selected = true
      }
    })
    allMeshes.forEach((mesh) => {
      for (let instanceId = 0; instanceId < mesh.count; instanceId++) {
        const key = instanceToKeyMap.get(instanceId)
        const meta = key ? imageStore.images.get(key) : null
        const highlight = meta && meta.selected ? 1 : 0
        setInstanceHighlight(mesh, instanceId, highlight)
      }
    })
  }
  // --- Standard Raycasting (Hover/Click) ---
  else {
    let closestIntersection = Infinity
    let closestMesh: THREE.InstancedMesh | null = null
    let closestInstanceId = -1
    scene?.traverse((obj) => {
      if (obj instanceof THREE.InstancedMesh) {
        const mesh = obj
        const instanceCount = mesh.count
        const matrix = new THREE.Matrix4()
        const aspectRatios = mesh.geometry.attributes.instanceAspectRatio
        for (let instanceId = 0; instanceId < instanceCount; instanceId++) {
          mesh.getMatrixAt(instanceId, matrix)
          matrix.decompose(instancePosition, new THREE.Quaternion(), instanceScale)
          if (!frustum.containsPoint(instancePosition))
            continue
          const aspectRatio = aspectRatios.getX(instanceId)
          const width = Math.max(1, aspectRatio) * instanceScale.x
          const height = Math.max(1, 1 / aspectRatio) * instanceScale.y
          boundingBox.setFromCenterAndSize(instancePosition, new THREE.Vector3(width, height, 0.01))
          if (raycaster.ray.intersectsBox(boundingBox)) {
            const plane = new THREE.Plane()
            plane.setFromNormalAndCoplanarPoint(
              new THREE.Vector3(0, 0, 1).applyQuaternion(new THREE.Quaternion().setFromRotationMatrix(matrix)),
              instancePosition,
            )
            const intersection = new THREE.Vector3()
            const intersected = raycaster.ray.intersectPlane(plane, intersection)
            if (intersected) {
              const distance = intersection.distanceTo(cameraRef.value!.position)
              if (distance < closestIntersection) {
                localIntersection.copy(intersection).applyMatrix4(matrix.invert())
                if (Math.abs(localIntersection.x) <= width / 2 && Math.abs(localIntersection.y) <= height / 2) {
                  closestIntersection = distance
                  closestMesh = mesh
                  closestInstanceId = instanceId
                }
              }
            }
          }
        }
      }
    })
    // Update camera matrix and frustum.
    cameraRef.value!.updateMatrixWorld(true)
    projScreenMatrix.multiplyMatrices(cameraRef.value!.projectionMatrix, cameraRef.value!.matrixWorldInverse)
    frustum.setFromProjectionMatrix(projScreenMatrix)
    raycaster.setFromCamera(mouseVec, cameraRef.value!)
    if (lastHovered.index !== -1 && lastHovered.mesh) {
      setInstanceHighlight(lastHovered.mesh, lastHovered.index, 0)
      lastHovered.index = -1
      lastHovered.mesh = null
    }
    if (closestMesh && closestInstanceId !== -1) {
      switch (interactionType) {
        case 'hover': {
          setInstanceHighlight(closestMesh, closestInstanceId, 1)
          const key = instanceToKeyMap.get(closestInstanceId)
          if (key) {
            const meta = imageStore.images.get(key)
          }
          lastHovered.index = closestInstanceId
          lastHovered.mesh = closestMesh
          break
        }
        case 'left-click': {
          setInstanceHighlight(closestMesh, closestInstanceId, 1)
          const key = instanceToKeyMap.get(closestInstanceId)
          if (key) {
            const meta = imageStore.images.get(key)
            if (meta) {
              meta.selected = !meta.selected
              console.log('Left-click toggled selection:', meta)
            }
          }
          lastHovered.index = closestInstanceId
          lastHovered.mesh = closestMesh
          break
        }
        case 'right-click':
          console.log('Right-click interaction detected')
          break
      }
    }
  }
}

// Helper: determine if a point is inside the lasso volume.
function isPointInLassoVolume(point: THREE.Vector3, nearPoints: THREE.Vector3[], farPoints: THREE.Vector3[]): boolean {
  const numPoints = nearPoints.length
  let inside = false
  const ray = new THREE.Ray(point, new THREE.Vector3(0, 0, 1))
  const target = new THREE.Vector3()
  for (let i = 0, j = numPoints - 1; i < numPoints; j = i++) {
    const a1 = nearPoints[i]; const a2 = farPoints[i]
    const b1 = nearPoints[j]; const b2 = farPoints[j]
    if (!a1 || !a2 || !b1 || !b2) {
      console.warn('Undefined point in lasso volume check', { i, j, a1, a2, b1, b2 })
      continue
    }
    try {
      if (ray.intersectTriangle(a1, a2, b1, false, target) || ray.intersectTriangle(a2, b2, b1, false, target)) {
        inside = !inside
      }
    }
    catch (error) {
      console.error('Error in ray intersection', error, { i, j, a1, a2, b1, b2 })
    }
  }
  return inside
}

// ----- Mouse Event Handlers -----
// For hover and left-click, we distinguish click from drag.
const leftClickStartPos = ref<THREE.Vector2 | null>(null)

function handleMouseDown(event: MouseEvent) {
  // If left button, record start position.
  if (event.button === 0) {
    leftClickStartPos.value = new THREE.Vector2(event.clientX, event.clientY)
    isDragging.value = false
  }
  // If right button with ctrl pressed, enter lasso mode.
  if (event.button === 2 && event.ctrlKey) {
    lassoDrawing.value = true
    lassoDepthPoints.value = [] // reset
    // Prevent the context menu.
    event.preventDefault()
  }
}

function handleMouseMove(event: MouseEvent) {
  updateMouse(event)
  // If we are in lasso drawing mode, record depth points.
  if (lassoDrawing.value && cameraRef.value) {
    // Compute near and far points for the current mouse coordinates.
    const mouseNear = new THREE.Vector3(mouseVec.x, mouseVec.y, 0)
    const mouseFar = new THREE.Vector3(mouseVec.x, mouseVec.y, 1)
    mouseNear.unproject(cameraRef.value)
    mouseFar.unproject(cameraRef.value)
    // Append 6 numbers (near.x, near.y, near.z, far.x, far.y, far.z)
    lassoDepthPoints.value.push(
      mouseNear.x,
      mouseNear.y,
      mouseNear.z,
      mouseFar.x,
      mouseFar.y,
      mouseFar.z,
    )
  }
  // For left click, detect dragging.
  if (event.button === 0 && leftClickStartPos.value) {
    const currentPos = new THREE.Vector2(event.clientX, event.clientY)
    if (currentPos.distanceTo(leftClickStartPos.value) > dragThreshold) {
      isDragging.value = true
    }
  }
  // Also, if not in lasso mode and not dragging, process hover.
  if (!lassoDrawing.value && !isDragging.value) {
    updateHoveredMesh('hover', event.ctrlKey, undefined, sceneRef.value!)
  }
}

function handleMouseUp(event: MouseEvent) {
  // If in lasso mode (right button + ctrl) and mouse up, finish lasso.
  if (lassoDrawing.value && event.button === 2) {
    updateHoveredMesh('lasso', event.ctrlKey, lassoDepthPoints.value, sceneRef.value!)
    lassoDrawing.value = false
    lassoDepthPoints.value = []
  }
  // If left button was clicked and not dragged, toggle selection.
  if (event.button === 0 && !isDragging.value) {
    updateHoveredMesh('left-click', event.ctrlKey, undefined, sceneRef.value!)
  }
  // Reset left click start.
  leftClickStartPos.value = null
  isDragging.value = false
}

// ----- Main onMounted Block -----
onMounted(async () => {
  console.log('Creating scene with dimensions:', props.width, props.height)
  if (props.width <= 0 || props.height <= 0) {
    console.error('Invalid scene dimensions:', props.width, props.height)
    return
  }
  const scene = new THREE.Scene()
  sceneRef.value = scene
  const camera = new THREE.PerspectiveCamera(75, props.width / props.height, 0.1, 1000)
  camera.position.z = 50
  cameraRef.value = camera
  const renderer = new THREE.WebGLRenderer({ canvas: canvas.value, antialias: true })
  renderer.setSize(props.width, props.height)
  rendererRef.value = renderer
  const controls = setupControls(camera, renderer.domElement, scene)
  try {
    const response = await fetch('/data/atlas.json')
    if (!response.ok)
      throw new Error('Failed to fetch atlas.json')
    const atlasData = await response.json()
    console.log('Fetched atlas data:', atlasData)
    const textureLoader = new THREE.TextureLoader()
    textureLoader.load(
      '/data/atlas.png',
      (texture) => {
        texture.flipY = false
        console.log('Atlas texture loaded:', texture)
        const instancedMesh = createInstancedMesh(texture, atlasData)
        instancedMeshRef.value = instancedMesh
        scene.add(instancedMesh)
      },
      undefined,
      (error) => {
        console.error('Error loading texture:', error)
      },
    )
  }
  catch (err) {
    console.error('Error fetching atlas data:', err)
  }
  window.addEventListener('resize', handleResize)
  canvas.value?.addEventListener('mousedown', handleMouseDown)
  canvas.value?.addEventListener('mousemove', handleMouseMove)
  canvas.value?.addEventListener('mouseup', handleMouseUp)
  // Prevent context menu on right click.
  canvas.value?.addEventListener('contextmenu', e => e.preventDefault())
  function animate() {
    requestAnimationFrame(animate)
    controls.update()
    renderer.render(scene, camera)
  }
  animate()
})

onUnmounted(() => {
  window.removeEventListener('resize', handleResize)
  canvas.value?.removeEventListener('mousedown', handleMouseDown)
  canvas.value?.removeEventListener('mousemove', handleMouseMove)
  canvas.value?.removeEventListener('mouseup', handleMouseUp)
})

defineExpose({
  handleResize,
  updateMouse,
  updateHoveredMesh,
})
</script>

<template>
  <canvas ref="canvas" />
</template>

<style scoped>
canvas {
  display: block;
  width: 100%;
  height: 100%;
}
</style>
