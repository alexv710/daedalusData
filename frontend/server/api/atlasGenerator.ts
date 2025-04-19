import type { Buffer } from 'node:buffer'
import nfs from 'node:fs'
import fs from 'node:fs/promises'
import path from 'node:path'
import { useStorage } from '#imports'
import { MaxRectsPacker } from 'maxrects-packer'
import pLimit from 'p-limit'
import sharp from 'sharp'

// --- Configuration ---
const SHARP_CONCURRENCY = 8
const ALLOWED_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.webp', '.gif', '.avif', '.tiff']
// maximum size for webp
const MAX_ATLAS_DIMENSION = 16383
const OUTPUT_FORMAT = 'webp'
const ATLAS_IMAGE_NAME = `atlas.${OUTPUT_FORMAT}`
const ATLAS_JSON_NAME = 'atlas.json'
// --- End Configuration ---

// Simple interface for image data needed during processing
interface ImageProcessingInfo {
  path: string
  id: string
  originalWidth: number
  originalHeight: number
  width: number
  height: number
  needsResize: boolean
  // Properties added by the packer
  x?: number
  y?: number
}

interface InitialMetadata {
  filePath: string
  filename: string
  originalWidth: number
  originalHeight: number
  largestDim: number
}

// Simple interface for the final JSON data structure per image
interface AtlasCoordinates {
  x: number
  y: number
  width: number
  height: number
}

// Interfaces
interface AtlasStatus {
  status: string
  progress: number
  message: string
  lastUpdated: string
}

// Dummy updateStatus function (replace with your actual implementation)
async function updateStatus(
  progress: number,
  message: string,
  status: string = 'in_progress',
): Promise<void> {
  const storage = useStorage('atlas')
  await storage.setItem('status', {
    status,
    progress,
    message,
    lastUpdated: new Date().toISOString(),
  } as AtlasStatus)
}

/**
 * Finds base data dir, depending o
 */
async function findRelevantPaths(): Promise<string> {
  const basePaths = [
    path.join(process.cwd(), '/app/data'),
    path.join(process.cwd(), '/data'),
    path.join(process.cwd(), '../data'),
  ]

  const dataDir = basePaths.find(p => nfs.existsSync(p))
  if (!dataDir) {
    throw new Error('Could not find an accessible data directory')
  }
  return dataDir
}

/**
 * Scans a directory for image files with allowed extensions.
 */
async function getImageFilePaths(imagesDir: string): Promise<string[]> {
  let files: string[]
  try {
    files = await fs.readdir(imagesDir)
  }
  catch (err) {
    throw new Error(`Images directory not found or could not be read at ${imagesDir}: ${err.message}`)
  }

  const imageFiles = files.filter(file =>
    ALLOWED_EXTENSIONS.includes(path.extname(file).toLowerCase()),
  )

  if (!imageFiles.length) {
    throw new Error('No image files found in the images directory.')
  }
  await updateStatus(10, `Found ${imageFiles.length} images.`)
  return imageFiles.map(file => path.join(imagesDir, file))
}

/**
 * Reads metadata for multiple image files concurrently.
 * Returns null for files that could not be read or have invalid dimensions.
 */
async function readAllImageMetadata(imagePaths: string[]): Promise<(InitialMetadata | null)[]> {
  await updateStatus(15, 'Reading image metadata...')
  const metadataPromises = imagePaths.map(async (filePath) => {
    const filename = path.basename(filePath)
    try {
      const metadata = await sharp(filePath).metadata()
      // Ensure dimensions are valid positive numbers
      if (!metadata.width || !metadata.height || metadata.width <= 0 || metadata.height <= 0) {
        console.warn(`Invalid dimensions (${metadata.width}x${metadata.height}) for ${filename}. Skipping.`)
        return null
      }
      return {
        filePath,
        filename,
        originalWidth: metadata.width,
        originalHeight: metadata.height,
        largestDim: Math.max(metadata.width, metadata.height),
      }
    }
    catch (error: any) {
      console.warn(`Error reading metadata for ${filename}: ${error.message}. Skipping.`)
      return null
    }
  })
  return Promise.all(metadataPromises)
}

/**
 * Filters out null results from metadata reading and ensures at least one valid image exists.
 */
function filterValidMetadata(results: (InitialMetadata | null)[]): InitialMetadata[] {
  const validMetadata = results.filter((info): info is InitialMetadata => info !== null)
  if (!validMetadata.length) {
    throw new Error('No valid image metadata could be read from any provided file.')
  }
  return validMetadata
}

