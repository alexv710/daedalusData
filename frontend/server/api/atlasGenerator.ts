import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { useStorage } from '#imports'
import { defineEventHandler } from 'h3'
import sharp from 'sharp'

interface AtlasStatus {
  status: string
  progress: number
  message: string
  lastUpdated: string
}

async function updateStatus(progress: number, message: string, status: string = 'in_progress'): Promise<void> {
  const storage = useStorage('atlas')
  await storage.setItem('status', {
    status,
    progress,
    message,
    lastUpdated: new Date().toISOString(),
  } as AtlasStatus)
}

interface ImageMeta {
  filename: string
  width: number
  height: number
  originalWidth: number
  originalHeight: number
  [key: string]: any
}

async function generateAtlas(): Promise<{
  atlasImagePath: string
  atlasJsonPath: string
  dimensions: { width: number, height: number }
  scalingFactor: number
}> {
  // Start tracking progress
  await updateStatus(5, 'Initializing atlas generation...')

  // Try multiple paths to find the data directory
  let dataDir
  const basePaths = [
    path.join(process.cwd(), '/app/data'),
    path.join(process.cwd(), '/data'),
    path.join(process.cwd(), '../data'),
  ]

  for (const potentialPath of basePaths) {
    try {
      await fs.promises.access(potentialPath)
      dataDir = potentialPath
      console.info(`Found accessible data directory at: ${dataDir}`)
      break
    }
    catch (error) {
      console.info(`Directory ${potentialPath} not accessible: ${error.message}`)
    }
  }

  if (!dataDir) {
    console.error('Could not find an accessible data directory')
  }

  console.info('Using data directory:', dataDir)
  console.info('Files in the data directory:', fs.readdirSync(dataDir))

  // Set up the images directory path.
  const imagesDir = path.join(dataDir, 'images')
  if (!fs.existsSync(imagesDir)) {
    console.error('Images directory not found at', imagesDir)
    await updateStatus(0, 'Images directory not found', 'error')
    throw new Error('Images directory not found')
  }

  // Update progress and read image files from the images directory.
  await updateStatus(10, 'Reading image files from images directory...')
  // Define allowed image extensions.
  const allowedExtensions = ['.png', '.jpg', '.jpeg']
  const imageFiles = fs.readdirSync(imagesDir)
    .filter(file => allowedExtensions.includes(path.extname(file).toLowerCase()))
  if (!imageFiles.length) {
    console.error('No image files found in the images directory.')
    await updateStatus(0, 'No image files found', 'error')
    throw new Error('No image files found')
  }

  // Create an array of ImageMeta objects from the list of filenames.
  let images: ImageMeta[] = imageFiles.map(file => ({
    filename: file,
    width: 0,
    height: 0,
    originalWidth: 0,
    originalHeight: 0,
  }))

  await updateStatus(15, `Found ${images.length} images. Reading image dimensions...`)

  let processedCount = 0
  images = await Promise.all(
    images.map(async (img) => {
      const imgPath = path.join(imagesDir, img.filename)
      if (!fs.existsSync(imgPath)) {
        console.warn(`File not found: ${imgPath}`)
        return null
      }
      try {
        const meta = await sharp(imgPath).metadata()
        processedCount++
        if (processedCount % Math.max(1, Math.floor(images.length / 10)) === 0) {
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
  images = images.filter((img): img is ImageMeta => img !== null)
  images.sort((a, b) => b.height - a.height)

  await updateStatus(35, 'Calculating atlas dimensions and scaling factor...')
  const MAX_ATLAS_WIDTH = 8192
  const MAX_ATLAS_HEIGHT = 8192
  const MAX_PIXEL_COUNT = 67108864

  const totalImageArea = images.reduce((sum, img) => sum + (img.width * img.height), 0)
  console.info(`Total area of all images: ${totalImageArea} pixels`)

  const estimatedAtlasHeight = Math.ceil(totalImageArea / MAX_ATLAS_WIDTH)
  console.info(`Estimated atlas height at full width: ${estimatedAtlasHeight} pixels`)

  let scalingFactor = 1.0
  if (estimatedAtlasHeight > MAX_ATLAS_HEIGHT || totalImageArea > MAX_PIXEL_COUNT) {
    const targetArea = Math.min(MAX_ATLAS_WIDTH * MAX_ATLAS_HEIGHT, MAX_PIXEL_COUNT)
    scalingFactor = Math.sqrt(targetArea / totalImageArea)
    console.info(`Scaling all images by factor: ${scalingFactor.toFixed(4)}`)
    images.forEach((img) => {
      img.width = Math.max(1, Math.floor(img.width * scalingFactor))
      img.height = Math.max(1, Math.floor(img.height * scalingFactor))
    })
  }

  await updateStatus(40, 'Calculating image positions in atlas...')
  let currentX = 0
  let currentY = 0
  let rowMaxHeight = 0

  const atlasCoordinates: { [key: string]: any } = {}
  for (const img of images) {
    if (currentX + img.width > MAX_ATLAS_WIDTH) {
      currentY += rowMaxHeight
      currentX = 0
      rowMaxHeight = 0
    }
    atlasCoordinates[img.filename] = {
      x: currentX,
      y: currentY,
      width: img.width,
      height: img.height,
      originalWidth: img.originalWidth,
      originalHeight: img.originalHeight,
      scalingFactor,
    }
    currentX += img.width
    rowMaxHeight = Math.max(rowMaxHeight, img.height)
  }
  const atlasWidth = MAX_ATLAS_WIDTH
  const atlasHeight = currentY + rowMaxHeight
  console.info(`Final atlas dimensions: ${atlasWidth}x${atlasHeight}`)

  await updateStatus(45, 'Creating blank atlas image...')
  let atlas = sharp({
    create: {
      width: atlasWidth,
      height: atlasHeight,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })

  await updateStatus(50, 'Preparing images for composition...')
  const tempDir = path.join(dataDir, 'temp')
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true })
  }

  const composites: Array<any> = []
  processedCount = 0
  const BATCH_SIZE = 50
  const batches = Math.ceil(images.length / BATCH_SIZE)
  for (let batchIndex = 0; batchIndex < batches; batchIndex++) {
    const startIdx = batchIndex * BATCH_SIZE
    const endIdx = Math.min((batchIndex + 1) * BATCH_SIZE, images.length)
    const batchImages = images.slice(startIdx, endIdx)
    const batchProgress = 50 + (batchIndex / batches * 40)
    await updateStatus(batchProgress, `Processing images batch ${batchIndex + 1}/${batches} (${startIdx} to ${endIdx})...`)
    const batchComposites = await Promise.all(
      batchImages.map(async (img) => {
        const imgPath = path.join(imagesDir, img.filename)
        if (!fs.existsSync(imgPath)) {
          console.warn(`File not found: ${imgPath}`)
          return null
        }
        const { x, y } = atlasCoordinates[img.filename]
        if (scalingFactor < 1.0) {
          const resizedImagePath = path.join(tempDir, `scaled_${img.filename}`)
          try {
            await sharp(imgPath)
              .resize(img.width, img.height)
              .toFile(resizedImagePath)
            return {
              input: resizedImagePath,
              left: x,
              top: y,
            }
          }
          catch (err) {
            console.error(`Error resizing ${img.filename}:`, err)
            return null
          }
        }
        else {
          return {
            input: imgPath,
            left: x,
            top: y,
          }
        }
      }),
    )
    composites.push(...batchComposites.filter(c => c !== null))
  }

  await updateStatus(90, 'Compositing images into atlas...')
  atlas = atlas.composite(composites)
  await updateStatus(95, 'Saving atlas image and metadata...')
  const atlasImagePath = path.join(dataDir, 'atlas.png')
  await atlas.png().toFile(atlasImagePath)
  console.info(`Atlas image saved to ${atlasImagePath}`)

  const atlasJsonPath = path.join(dataDir, 'atlas.json')
  fs.writeFileSync(atlasJsonPath, JSON.stringify(atlasCoordinates, null, 2))
  console.info(`Atlas JSON metadata saved to ${atlasJsonPath}`)

  if (scalingFactor < 1.0) {
    console.info('Cleaning up temporary files...')
    images.forEach((img) => {
      const tempPath = path.join(tempDir, `scaled_${img.filename}`)
      if (fs.existsSync(tempPath)) {
        fs.unlinkSync(tempPath)
      }
    })
  }

  await updateStatus(100, 'Atlas generation complete!', 'complete')
  return {
    atlasImagePath,
    atlasJsonPath,
    dimensions: { width: atlasWidth, height: atlasHeight },
    scalingFactor,
  }
}

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
    return { success: false, error: error.message }
  }
})
