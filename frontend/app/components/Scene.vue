<script setup lang="ts">
import * as THREE from 'three'
import { ArcballControls } from 'three/addons/controls/ArcballControls.js'

// ----- Props and Refs -----
const props = defineProps({
  width: { type: Number, required: true },
  height: { type: Number, required: true },
  offsetX: { type: Number, default: 0 },
})

const emit = defineEmits(['imageFocusChange'])

// ----- Pinia Store Integration -----
const imageStore = useImageStore()
const labelStore = useLabelStore()

// vuetify theme for color mode
const colorMode = useColorMode()
const backgroundColor = computed(() => colorMode.value === 'light' ? new THREE.Color().setHex(0xFFFFFF) : new THREE.Color().setHex(0x121212),
)

// Build mapping from instance index to image key.
const instanceToImageMap = ref(new Map<number, string>())
const imageToInstanceMap = ref(new Map<string, number>())

const canvas = ref<HTMLCanvasElement | null>(null)
const cameraRef = ref<THREE.PerspectiveCamera | null>(null)
const rendererRef = ref<THREE.WebGLRenderer | null>(null)
const sceneRef = shallowRef<THREE.Scene | null>(null)
const instancedMeshRef = shallowRef<THREE.InstancedMesh | null>(null)
const count = ref(0)

// ----- Raycasting & Lasso Handling -----
const raycaster = new THREE.Raycaster()
const mouseVec = new THREE.Vector2(1, 1)
const frustum = new THREE.Frustum()
const projScreenMatrix = new THREE.Matrix4()
const boundingBox = new THREE.Box3()
const instancePosition = new THREE.Vector3()
const instanceScale = new THREE.Vector3()
const localIntersection = new THREE.Vector3()

// ----- Additional State for Interaction -----
const lassoDrawing = ref(false)
const lassoDepthPoints = ref<number[]>([])
const isDragging = ref(false)
const dragThreshold = 5
const lastHovered = { index: -1, mesh: null }
const leftClickStartPos = ref<THREE.Vector2 | null>(null)
const hoveredInstanceId = ref(-1)
// NEW: Lasso shape drawing state
const lassoShapePoints = ref<THREE.Vector3[]>([])
const lassoShapeMesh = shallowRef<THREE.Mesh | null>(null)

// ----- Animate function variable -----
// Declare animate in outer scope so that the watcher can call it.
let animate = () => {}