/**
 * Calculates the dimension cap based on a percentile of the largest dimensions.
 */
async function calculateDimensionCap(
  numberOfImages: number,
): Promise<number> {
  const dimensionCap = Math.ceil(0.8 * MAX_ATLAS_DIMENSION / Math.sqrt(numberOfImages))
  return Math.max(1, dimensionCap)
}

/**
 * Applies scaling based on the dimension cap and creates the final ImageProcessingInfo array.
 */
async function applyScalingAndCreateImageInfo(
  validMetadata: InitialMetadata[],
  dimensionCap: number,
): Promise<ImageProcessingInfo[]> {
  const processingInfos: ImageProcessingInfo[] = []

  validMetadata.forEach((info) => {
    let scaledWidth = info.originalWidth
    let scaledHeight = info.originalHeight
    let needsResize = false

    // Apply scaling only if the largest dimension exceeds the cap
    if (info.largestDim > dimensionCap) {
      const scaleFactor = dimensionCap / info.largestDim
      scaledWidth = Math.max(1, Math.round(info.originalWidth * scaleFactor))
      scaledHeight = Math.max(1, Math.round(info.originalHeight * scaleFactor))
      needsResize = true
    }

    processingInfos.push({
      path: info.filePath,
      id: info.filename,
      originalWidth: info.originalWidth,
      originalHeight: info.originalHeight,
      width: scaledWidth,
      height: scaledHeight,
      needsResize,
    })
  })

  await updateStatus(25, 'Image dimensions processed and scaling applied (if needed).')
  return processingInfos
}

/**
 * Packs image rectangles into bins using MaxRectsPacker.
 * Returns packing results including the number of bins used.
 */
async function packImageRects(
  imageInfos: ImageProcessingInfo[],
): Promise<{
    bins: Array<{ width: number, height: number, rects: ImageProcessingInfo[] }>
    packedRects: ImageProcessingInfo[]
    atlasWidth: number
    atlasHeight: number
  }> {
  const packerOptions = {
    smart: true,
    pot: false,
    square: false,
    allowRotation: false,
  }

  const packer = new MaxRectsPacker(MAX_ATLAS_DIMENSION, MAX_ATLAS_DIMENSION, 0, packerOptions)
  packer.addArray(imageInfos)

  if (packer.bins.length === 0) {
    // This case might happen if all images are larger than maxDimension
    // Or if imageInfos was empty
    throw new Error('Packer could not create any bins. Check input image sizes and atlas dimensions.')
  }

  const mainBin = packer.bins[0]
  const packedRects = mainBin.rects as ImageProcessingInfo[]

  const message = packer.bins.length === 1
    ? `Packing successful. Atlas dimensions: ${mainBin.width}x${mainBin.height}.`
    : `Packing required ${packer.bins.length} bins. Using first bin: ${mainBin.width}x${mainBin.height}.`

  await updateStatus(30, message)
  return {
    bins: packer.bins,
    packedRects,
    atlasWidth: mainBin.width,
    atlasHeight: mainBin.height,
  }
}

