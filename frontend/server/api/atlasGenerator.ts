import type { Sharp } from 'sharp'
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { useStorage } from '#imports'
import { defineEventHandler } from 'h3'
import sharp from 'sharp'

// Constants
const MAX_ATLAS_WIDTH = 8192
const MAX_ATLAS_HEIGHT = 8192
const MAX_PIXEL_COUNT = 67108864
const METADATA_BATCH_SIZE = 2
const RESIZE_BATCH_SIZE = 2
const ALLOWED_EXTENSIONS = ['.png', '.jpg', '.jpeg']

// Interfaces
interface AtlasStatus {
  status: string
  progress: number
  message: string
  lastUpdated: string
}

interface ImageMeta {
  filename: string
  width: number
  height: number
  originalWidth: number
  originalHeight: number
}

interface PackedImage extends ImageMeta {
  x: number
  y: number
}

interface Rect {
  x: number
  y: number
  width: number
  height: number
}

// Bin-packing algorithm
class Packer {
  private bins: Rect[] = []
  private readonly maxWidth: number
  private currentHeight: number = 0

  constructor(maxWidth: number) {
    this.maxWidth = maxWidth
    this.bins.push({ x: 0, y: 0, width: maxWidth, height: 0 })
  }

  private findBestBin(width: number, height: number): Rect | null {
    let bestBin: Rect | null = null
    let bestScore = Infinity

    for (const bin of this.bins) {
      if (bin.width < width || bin.height < height)
        continue

      const score = bin.width - width
      if (score < bestScore) {
        bestScore = score
        bestBin = bin
      }
    }

    return bestBin
  }

  pack(image: ImageMeta): PackedImage {
    const width = image.width
    const height = image.height

    let bin = this.findBestBin(width, height)

    if (!bin) {
      bin = {
        x: 0,
        y: this.currentHeight,
        width: this.maxWidth,
        height,
      }
      this.currentHeight += height
      this.bins.push(bin)
    }

    const packedImage: PackedImage = {
      ...image,
      x: bin.x,
      y: bin.y,
    }

    this.splitBin(bin, width, height)

    return packedImage
  }

  private splitBin(bin: Rect, width: number, height: number): void {
    const binIndex = this.bins.indexOf(bin)
    if (binIndex !== -1) {
      this.bins.splice(binIndex, 1)
    }

    if (bin.width > width) {
      this.bins.push({
        x: bin.x + width,
        y: bin.y,
        width: bin.width - width,
        height: bin.height,
      })
    }

    if (bin.height > height) {
      this.bins.push({
        x: bin.x,
        y: bin.y + height,
        width,
        height: bin.height - height,
      })
    }

    this.currentHeight = Math.max(this.currentHeight, bin.y + height)
  }

  getHeight(): number {
    return this.currentHeight
  }
}

// Status update function
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

