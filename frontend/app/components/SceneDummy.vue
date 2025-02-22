<script setup lang="ts">
import * as THREE from 'three'
import { ArcballControls } from 'three/addons/controls/ArcballControls.js'

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
Array.from(imageStore.images.keys()).forEach((key, i) => {
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

// NEW: Lasso shape drawing state
const lassoShapePoints = ref<THREE.Vector3[]>([])
const lassoShapeMesh = shallowRef<THREE.Mesh | null>(null)

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
    const uvH = -uvHeight
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

// Utility: 2D point–in–polygon test (ray–casting algorithm)
function pointInPolygon(point, polygon) {
  let inside = false
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].x, yi = polygon[i].y
    const xj = polygon[j].x, yj = polygon[j].y
    const intersect = ((yi > point.y) !== (yj > point.y)) &&
      (point.x < (xj - xi) * (point.y - yi) / (yj - yi) + xi)
    if (intersect) inside = !inside
  }
  return inside
}

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
  // --- Lasso Mode: Only update on mouseup ---
  if (interactionType === 'lasso' && lassoDepthPoints && lassoDepthPoints.length >= 18) {
    if (!scene) {
      console.warn('Scene is null, skipping lasso raycasting')
      return
    }
    
    console.time('Lasso Total Time')
    
    // Build a 2D lasso polygon by projecting the lasso shape points.
    console.time('Build Lasso Polygon')
    const lassoPolygon = lassoShapePoints.value.map(pt => {
      const projected = pt.clone().project(cameraRef.value!)
      return {
        x: (projected.x + 1) * 0.5 * props.width,
        y: (-projected.y + 1) * 0.5 * props.height,
      }
    })
    console.timeEnd('Build Lasso Polygon')
    
    console.time('Traverse Instanced Meshes')
    const allMeshes: THREE.InstancedMesh[] = []
    scene.traverse((obj) => {
      if (obj instanceof THREE.InstancedMesh) {
        allMeshes.push(obj)
      }
    })
    console.timeEnd('Traverse Instanced Meshes')

    console.time('Accumulate Selected Keys')
    const selectedKeys = new Set<string>()
    const tempMatrix = new THREE.Matrix4()
    const instancePos = new THREE.Vector3()
    allMeshes.forEach((mesh) => {
      for (let instanceId = 0; instanceId < mesh.count; instanceId++) {
        mesh.getMatrixAt(instanceId, tempMatrix)
        tempMatrix.decompose(instancePos, new THREE.Quaternion(), new THREE.Vector3())
        const screenPos = instancePos.clone().project(cameraRef.value!)
        const sx = (screenPos.x + 1) * 0.5 * props.width
        const sy = (-screenPos.y + 1) * 0.5 * props.height
        if (pointInPolygon({ x: sx, y: sy }, lassoPolygon)) {
          const key = instanceToKeyMap.get(instanceId)
          if (key) selectedKeys.add(key)
        }
      }
    })
    console.timeEnd('Accumulate Selected Keys')
    
    console.time('Batch Update Selection')
    // If Ctrl is not held, replace the current selection; if it is held, add to it.
    if (!isControlPressed) {
      console.log('Clearing selection')
      imageStore.clearSelection()
    }
    imageStore.batchSelect(selectedKeys)
    console.timeEnd('Batch Update Selection')

    console.time('Update Highlights')
    // For each instance, update its highlight based on whether its key is in selectedIds.
    allMeshes.forEach((mesh) => {
      for (let instanceId = 0; instanceId < mesh.count; instanceId++) {
        const key = instanceToKeyMap.get(instanceId)
        const highlight = (key && imageStore.selectedIds.has(key)) ? 1 : 0
        setInstanceHighlight(mesh, instanceId, highlight)
      }
    })
    console.timeEnd('Update Highlights')
    
    console.timeEnd('Lasso Total Time')
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
    cameraRef.value!.updateMatrixWorld(true)
    projScreenMatrix.multiplyMatrices(cameraRef.value!.projectionMatrix, cameraRef.value!.matrixWorldInverse)
    frustum.setFromProjectionMatrix(projScreenMatrix)
    raycaster.setFromCamera(mouseVec, cameraRef.value!)
    if (lastHovered.index !== -1 && lastHovered.mesh) {
      const key = instanceToKeyMap.get(lastHovered.index)
      if (!key || !imageStore.selectedIds.has(key)) {
        setInstanceHighlight(lastHovered.mesh, lastHovered.index, 0)
      }
      lastHovered.index = -1
      lastHovered.mesh = null
    }
    if (closestMesh && closestInstanceId !== -1) {
      switch (interactionType) {
        case 'hover': {
          const key = instanceToKeyMap.get(closestInstanceId)
          if (!key || !imageStore.selectedIds.has(key)) {
            setInstanceHighlight(closestMesh, closestInstanceId, 1)
          }
          lastHovered.index = closestInstanceId
          lastHovered.mesh = closestMesh
          break
        }
        case 'left-click': {
          if (isControlPressed) {
            const key = instanceToKeyMap.get(closestInstanceId)
            if (key) {
              imageStore.toggleSelection(key)
              setInstanceHighlight(closestMesh, closestInstanceId, imageStore.selectedIds.has(key) ? 1 : 0)
              console.log('Left-click toggled selection for:', key)
            }
          }
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
  if (event.button === 2) {
    lassoDrawing.value = true
    lassoDepthPoints.value = []
    lassoShapePoints.value = []
    // If ctrl is not held during lasso, we want to clear selection. (Handled in updateHoveredMesh.)
    event.preventDefault()
  }
}

function handleMouseMove(event: MouseEvent) {
  updateMouse(event)
  
  // If we are in lasso drawing mode, record depth points and update 2D lasso shape.
  if (lassoDrawing.value && cameraRef.value && rendererRef.value) {
    // --- Record depth points (for selection) ---
    const mouseNear = new THREE.Vector3(mouseVec.x, mouseVec.y, 0)
    const mouseFar = new THREE.Vector3(mouseVec.x, mouseVec.y, 1)
    mouseNear.unproject(cameraRef.value)
    mouseFar.unproject(cameraRef.value)
    lassoDepthPoints.value.push(
      mouseNear.x,
      mouseNear.y,
      mouseNear.z,
      mouseFar.x,
      mouseFar.y,
      mouseFar.z,
    )

    // --- Update 2D lasso shape ---
    const rect = rendererRef.value.domElement.getBoundingClientRect()
    const mouse = new THREE.Vector2(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1
    )
    const mouseNDC = new THREE.Vector3(mouse.x, mouse.y, -1)
    mouseNDC.unproject(cameraRef.value)
    const rayDir = mouseNDC.sub(cameraRef.value.position).normalize()
    const planeNormal = cameraRef.value.getWorldDirection(new THREE.Vector3())
    const planeConstant = planeNormal.dot(cameraRef.value.position) + 0.2
    const t = (planeConstant - planeNormal.dot(cameraRef.value.position)) / planeNormal.dot(rayDir)
    const lassoPoint = cameraRef.value.position.clone().add(rayDir.multiplyScalar(t))
    lassoShapePoints.value.push(lassoPoint.clone())
    if (lassoShapePoints.value.length >= 3 && lassoShapeMesh.value) {
      const shape = new THREE.Shape()
      shape.moveTo(lassoShapePoints.value[0].x, lassoShapePoints.value[0].y)
      for (let i = 1; i < lassoShapePoints.value.length; i++) {
        shape.lineTo(lassoShapePoints.value[i].x, lassoShapePoints.value[i].y)
      }
      shape.closePath()
      const shapeGeometry = new THREE.ShapeGeometry(shape)
      lassoShapeMesh.value.geometry.dispose()
      lassoShapeMesh.value.geometry = shapeGeometry
      lassoShapeMesh.value.visible = true
      let sumZ = 0
      lassoShapePoints.value.forEach(pt => sumZ += pt.z)
      lassoShapeMesh.value.position.setZ(sumZ / lassoShapePoints.value.length)
    }
  }
  // For left click, detect dragging.
  if (event.button === 0 && leftClickStartPos.value) {
    const currentPos = new THREE.Vector2(event.clientX, event.clientY)
    if (currentPos.distanceTo(leftClickStartPos.value) > dragThreshold) {
      isDragging.value = true
    }
  }
  // If not in lasso mode and not dragging, process hover.
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
    lassoShapePoints.value = []
    if (lassoShapeMesh.value) {
      lassoShapeMesh.value.visible = false
    }
  }
  // If left button was clicked (without dragging) and ctrl is held, toggle selection.
  if (event.button === 0 && !isDragging.value) {
    updateHoveredMesh('left-click', event.ctrlKey, undefined, sceneRef.value!)
  }
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
  
  lassoShapeMesh.value = new THREE.Mesh(
    new THREE.ShapeGeometry(), 
    new THREE.MeshBasicMaterial({
      color: 0x0000FF,
      transparent: true,
      opacity: 0.3,
      side: THREE.DoubleSide,
    })
  )
  lassoShapeMesh.value.frustumCulled = false
  lassoShapeMesh.value.visible = false
  scene.add(lassoShapeMesh.value)
  
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
