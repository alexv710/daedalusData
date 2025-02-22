import * as THREE from 'three'
import { ArcballControls } from 'three/addons/controls/ArcballControls.js'

/**
 * Composable for various Three.js helper functions.
 */
export function useThree() {
  /**
   * Sets up and returns the controls for the Three.js camera.
   * @param {THREE.Camera} camera - The Three.js camera.
   * @param {HTMLElement} rendererElement - The renderer's DOM element.
   * @param {THREE.Scene} scene - The Three.js scene.
   */
  const setupControls = (camera: THREE.camera, rendererElement, scene: THREE.scene) => {
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
    // enabling the a right-click action for the mouse prevents three to open
    // the context menu on right-click, even If the rotation is disabled
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

  return { setupControls }
}