// Main atlas generation function
async function generateAtlas(): Promise<{
  atlasImagePath: string
  atlasJsonPath: string
  dimensions: { width: number, height: number }
  scalingFactor: number
}> {
  await updateStatus(5, 'Initializing atlas generation...')

  // Find data directory
  const basePaths = [
    path.join(process.cwd(), '/app/data'),
    path.join(process.cwd(), '/data'),
    path.join(process.cwd(), '../data'),
  ]

  const dataDir = basePaths.find(p => fs.existsSync(p))
  if (!dataDir) {
    throw new Error('Could not find an accessible data directory')
  }

  console.info('Using data directory:', dataDir)

  // Set up images directory
  const imagesDir = path.join(dataDir, 'images')
  if (!fs.existsSync(imagesDir)) {
    throw new Error(`Images directory not found at ${imagesDir}`)
  }

  // Read image files
  await updateStatus(10, 'Reading image files from images directory...')
  const imageFiles = fs.readdirSync(imagesDir)
    .filter(file => ALLOWED_EXTENSIONS.includes(path.extname(file).toLowerCase()))

  if (!imageFiles.length) {
    throw new Error('No image files found in the images directory.')
  }

  // Create image metadata array
  let images: ImageMeta[] = imageFiles.map(file => ({
    filename: file,
    width: 0,
    height: 0,
    originalWidth: 0,
    originalHeight: 0,
  }))

  await updateStatus(15, `Found ${images.length} images. Reading image dimensions...`)

  // Read image metadata in batches
  let processedCount = 0
  const metadataBatches = Math.ceil(images.length / METADATA_BATCH_SIZE)
  for (let batchIndex = 0; batchIndex < metadataBatches; batchIndex++) {
    const startIdx = batchIndex * METADATA_BATCH_SIZE
    const endIdx = Math.min((batchIndex + 1) * METADATA_BATCH_SIZE, images.length)
    const batchImages = images.slice(startIdx, endIdx)

    const batchResults = await Promise.all(
      batchImages.map(async (img) => {
        const imgPath = path.join(imagesDir, img.filename)
        if (!fs.existsSync(imgPath)) {
          console.warn(`File not found: ${imgPath}`)
          return null
        }
        try {
          const meta = await sharp(imgPath).metadata()
          processedCount++

          // Update progress periodically
          if (processedCount % Math.max(1, Math.floor(images.length / 20)) === 0) {
            const percent = Math.min(30, 15 + (processedCount / images.length * 15))
            await updateStatus(percent, `Reading image dimensions: ${processedCount}/${images.length}`)
          }

          return {
            ...img,
            width: meta.width || 0,
            height: meta.height || 0,
            originalWidth: meta.width || 0,
            originalHeight: meta.height || 0,
          }
        }
        catch (err) {
          console.error(`Error reading metadata for ${img.filename}:`, err)
          return null
        }
      }),
    )

    // Replace the batch portion in the images array
    for (let i = 0; i < batchResults.length; i++) {
      if (batchResults[i] !== null) {
        images[startIdx + i] = batchResults[i]!
      }
    }
  }

  // Filter out any null or zero-dimension entries
  images = images.filter((img): img is ImageMeta => img !== null && img.width > 0 && img.height > 0)

  // Sort images by height descending for better packing
  images.sort((a, b) => b.height - a.height)

  await updateStatus(35, 'Calculating atlas dimensions and scaling factor...')

  // Calculate total area to determine if scaling is needed
  const totalImageArea = images.reduce((sum, img) => sum + (img.width * img.height), 0)
  console.info(`Total area of all images: ${totalImageArea} pixels`)

  // Simulate packing to estimate dimensions
  function estimateAtlasDimensions(imgs: ImageMeta[], maxWidth: number): number {
    const packer = new Packer(maxWidth)
    for (const img of imgs) {
      packer.pack(img)
    }
    return packer.getHeight()
  }

  // Calculate initial packing height
  const initialHeight = estimateAtlasDimensions(images, MAX_ATLAS_WIDTH)
  console.info(`Initial atlas height estimate: ${initialHeight} pixels`)

  // Calculate scaling factor
  let scalingFactor = 1.0
  if (initialHeight > MAX_ATLAS_HEIGHT || totalImageArea > MAX_PIXEL_COUNT) {
  // Separate small and large images
    const smallImages = images.filter(img => img.width <= 50 && img.height <= 50)
    const largeImages = images.filter(img => img.width > 50 || img.height > 50)

    // Calculate scaling factors only for large images
    if (largeImages.length > 0) {
    // Calculate total area of large images
      const largeImageArea = largeImages.reduce((sum, img) => sum + (img.width * img.height), 0)

      // Calculate scaling factors
      const heightScalingFactor = MAX_ATLAS_HEIGHT / estimateAtlasDimensions(largeImages, MAX_ATLAS_WIDTH)
      const areaScalingFactor = Math.sqrt(MAX_PIXEL_COUNT / largeImageArea)

      // Use the more restrictive scaling
      scalingFactor = Math.min(heightScalingFactor, areaScalingFactor, 0.99)

      console.info(`Scaling large images by factor: ${scalingFactor.toFixed(4)}`)

      // Apply scaling to large images only
      largeImages.forEach((img) => {
        img.width = Math.max(1, Math.floor(img.width * scalingFactor))
        img.height = Math.max(1, Math.floor(img.height * scalingFactor))
      })

      // Combine small and scaled large images
      images = [...smallImages, ...largeImages]
    }
  }
  // Re-sort images after scaling
  images.sort((a, b) => b.height - a.height)

  // Re-estimate atlas dimensions
  const scaledHeight = estimateAtlasDimensions(images, MAX_ATLAS_WIDTH)
  console.info(`Scaled atlas height: ${scaledHeight} pixels`)

  // Additional scaling if needed
  if (scaledHeight > MAX_ATLAS_HEIGHT) {
    const additionalScaling = MAX_ATLAS_HEIGHT / scaledHeight
    scalingFactor *= additionalScaling

    console.info(`Additional scaling needed, final factor: ${scalingFactor.toFixed(4)}`)

    // Apply additional scaling, still preserving small images
    const smallImages = images.filter(img => img.width <= 50 && img.height <= 50)
    const largeImages = images.filter(img => img.width > 50 || img.height > 50)

    largeImages.forEach((img) => {
      img.width = Math.max(1, Math.floor(img.originalWidth * scalingFactor))
      img.height = Math.max(1, Math.floor(img.originalHeight * scalingFactor))
    })

    // Combine small and scaled large images
    images = [...smallImages, ...largeImages]

    const finalHeight = estimateAtlasDimensions(images, MAX_ATLAS_WIDTH)
    console.info(`Final atlas height after additional scaling: ${finalHeight} pixels`)

    if (finalHeight > MAX_ATLAS_HEIGHT) {
      throw new Error(`Cannot fit images in atlas within allowed dimensions`)
    }
  }

  // Additional logging for small images
  const smallImageCount = images.filter(img => img.width <= 50 || img.height <= 50).length
  console.info(`Number of small images (50x50 or smaller): ${smallImageCount}`)

  await updateStatus(40, 'Packing images into atlas...')

  // Use the packing algorithm to place images
  const packer = new Packer(MAX_ATLAS_WIDTH)
  const packedImages: PackedImage[] = []

  for (const img of images) {
    packedImages.push(packer.pack(img))
  }

  const atlasWidth = MAX_ATLAS_WIDTH
  const atlasHeight = packer.getHeight()

  console.info(`Final atlas dimensions: ${atlasWidth}x${atlasHeight} (scaling factor: ${scalingFactor})`)

  // Create atlas coordinates object
  const atlasCoordinates: { [key: string]: any } = {}
  packedImages.forEach((img) => {
    atlasCoordinates[img.filename] = {
      x: img.x,
      y: img.y,
      width: img.width,
      height: img.height,
      originalWidth: img.originalWidth,
      originalHeight: img.originalHeight,
      scalingFactor,
    }
  })

  await updateStatus(45, 'Creating blank atlas image...')

  // Create atlas with a white background
  let atlas: Sharp = sharp({
    create: {
      width: atlasWidth,
      height: atlasHeight,
      channels: 4,
      background: { r: 255, g: 255, b: 255, alpha: 0 },
    },
    limitInputPixels: false,
  })

  await updateStatus(50, 'Preparing images for composition...')

  // Setup temp directory
  const tempDir = path.join(dataDir, 'temp')
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true })
  }
  else {
    // Clean up existing temp files
    try {
      const tempFiles = fs.readdirSync(tempDir)
      for (const file of tempFiles) {
        fs.unlinkSync(path.join(tempDir, file))
      }
    }
    catch (err) {
      console.warn('Error cleaning temp directory:', err)
    }
  }

  const batches = Math.ceil(packedImages.length / RESIZE_BATCH_SIZE)
  const allComposites: Array<any> = []

  for (let batchIndex = 0; batchIndex < batches; batchIndex++) {
    const startIdx = batchIndex * RESIZE_BATCH_SIZE
    const endIdx = Math.min((batchIndex + 1) * RESIZE_BATCH_SIZE, packedImages.length)
    const batchImages = packedImages.slice(startIdx, endIdx)

    const batchProgress = 50 + (batchIndex / batches * 40)
    await updateStatus(batchProgress, `Processing batch ${batchIndex + 1}/${batches} (images ${startIdx + 1}-${endIdx})`)

    const batchComposites: Array<any> = []

    for (const img of batchImages) {
      const imgPath = path.join(imagesDir, img.filename)
      if (!fs.existsSync(imgPath)) {
        console.warn(`File not found: ${imgPath}`)
        continue
      }

      try {
        const tempFilename = `processed_${Date.now()}_${img.filename}`
        const tempFilePath = path.join(tempDir, tempFilename)

        // Ensure parent directories exist
        const tempFileDir = path.dirname(tempFilePath)
        if (!fs.existsSync(tempFileDir)) {
          fs.mkdirSync(tempFileDir, { recursive: true })
        }

        // Process image
        const sharpInstance = sharp(imgPath)
          .resize(img.width, img.height)
          .ensureAlpha()
          .png()

        await sharpInstance.toFile(tempFilePath)

        // Add to composites
        batchComposites.push({
          input: tempFilePath,
          left: img.x,
          top: img.y,
          gravity: 'northwest',
          blend: 'over',
        })
      }
      catch (err) {
        console.error(`Error processing ${img.filename}:`, err)
      }
    }

    // Add batch composites to overall composites
    allComposites.push(...batchComposites)
  }

  // Composite all images at once
  await updateStatus(90, `Compositing all ${allComposites.length} images...`)
  atlas = atlas.composite(allComposites)

  await updateStatus(95, 'Saving atlas image and metadata...')
  const atlasImagePath = path.join(dataDir, 'atlas.png')

  // Save with maximum quality
  await atlas.png({ quality: 100 }).toFile(atlasImagePath)

  console.info(`Atlas image saved to ${atlasImagePath}`)

  // Verify atlas file
  const atlasStats = fs.statSync(atlasImagePath)
  console.info(`Atlas file size: ${atlasStats.size} bytes`)

  // Verify image dimensions
  try {
    const meta = await sharp(atlasImagePath).metadata()
    console.info(`Saved atlas dimensions: ${meta.width}x${meta.height}`)

    if (meta.width === 0 || meta.height === 0) {
      throw new Error('Invalid atlas image')
    }
  }
  catch (err) {
    console.error('Atlas image verification failed:', err)
    throw err
  }

  // Save atlas metadata
  const atlasJsonPath = path.join(dataDir, 'atlas.json')
  fs.writeFileSync(atlasJsonPath, JSON.stringify(atlasCoordinates, null, 2))
  console.info(`Atlas JSON metadata saved to ${atlasJsonPath}`)

  // Clean up temp directory
  console.info('Cleaning up temporary files...')
  try {
    const tempFiles = fs.readdirSync(tempDir)
    for (const file of tempFiles) {
      fs.unlinkSync(path.join(tempDir, file))
    }
    fs.rmdirSync(tempDir)
  }
  catch (err) {
    console.warn('Error cleaning temp directory:', err)
  }

  await updateStatus(100, 'Atlas generation complete!', 'complete')
  return {
    atlasImagePath,
    atlasJsonPath,
    dimensions: { width: atlasWidth, height: atlasHeight },
    scalingFactor,
  }
}

// Event handler for atlas generation
export default defineEventHandler(async () => {
  try {
    const storage = useStorage('atlas')
    await storage.setItem('status', {
      status: 'in_progress',
      progress: 0,
      message: 'Starting atlas generation...',
      lastUpdated: new Date().toISOString(),
    } as AtlasStatus)

    const result = await generateAtlas()
    return { success: true, ...result }
  }
  catch (error: any) {
    console.error('An error occurred:', error)

    const storage = useStorage('atlas')
    await storage.setItem('status', {
      status: 'error',
      progress: 0,
      message: `Error: ${error.message || 'Unknown error'}`,
      lastUpdated: new Date().toISOString(),
    } as AtlasStatus)

    return {
      success: false,
      error: error.message,
    }
  }
})