async function createAtlasImageBuffer(
  packedRects: ImageProcessingInfo[],
  atlasWidth: number,
  atlasHeight: number,
  outputFormat: keyof sharp.FormatEnum = 'webp',
  quality: number = 100,
): Promise<Buffer> {
  // --- Step 1: Composite Operation Preparation (Significant Time) ---
  const prepTimeStart = process.hrtime.bigint()
  await updateStatus(35, `Preparing ${packedRects.length} images for composition (reading/resizing)...`)

  const limit = pLimit(SHARP_CONCURRENCY)
  const itemsToProcess = packedRects.filter(rect => rect.x !== undefined && rect.y !== undefined)
  let processedCount = 0
  const total = itemsToProcess.length
  let lastUpdateTime = Date.now()

  const compositeOpPromises = itemsToProcess.map((rect, index) => limit(async () => {
    const requiresResize = rect.needsResize // Use the pre-calculated flag
    let operation: sharp.OverlayOptions | null = null

    try {
      const sharpInstance = sharp(rect.path)
      let buffer: Buffer
      let info: sharp.OutputInfo & sharp.RawInfo

      if (requiresResize) {
        if (typeof rect.width !== 'number' || rect.width <= 0 || typeof rect.height !== 'number' || rect.height <= 0) {
          throw new Error(`Invalid dimensions for resize (${rect.width}x${rect.height})`)
        }
        ({ data: buffer, info } = await sharpInstance
          .resize(rect.width, rect.height)
          .raw()
          .toBuffer({ resolveWithObject: true }))

        if (!info.channels) {
          throw new Error(`Could not determine channel count for raw buffer of ${rect.id}`)
        }

        operation = {
          input: buffer,
          raw: { width: info.width, height: info.height, channels: info.channels },
          left: rect.x,
          top: rect.y,
        }
      }
      else {
        // If no resize, just use the path directly for Sharp - more efficient
        operation = {
          input: rect.path,
          left: rect.x,
          top: rect.y,
        }
      }
    }
    catch (processingError: any) {
      console.error(`Error preparing image ${rect.id}: ${processingError.message}. Skipping.`)
    }

    // --- Progress Update within Preparation ---
    processedCount++
    const progressPercent = 35 + (processedCount / total) * 30
    if (
      index === total - 1
      || processedCount % Math.ceil(total / 20) === 0
      || Date.now() - lastUpdateTime > 2000
    ) {
      await updateStatus(
        progressPercent,
        `Preparing images: ${processedCount}/${total}...`,
      )
      lastUpdateTime = Date.now()
    }
    return operation
  }))

  const results = await Promise.all(compositeOpPromises)
  const compositeOperations = results.filter((op): op is sharp.OverlayOptions => op !== null)

  const prepTimeMs = (process.hrtime.bigint() - prepTimeStart) / 1_000_000n
  await updateStatus(65, `Prepared ${compositeOperations.length} composite operations. Took ${prepTimeMs} ms.`)
  console.info(` [TIMER] Composite operation preparation took ${prepTimeMs} ms`)

  if (compositeOperations.length === 0 && packedRects.length > 0) {
    throw new Error('Failed to prepare any valid composite operations.')
  }

  // --- Step 2: Main Sharp Pipeline (Major Bottleneck) ---
  // This step is harder to report granular progress on as it's one big operation.
  await updateStatus(70, `Compositing ${compositeOperations.length} images onto final ${atlasWidth}x${atlasHeight} atlas... (This is the longest step)`)
  const pipelineTimeStart = process.hrtime.bigint()

  try {
    const atlasBuffer = await sharp({
      create: {
        width: atlasWidth,
        height: atlasHeight,
        channels: 4,
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      },
    })
      .composite(compositeOperations)
      .toFormat(outputFormat, { quality, lossless: false, effort: 3 }) // effort 3 is a balance
      .toBuffer()

    const pipelineTimeMs = (process.hrtime.bigint() - pipelineTimeStart) / 1_000_000n
    console.info(` [TIMER] Final sharp pipeline (create + composite + format + toBuffer) took ${pipelineTimeMs} ms`)
    // Update status after this long step completes
    await updateStatus(95, `Image compositing complete. Took ${pipelineTimeMs} ms.`)
    return atlasBuffer
  }
  catch (error) {
    console.error('Error during final sharp pipeline:', error)
    throw error // Re-throw to be caught by the main handler
  }
}

/**
 * Generates the atlas JSON data in the specified format.
 * Uses the final coordinates/dimensions from the (potentially post-scaled) packedRects.
 */
async function generateAtlasJsonData(
  packedRects: ImageProcessingInfo[],
): Promise<Record<string, AtlasCoordinates>> {
  const atlasCoordinates: Record<string, AtlasCoordinates> = {}

  packedRects.forEach((rect) => {
    if (rect.x === undefined || rect.y === undefined || rect.width === undefined || rect.height === undefined) {
      console.warn(`Skipping ${rect.id} in JSON due to missing final packing data.`)
      return
    }
    atlasCoordinates[rect.id] = {
      x: rect.x,
      y: rect.y,
      width: rect.width,
      height: rect.height,
    }
  })
  return atlasCoordinates
}

/**
 * Writes the atlas image buffer and JSON data to the output directory.
 */
async function writeOutputFiles(
  atlasBuffer: Buffer,
  jsonData: Record<string, AtlasCoordinates>,
  dataDir: string,
): Promise<void> {
  const atlasImagePath = path.join(dataDir, ATLAS_IMAGE_NAME)
  const atlasJsonPath = path.join(dataDir, ATLAS_JSON_NAME)

  await fs.writeFile(atlasImagePath, atlasBuffer)
  await fs.writeFile(atlasJsonPath, JSON.stringify(jsonData, null, 2))
}

/**
 * Main orchestrator function for generating the image atlas.
 * Includes iterative packing and post-packing scaling.
 */