// ----- Resize Handling -----
function handleResize() {
  if (cameraRef.value && rendererRef.value) {
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
attribute vec4 instanceBorderColor;
attribute float instanceGrayedOut;
varying vec2 vUV;
varying float vHighlight;
varying vec2 vDimensions;
varying float vInstanceGrayedOut;
varying vec4 vInstanceUV;
varying vec4 vInstanceBorderColor;
void main() {
    vUV = instanceUV.xy + instanceUV.zw * uv;
    vHighlight = instanceHighlight;
    vInstanceGrayedOut = instanceGrayedOut;
    vInstanceUV = instanceUV;
    vInstanceBorderColor = instanceBorderColor;
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
varying float vInstanceGrayedOut;
varying vec2 vDimensions;
varying vec4 vInstanceUV;
varying vec4 vInstanceBorderColor;

void main() {
    float borderThickness = 0.02;
    
    // Calculate instance-specific normalized UV coordinates
    // This converts the global vUV back to a 0-1 range for each instance
    vec2 instanceLocalUV = (vUV - vInstanceUV.xy) / vInstanceUV.zw;
    
    bool isBorder = 
        instanceLocalUV.x < borderThickness || 
        instanceLocalUV.x > (1.0 - borderThickness) || 
        instanceLocalUV.y < borderThickness || 
        instanceLocalUV.y > (1.0 - borderThickness);
    
    vec4 texColor = texture2D(map, vUV);
    float adjustedHighlight = vHighlight * highlightIntensity;
    vec4 highlightedColor = mix(texColor, vec4(highlightColor, texColor.a), adjustedHighlight);
    vec4 grayedOutColor = vec4(0.5, 0.5, 0.5, 0.2);
    
    if (vInstanceGrayedOut > 0.5) {
        gl_FragColor = grayedOutColor;
    } else if (isBorder) {
        gl_FragColor = vInstanceBorderColor;
    } else {
        gl_FragColor = highlightedColor;
    }
}
`

// ----- Instanced Mesh Creation -----
/**
 * Creates an instanced mesh.
 * @param atlasTexture The loaded texture.
 * @param atlasData The atlas JSON data.
 * @param projectionMap (Optional) A mapping from image key (lowercase filename) to its projection { x, y }.
 */
function createInstancedMesh(
  atlasTexture: THREE.Texture,
  atlasData: any,
  projectionMap?: Map<string, { x: number, y: number }>,
): THREE.InstancedMesh {
  const atlasInfoArray = Object.entries(atlasData).map(([filename, info]) => ({
    filename: filename.toLowerCase(),
    ...info,
  }))

  count.value = atlasInfoArray.length
  const geometry = new THREE.PlaneGeometry(1, 1)
  const instanceUVs = new Float32Array(count.value * 4)
  const instanceHighlights = new Float32Array(count.value)
  const instanceAspectRatios = new Float32Array(count.value)
  const instancePositions = new Float32Array(count.value * 3)
  const instanceGrayedOut = new Float32Array(count.value).fill(0.0)
  const borderColors = new Float32Array(count.value * 4).fill(0.0)

  const useProjection = projectionMap && projectionMap.size > 0
  let minX = Infinity
  let maxX = -Infinity
  let minY = Infinity
  let maxY = -Infinity
  if (useProjection) {
    projectionMap.forEach((coord) => {
      minX = Math.min(minX, coord.x)
      maxX = Math.max(maxX, coord.x)
      minY = Math.min(minY, coord.y)
      maxY = Math.max(maxY, coord.y)
    })
  }
  const maxRange = useProjection ? Math.max(maxX - minX, maxY - minY) : 1
  const desiredScale = 50 // adjust as needed

  for (let i = 0; i < count.value; i++) {
    const info = atlasInfoArray[i]
    const id = info.filename.toLowerCase().replace(/\.[^/.]+$/, '')
    const uvX = info.x / atlasTexture.image.width
    const uvWidth = info.width / atlasTexture.image.width
    const uvHeight = info.height / atlasTexture.image.height
    const uvH = -uvHeight
    const uvY = info.y / atlasTexture.image.height - uvH
    instanceUVs.set([uvX, uvY, uvWidth, uvH], i * 4)

    instanceHighlights[i] = 0.0
    instanceAspectRatios[i] = info.width / info.height

    const coords = projectionMap!.get(id)!
    const scaledX = ((coords.x - minX) / maxRange - 0.5) * desiredScale
    const scaledY = ((coords.y - minY) / maxRange - 0.5) * desiredScale
    instancePositions[i * 3] = scaledX
    instancePositions[i * 3 + 1] = scaledY

    instancePositions[i * 3 + 2] = 0
  }

  geometry.setAttribute('instanceUV', new THREE.InstancedBufferAttribute(instanceUVs, 4))
  geometry.setAttribute('instanceHighlight', new THREE.InstancedBufferAttribute(instanceHighlights, 1))
  geometry.setAttribute('instanceAspectRatio', new THREE.InstancedBufferAttribute(instanceAspectRatios, 1))
  geometry.setAttribute('instancePosition', new THREE.InstancedBufferAttribute(instancePositions, 3))
  geometry.setAttribute('instanceGrayedOut', new THREE.InstancedBufferAttribute(instanceGrayedOut, 1))
  geometry.setAttribute('instanceBorderColor', new THREE.InstancedBufferAttribute(borderColors, 4))

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

  const instancedMesh = new THREE.InstancedMesh(geometry, material, count.value)
  const matrix = new THREE.Matrix4()
  for (let i = 0; i < count.value; i++) {
    const x = instancePositions[i * 3]
    const y = instancePositions[i * 3 + 1]
    const z = instancePositions[i * 3 + 2]
    matrix.makeTranslation(x, y, z)
    instancedMesh.setMatrixAt(i, matrix)
  }
  instancedMesh.instanceMatrix.needsUpdate = true
  return instancedMesh
}

function updateInstancePositions(projectionData: { image: string, UMAP1: number, UMAP2: number }[]) {
  if (!instancedMeshRef.value) {
    console.warn('No instanced mesh available to update.')
    return
  }

  const projectionMap = new Map<string, { x: number, y: number }>()
  projectionData.forEach((item) => {
    projectionMap.set(item.image.toLowerCase(), { x: item.UMAP1, y: item.UMAP2 })
  })

  let minX = Infinity
  let maxX = -Infinity
  let minY = Infinity
  let maxY = -Infinity
  projectionMap.forEach((coord) => {
    minX = Math.min(minX, coord.x)
    maxX = Math.max(maxX, coord.x)
    minY = Math.min(minY, coord.y)
    maxY = Math.max(maxY, coord.y)
  })

  const rangeX = maxX - minX
  const rangeY = maxY - minY
  const maxRange = Math.max(rangeX, rangeY)
  const desiredScale = 50

  const matrix = new THREE.Matrix4()
  const instanceCount = instancedMeshRef.value.count

  for (let i = 0; i < instanceCount; i++) {
    const key = instanceToImageMap.value.get(i)
    if (!key)
      continue

    const coords = projectionMap.get(key.toLowerCase())
    if (coords) {
      const scaledX = ((coords.x - minX) / maxRange - 0.5) * desiredScale
      const scaledY = ((coords.y - minY) / maxRange - 0.5) * desiredScale
      matrix.makeTranslation(scaledX + props.offsetX, scaledY, 0)
      instancedMeshRef.value.setMatrixAt(i, matrix)
    }
  }
  instancedMeshRef.value.instanceMatrix.needsUpdate = true
}

// ----- Controls Setup -----
function setupControls(camera: THREE.Camera, rendererElement: HTMLElement): ArcballControls {
  const controls = new ArcballControls(camera, rendererElement, sceneRef.value)
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

function updateMouse(event: MouseEvent) {
  event.preventDefault()
  const rect = rendererRef.value?.domElement.getBoundingClientRect()
  if (rect) {
    mouseVec.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
    mouseVec.y = -((event.clientY - rect.top) / rect.height) * 2 + 1
  }
}

function setInstanceHighlight(mesh: THREE.InstancedMesh, index: number, value: number) {
  const attribute = mesh.geometry.getAttribute('instanceHighlight')
  attribute.setX(index, value)
  attribute.needsUpdate = true
}

function pointInPolygon(point, polygon) {
  let inside = false
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].x
    const yi = polygon[i].y
    const xj = polygon[j].x
    const yj = polygon[j].y
    const intersect = ((yi > point.y) !== (yj > point.y))
      && (point.x < (xj - xi) * (point.y - yi) / (yj - yi) + xi)
    if (intersect)
      inside = !inside
  }
  return inside
}

function updateHoveredMesh(
  interactionType: 'hover' | 'left-click' | 'right-click' | 'lasso',
  isControlPressed: boolean,
  lassoDepthPoints?: number[],
) {
  if (!cameraRef.value) {
    console.warn('Camera is null, skipping raycasting')
    return
  }
  if (interactionType === 'lasso' && lassoDepthPoints && lassoDepthPoints.length >= 18) {
    if (!sceneRef.value) {
      console.warn('Scene is null, skipping lasso raycasting')
      return
    }
    console.time('Lasso Total Time')
    const lassoPolygon = lassoShapePoints.value.map((pt) => {
      const projected = pt.clone().project(cameraRef.value!)
      return {
        x: (projected.x + 1) * 0.5 * props.width,
        y: (-projected.y + 1) * 0.5 * props.height,
      }
    })
    const allMeshes: THREE.InstancedMesh[] = []
    sceneRef.value.traverse((obj) => {
      if (obj instanceof THREE.InstancedMesh) {
        allMeshes.push(obj)
      }
    })
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
          const key = instanceToImageMap.value.get(instanceId)
          if (key)
            selectedKeys.add(key)
        }
      }
    })
    if (!isControlPressed) {
      imageStore.clearSelection()
    }
    imageStore.batchSelect(selectedKeys)
    allMeshes.forEach((mesh) => {
      for (let instanceId = 0; instanceId < mesh.count; instanceId++) {
        const key = instanceToImageMap.value.get(instanceId)
        const highlight = (key && imageStore.selectedIds.has(key)) ? 1 : 0
        setInstanceHighlight(mesh, instanceId, highlight)
      }
    })
    console.timeEnd('Lasso Total Time')
  }
  else {
    const hitResult = findHoveredInstance()

    // Clear previous hover highlight if it's not the locked image
    if (lastHovered.index !== -1 && lastHovered.mesh
      && (!imageStore.isImageFocusLocked
        || instanceToImageMap.value.get(lastHovered.index) !== imageStore.focusedId)) {
      const key = instanceToImageMap.value.get(lastHovered.index)
      if (!key || !imageStore.selectedIds.has(key)) {
        setInstanceHighlight(lastHovered.mesh, lastHovered.index, 0)
      }
      lastHovered.index = -1
      lastHovered.mesh = null

      // If not locked, clear the hovered image
      if (!imageStore.isImageFocusLocked) {
        hoveredInstanceId.value = -1
        imageStore.setHoveredImage(null)
        emit('imageFocusChange', null)
      }
    }

    if (hitResult && hitResult.mesh) {
      const { mesh, instanceId } = hitResult

      switch (interactionType) {
        case 'hover': {
          // Update hover state
          const key = instanceToImageMap.value.get(instanceId)

          if (!key || !imageStore.selectedIds.has(key)) {
            setInstanceHighlight(mesh, instanceId, 1)
          }

          lastHovered.index = instanceId
          lastHovered.mesh = mesh
          hoveredInstanceId.value = instanceId

          // Update the hovered image in the store
          if (key) {
            imageStore.setHoveredImage(key)
          }

          // Emit the hovered image key for display if not locked
          if (!imageStore.isImageFocusLocked && key) {
            emit('imageFocusChange', key)
          }
          break
        }
        case 'left-click': {
          break
        }
        case 'right-click':
          console.log('Right-click interaction detected')
          break
      }
    }
  }
}

function resetFocus() {
  // Clear focus in the store
  imageStore.unlockImageFocus()

  // Clear highlight on the previously focused instance
  if (lastHovered.index !== -1 && lastHovered.mesh) {
    const key = instanceToImageMap.value.get(lastHovered.index)
    if (!key || !imageStore.selectedIds.has(key)) {
      setInstanceHighlight(lastHovered.mesh, lastHovered.index, 0)
    }
    lastHovered.index = -1
    lastHovered.mesh = null
  }

  emit('imageFocusChange', null)
}

function handleKeyDown(event: KeyboardEvent) {
  if (event.key === 'Escape' && imageStore.isImageFocusLocked) {
    resetFocus()
  }
}

// ----- Mouse Event Handlers -----
function handleMouseDown(event: MouseEvent) {
  if (event.button === 0) {
    leftClickStartPos.value = new THREE.Vector2(event.clientX, event.clientY)
    isDragging.value = false
  }
  if (event.button === 2) {
    lassoDrawing.value = true
    lassoDepthPoints.value = []
    lassoShapePoints.value = []
    event.preventDefault()
  }
}

function handleMouseMove(event: MouseEvent) {
  updateMouse(event)
  if (lassoDrawing.value && cameraRef.value && rendererRef.value) {
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
    const rect = rendererRef.value.domElement.getBoundingClientRect()
    const mouse = new THREE.Vector2(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1,
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
  if (event.button === 0 && leftClickStartPos.value) {
    const currentPos = new THREE.Vector2(event.clientX, event.clientY)
    if (currentPos.distanceTo(leftClickStartPos.value) > dragThreshold) {
      isDragging.value = true
    }
  }
  if (!lassoDrawing.value && !isDragging.value) {
    updateHoveredMesh('hover', event.ctrlKey, undefined)
  }
}

function handleMouseUp(event: MouseEvent) {
  if (lassoDrawing.value && event.button === 2) {
    updateHoveredMesh('lasso', event.ctrlKey, lassoDepthPoints.value)
    lassoDrawing.value = false
    lassoDepthPoints.value = []
    lassoShapePoints.value = []
    if (lassoShapeMesh.value) {
      lassoShapeMesh.value.visible = false
    }
  }

  if (event.button === 0 && !isDragging.value) {
    // Handle click interaction
    const hitResult = findHoveredInstance()

    if (hitResult) {
      const key = instanceToImageMap.value.get(hitResult.instanceId)
      if (key) {
        // If ctrl is pressed, handle selection toggling
        if (event.ctrlKey) {
          imageStore.toggleSelection(key)
          if (hitResult.mesh) {
            setInstanceHighlight(
              hitResult.mesh,
              hitResult.instanceId,
              imageStore.selectedIds.has(key) ? 1 : 0,
            )
          }
        }
        else {
          // Lock focus on clicked image
          imageStore.lockImageFocus(key)

          if (hitResult.mesh) {
            setInstanceHighlight(hitResult.mesh, hitResult.instanceId, 1)
          }

          // Emit the focused image key for display
          emit('imageFocusChange', key)

          // Open detail window if not already open
          if (!imageStore.isDetailWindowOpen()) {
            imageStore.openDetailWindow(key)
          }
        }
      }
    }
    else {
      // Clicked on empty space, unlock focus
      resetFocus()
    }
  }

  leftClickStartPos.value = null
  isDragging.value = false
}

function findHoveredInstance() {
  if (!cameraRef.value || !sceneRef.value)
    return null

  let closestIntersection = Infinity
  let closestMesh: THREE.InstancedMesh | null = null
  let closestInstanceId = -1

  cameraRef.value.updateMatrixWorld(true)
  projScreenMatrix.multiplyMatrices(
    cameraRef.value.projectionMatrix,
    cameraRef.value.matrixWorldInverse,
  )
  frustum.setFromProjectionMatrix(projScreenMatrix)
  raycaster.setFromCamera(mouseVec, cameraRef.value)

  sceneRef.value.traverse((obj) => {
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

        boundingBox.setFromCenterAndSize(
          instancePosition,
          new THREE.Vector3(width, height, 0.01),
        )

        if (raycaster.ray.intersectsBox(boundingBox)) {
          const plane = new THREE.Plane()
          plane.setFromNormalAndCoplanarPoint(
            new THREE.Vector3(0, 0, 1).applyQuaternion(
              new THREE.Quaternion().setFromRotationMatrix(matrix),
            ),
            instancePosition,
          )

          const intersection = new THREE.Vector3()
          const intersected = raycaster.ray.intersectPlane(plane, intersection)

          if (intersected) {
            const distance = intersection.distanceTo(cameraRef.value.position)

            if (distance < closestIntersection) {
              localIntersection.copy(intersection).applyMatrix4(matrix.invert())

              if (
                Math.abs(localIntersection.x) <= width / 2
                && Math.abs(localIntersection.y) <= height / 2
              ) {
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

  return closestInstanceId !== -1
    ? { mesh: closestMesh, instanceId: closestInstanceId }
    : null
}

// ----- Main onMounted Block -----
onBeforeMount(async () => {
  await imageStore.loadImageMetadata()
  await imageStore.loadProjections()
})

onMounted(async () => {
  if (imageStore.images.size === 0) {
    await imageStore.loadImageMetadata()
    await imageStore.loadProjections()
  }

  const newMap = new Map<number, string>()
  const reverseNewMap = new Map<string, number>()
  Array.from(imageStore.images.keys()).forEach((key, i) => {
    newMap.set(i, key)
    reverseNewMap.set(key, i)
  })
  instanceToImageMap.value = newMap
  imageToInstanceMap.value = reverseNewMap
  labelStore.instanceToImageMap = instanceToImageMap.value
  labelStore.imageToInstanceMap = imageToInstanceMap.value
  console.log('Instance to key map:', instanceToImageMap.value)

  if (props.width <= 0 || props.height <= 0) {
    console.error('Invalid scene dimensions:', props.width, props.height)
    return
  }
  sceneRef.value = new THREE.Scene()
  sceneRef.value.background = backgroundColor.value
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
    }),
  )
  lassoShapeMesh.value.frustumCulled = false
  lassoShapeMesh.value.visible = false
  sceneRef.value.add(lassoShapeMesh.value)

  const controls = setupControls(camera, renderer.domElement, sceneRef.value)
  try {
    const response = await fetch('/data/atlas.json')
    if (!response.ok)
      throw new Error('Failed to fetch atlas.json')
    const atlasData = await response.json()
    const textureLoader = new THREE.TextureLoader()
    textureLoader.load(
      '/data/atlas.png',
      async (texture) => {
        texture.flipY = false
        // If a current projection is set, try to fetch its data to build a projection map.
        let projectionMap: Map<string, { x: number, y: number }> | undefined
        if (imageStore.currentProjection) {
          try {
            const projResponse = await fetch(`/data/projections/${imageStore.currentProjection}`)
            if (projResponse.ok) {
              const projectionData = await projResponse.json()
              projectionMap = new Map<string, { x: number, y: number }>()
              projectionData.forEach((item: { image: string, UMAP1: number, UMAP2: number }) => {
                projectionMap.set(item.image.toLowerCase(), { x: item.UMAP1, y: item.UMAP2 })
              })
            }
            else {
              console.warn('Failed to fetch projection data, using fallback random positions.')
            }
          }
          catch (error) {
            console.error('Error fetching projection data:', error)
          }
        }
        // Create the instanced mesh using the projection map if available.
        const instancedMesh = createInstancedMesh(texture, atlasData, projectionMap)
        instancedMeshRef.value = instancedMesh
        sceneRef.value.add(instancedMesh)
        // Start animation loop.
        animate()
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
  window.addEventListener('keydown', handleKeyDown)
  canvas.value?.addEventListener('mousedown', handleMouseDown)
  canvas.value?.addEventListener('mousemove', handleMouseMove)
  canvas.value?.addEventListener('mouseup', handleMouseUp)
  canvas.value?.addEventListener('contextmenu', e => e.preventDefault())

  // Define the animate function so it's available outside.
  animate = () => {
    requestAnimationFrame(animate)
    controls.update()
    renderer.render(sceneRef.value, camera)
  }
  animate()
})

function parseColorToRGB(color) {
  // Handle hex format (#RRGGBB)
  if (color.startsWith('#')) {
    const r = Number.parseInt(color.slice(1, 3), 16) / 255
    const g = Number.parseInt(color.slice(3, 5), 16) / 255
    const b = Number.parseInt(color.slice(5, 7), 16) / 255
    return [r, g, b]
  }

  // Handle rgb format (rgb(r,g,b))
  if (color.startsWith('rgb')) {
    const matches = color.match(/rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)/)
    if (matches) {
      return [
        Number.parseInt(matches[1], 10) / 255,
        Number.parseInt(matches[2], 10) / 255,
        Number.parseInt(matches[3], 10) / 255,
      ]
    }
  }

  // Default to white if parsing fails
  console.warn(`Failed to parse color: ${color}`)
  return [0, 0, 0]
}

// Watch for changes in the current projection and update instance positions accordingly.
watch(
  () => imageStore.currentProjection,
  async (newProjFile) => {
    if (newProjFile) {
      try {
        // pause here for 2 seconds
        await new Promise(resolve => setTimeout(resolve, 4000))
        const response = await fetch(`/data/projections/${newProjFile}`)
        if (!response.ok)
          throw new Error('Failed to fetch projection data.')
        const projectionData = await response.json()
        updateInstancePositions(projectionData)
        // Call animate() to ensure the scene updates.
        animate()
      }
      catch (error) {
        console.error('Error loading projection data:', error)
      }
    }
  },
)

watch(backgroundColor, (color) => {
  sceneRef.value!.background = color
})

watch(
  [
    () => [...labelStore.highlightedLabelIds],
    () => labelStore.alphabets,
    () => labelStore.imageToInstanceMap,
  ],
  () => {
    const borderColors = new Float32Array(count.value * 4).fill(0.0)
    const highlightedLabels = labelStore.highlightedLabels

    Object.values(highlightedLabels).forEach(({ color, instanceIds }) => {

      const splitHexColor = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(color)

      if (!splitHexColor) {
        console.warn(`Invalid hex color: ${color}, defaulting to white`)
        return [1, 1, 1] // Default to white if parsing fails
      }

      const r = Number.parseInt(splitHexColor[1], 16) / 255
      const g = Number.parseInt(splitHexColor[2], 16) / 255
      const b = Number.parseInt(splitHexColor[3], 16) / 255

      // Update each instance's color in the borderColors array
      instanceIds.forEach((instanceId) => {
        const index = instanceId * 4
        borderColors[index] = r
        borderColors[index + 1] = g
        borderColors[index + 2] = b
        borderColors[index + 3] = 1.0
      })
    })

    instancedMeshRef.value?.geometry.setAttribute(
      'instanceBorderColor',
      new THREE.InstancedBufferAttribute(borderColors, 4),
    )
  },
  { deep: true },
)

onUnmounted(() => {
  window.removeEventListener('resize', handleResize)
  window.removeEventListener('keydown', handleKeyDown)
  canvas.value?.removeEventListener('mousedown', handleMouseDown)
  canvas.value?.removeEventListener('mousemove', handleMouseMove)
  canvas.value?.removeEventListener('mouseup', handleMouseUp)
  canvas.value?.removeEventListener('contextmenu', e => e.preventDefault())
})

defineExpose({
  handleResize,
  updateMouse,
  updateHoveredMesh,
  resetFocus,
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