async function generateAtlas(): Promise<void> {
  try {
    const startTime = process.hrtime.bigint()
    let lastMark = startTime
    let now: bigint
    const logTime = (sectionName: string) => {
      now = process.hrtime.bigint()
      const durationMs = (now - lastMark) / 1_000_000n
      console.info(` [TIMER] ${sectionName} took ${durationMs} ms`)
      lastMark = now
    }
    const dataDir = await findRelevantPaths()
    const imagesDir = path.join(dataDir, 'images')
    const imagePaths = await getImageFilePaths(imagesDir)

    const metadataResults = await readAllImageMetadata(imagePaths)
    const validMetadata = filterValidMetadata(metadataResults)

    // Higher percentile might prevent needing iterative scaling later
    const dimensionCap = await calculateDimensionCap(validMetadata.length)
    const currentImageInfos = await applyScalingAndCreateImageInfo(validMetadata, dimensionCap)
    logTime('Pre-pack Scaling (applyScalingAndCreateImageInfo)')

    // --- 2. Packing ---
    let packingSuccessful = false

    const packResult = await packImageRects(currentImageInfos)
    logTime('Packing (packImageRects)')

    if (packResult.bins.length === 1) {
      packingSuccessful = true
    }

    if (!packingSuccessful || !packResult) {
      throw new Error(`Failed to pack images into a single atlas.`)
    }

    let { packedRects, atlasWidth, atlasHeight } = packResult

    // --- 3. Post-Packing Scaling ---
    let finalAtlasWidth = atlasWidth
    let finalAtlasHeight = atlasHeight
    let postPackScale = 1.0

    // Failsafe: Check if the packer *still* exceeded bounds (maybe due to padding logic or edge cases)
    if (atlasWidth > MAX_ATLAS_DIMENSION || atlasHeight > MAX_ATLAS_DIMENSION) {
      postPackScale = Math.min(MAX_ATLAS_DIMENSION / atlasWidth, MAX_ATLAS_DIMENSION / atlasHeight)

      finalAtlasWidth = Math.max(1, Math.floor(atlasWidth * postPackScale))
      finalAtlasHeight = Math.max(1, Math.floor(atlasHeight * postPackScale))

      // IMPORTANT: Adjust coordinates and dimensions *within* packedRects
      packedRects = packedRects.map((rect) => {
        if (rect.x === undefined || rect.y === undefined || rect.width === undefined || rect.height === undefined) {
          console.warn(`Skipping coordinate scaling for ${rect.id} due to missing packing data.`)
          return rect
        }
        // Floor x/y, round width/height, ensure min 1px dimension
        const newX = Math.floor(rect.x * postPackScale)
        const newY = Math.floor(rect.y * postPackScale)
        const newW = Math.max(1, Math.round(rect.width * postPackScale))
        const newH = Math.max(1, Math.round(rect.height * postPackScale))

        // Mark as needing resize if dimensions change from previous state, even if pre-pack scaling already happened
        const needsResize = rect.needsResize || newW !== rect.width || newH !== rect.height

        return {
          ...rect,
          x: newX,
          y: newY,
          width: newW,
          height: newH,
          needsResize,
        }
      })
    }
    logTime('Post-pack Scaling Logic')

    // --- 4. Create Final Image Buffer & JSON ---
    const finalAtlasBuffer = await createAtlasImageBuffer(
      packedRects,
      finalAtlasWidth,
      finalAtlasHeight,
    )
    logTime('Image Compositing (createAtlasImageBuffer)')

    // Generate JSON using the final, potentially adjusted rects
    const finalAtlasJsonData = await generateAtlasJsonData(packedRects)
    logTime('JSON Generation (generateAtlasJsonData)')

    // --- 5. Write Output Files ---
    await writeOutputFiles(
      finalAtlasBuffer,
      finalAtlasJsonData,
      dataDir,
    )
    logTime('File Writing (writeOutputFiles)')

    await updateStatus(100, 'Atlas generation complete!', 'complete')
    const totalDurationMs = (process.hrtime.bigint() - startTime) / 1_000_000n
    console.info(` [TIMER] Total execution time: ${totalDurationMs} ms`)
  }
  catch (error: any) {
    console.error('[ATLAS_GEN] Error during background atlas generation:', error)
    const storage = useStorage('atlas')
    const lastStatus = await storage.getItem<AtlasStatus>('status')
    await updateStatus(
      lastStatus?.progress ?? 0,
      `Atlas generation failed: ${error.message || 'Unknown error'}`,
      'error',
    )
  }
}

export default defineEventHandler(async (event) => {
  generateAtlas()
  setResponseStatus(event, 202)
  return {
    success: true,
    message: 'Atlas generation process started.',
  }
})
