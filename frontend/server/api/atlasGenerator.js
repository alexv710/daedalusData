import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { useStorage } from '#imports'
import { defineEventHandler } from 'h3'
import sharp from 'sharp'

// Update progress status
async function updateStatus(progress, message, status = 'in_progress') {
  const storage = useStorage('atlas')
  await storage.setItem('status', {
    status,
    progress,
    message,
    lastUpdated: new Date().toISOString(),
  })
}

async function generateAtlas() {
  // Start tracking progress
  await updateStatus(5, 'Initializing atlas generation...')

  // Since process.cwd() is likely /app/frontend, go one level up for the data folder.
  const dataDir = path.join(process.cwd(), '..', 'data')
  console.log('Using data directory:', dataDir)

  // Log the files in the data directory and in metadata
  console.log('Files in the data directory:', fs.readdirSync(dataDir))

  // Ensure metadata directory exists
  const metadataDir = path.join(dataDir, 'metadata')
  if (!fs.existsSync(metadataDir)) {
    console.warn('Metadata directory not found, creating it.')
    fs.mkdirSync(metadataDir, { recursive: true })
  }

  console.log('Files in the metadata directory:', fs.readdirSync(metadataDir))

  // Update progress
  await updateStatus(10, 'Reading image metadata...')

  // Adjust the metadata path accordingly.
  const metadataPath = path.join(dataDir, 'metadata', 'images.json')
  console.log('Looking for image metadata JSON at:', metadataPath)

  if (!fs.existsSync(metadataPath)) {
    console.error('Image metadata JSON not found at', metadataPath)
    await updateStatus(0, 'Image metadata JSON not found', 'error')
    throw new Error('Image metadata JSON not found')
  }

  const rawMetadata = JSON.parse(fs.readFileSync(metadataPath, 'utf-8'))

  // Convert the metadata object to an array if needed.
  let images = []
  if (Array.isArray(rawMetadata)) {
    images = rawMetadata
  }
  else {
    images = Object.entries(rawMetadata).map(([key, data]) => ({
      filename: `${key}.png`,
      ...data,
    }))
  }

  if (!images.length) {
    console.error('No images found in the JSON metadata.')
    await updateStatus(0, 'No images found in the JSON metadata', 'error')
    throw new Error('No images found in the JSON metadata')
  }

  // Update progress
  await updateStatus(15, `Found ${images.length} images in metadata. Reading image dimensions...`)

  // For each image, get its actual width and height from the file.
  let processedCount = 0
  images = await Promise.all(
    images.map(async (img) => {
      const imgPath = path.join(dataDir, 'images', img.filename)
      if (!fs.existsSync(imgPath)) {
        console.warn(`File not found: ${imgPath}`)
        return null
      }
      try {
        const meta = await sharp(imgPath).metadata()
        processedCount++

        // Update progress occasionally (every 10% of images)
        if (processedCount % Math.max(1, Math.floor(images.length / 10)) === 0) {
          const percent = Math.min(30, 15 + (processedCount / images.length * 15))
          await updateStatus(percent, `Reading image dimensions: ${processedCount}/${images.length}`)
        }

        return {
          ...img,
          width: meta.width,
          height: meta.height,
          originalWidth: meta.width, // Store original dimensions
          originalHeight: meta.height,
        }
      }
      catch (err) {
        console.error(`Error reading metadata for ${img.filename}:`, err)
        return null
      }
    }),
  )
  images = images.filter(img => img !== null)

  // Sort images by height descending (helps with packing)
  images.sort((a, b) => b.height - a.height)

  // Update progress
  await updateStatus(35, 'Calculating atlas dimensions and scaling factor...')

  // Atlas settings
  const MAX_ATLAS_WIDTH = 8192
  const MAX_ATLAS_HEIGHT = 8192
  const MAX_PIXEL_COUNT = 67108864

  // Calculate total area of all images and estimate required atlas size
  const totalImageArea = images.reduce((sum, img) => sum + (img.width * img.height), 0)
  console.log(`Total area of all images: ${totalImageArea} pixels`)

  // Estimate the atlas height if we use the full width
  const estimatedAtlasHeight = Math.ceil(totalImageArea / MAX_ATLAS_WIDTH)
  console.log(`Estimated atlas height at full width: ${estimatedAtlasHeight} pixels`)

  // Calculate scaling factor to fit within limits (if needed)
  let scalingFactor = 1.0
  if (estimatedAtlasHeight > MAX_ATLAS_HEIGHT || totalImageArea > MAX_PIXEL_COUNT) {
    // Calculate scaling based on area
    const targetArea = Math.min(MAX_ATLAS_WIDTH * MAX_ATLAS_HEIGHT, MAX_PIXEL_COUNT)
    scalingFactor = Math.sqrt(targetArea / totalImageArea)
    console.log(`Scaling all images by factor: ${scalingFactor.toFixed(4)}`)

    // Apply scaling to image dimensions
    images.forEach((img) => {
      img.width = Math.max(1, Math.floor(img.width * scalingFactor))
      img.height = Math.max(1, Math.floor(img.height * scalingFactor))
    })
  }

  // Update progress
  await updateStatus(40, 'Calculating image positions in atlas...')

  // First pass: determine positions for each image
  let currentX = 0
  let currentY = 0
  let rowMaxHeight = 0

  // This object will map each filename to its atlas coordinates.
  const atlasCoordinates = {}

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
  console.log(`Final atlas dimensions: ${atlasWidth}x${atlasHeight}`)

  // Update progress
  await updateStatus(45, 'Creating blank atlas image...')

  // Create a blank atlas image using sharp.
  let atlas = sharp({
    create: {
      width: atlasWidth,
      height: atlasHeight,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })

  // Update progress
  await updateStatus(50, 'Preparing images for composition...')

  // Ensure temp directory exists for scaled images
  const tempDir = path.join(dataDir, 'temp')
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true })
  }

  // Build an array of composite operations to place each image in the atlas.
  const composites = []
  processedCount = 0

  // Process images in smaller batches to avoid overwhelming the system
  const BATCH_SIZE = 50
  const batches = Math.ceil(images.length / BATCH_SIZE)

  for (let batchIndex = 0; batchIndex < batches; batchIndex++) {
    const startIdx = batchIndex * BATCH_SIZE
    const endIdx = Math.min((batchIndex + 1) * BATCH_SIZE, images.length)
    const batchImages = images.slice(startIdx, endIdx)

    // Update progress for batch
    const batchProgress = 50 + (batchIndex / batches * 40)
    await updateStatus(batchProgress, `Processing images batch ${batchIndex + 1}/${batches} (${startIdx} to ${endIdx})...`)

    // Process this batch of images
    const batchComposites = await Promise.all(
      batchImages.map(async (img) => {
        const imgPath = path.join(dataDir, 'images', img.filename)
        if (!fs.existsSync(imgPath)) {
          console.warn(`File not found: ${imgPath}`)
          return null
        }

        const { x, y } = atlasCoordinates[img.filename]

        // Need to resize the image before compositing if scaling factor is not 1
        if (scalingFactor < 1.0) {
          const resizedImagePath = path.join(tempDir, `scaled_${img.filename}`)

          // Resize the image and save to temporary location
          try {
            await sharp(imgPath)
              .resize(img.width, img.height)
              .toFile(resizedImagePath)

            // Return the composite operation with the resized image
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
          // Use original image if no scaling needed
          return {
            input: imgPath,
            left: x,
            top: y,
          }
        }
      }),
    )

    // Add valid composites to the main array
    composites.push(...batchComposites.filter(c => c !== null))
  }

  // Update progress
  await updateStatus(90, 'Compositing images into atlas...')

  // Composite the images - we need to chunk this if there are a lot of images
  atlas = atlas.composite(composites)

  // Update progress
  await updateStatus(95, 'Saving atlas image and metadata...')

  // Write the atlas image to disk in the data folder.
  const atlasImagePath = path.join(dataDir, 'atlas.png')
  await atlas.png().toFile(atlasImagePath)
  console.log(`Atlas image saved to ${atlasImagePath}`)

  // Write the JSON file with atlas coordinates.
  const atlasJsonPath = path.join(dataDir, 'atlas.json')
  fs.writeFileSync(atlasJsonPath, JSON.stringify(atlasCoordinates, null, 2))
  console.log(`Atlas JSON metadata saved to ${atlasJsonPath}`)

  // Clean up temporary files if they exist
  if (scalingFactor < 1.0) {
    console.log('Cleaning up temporary files...')
    // This is a simple example - consider using fs.rm with recursive option for proper cleanup
    images.forEach((img) => {
      const tempPath = path.join(tempDir, `scaled_${img.filename}`)
      if (fs.existsSync(tempPath)) {
        fs.unlinkSync(tempPath)
      }
    })
  }

  // Update progress to complete
  await updateStatus(100, 'Atlas generation complete!', 'complete')

  return {
    atlasImagePath,
    atlasJsonPath,
    dimensions: { width: atlasWidth, height: atlasHeight },
    scalingFactor,
  }
}

// Export a handler that calls generateAtlas when this API endpoint is requested.
export default defineEventHandler(async (event) => {
  try {
    // Reset status in case of previous runs
    const storage = useStorage('atlas')
    await storage.setItem('status', {
      status: 'in_progress',
      progress: 0,
      message: 'Starting atlas generation...',
      lastUpdated: new Date().toISOString(),
    })

    const result = await generateAtlas()
    return { success: true, ...result }
  }
  catch (error) {
    console.error('An error occurred:', error)

    // Update status to error
    const storage = useStorage('atlas')
    await storage.setItem('status', {
      status: 'error',
      progress: 0,
      message: `Error: ${error.message || 'Unknown error'}`,
      lastUpdated: new Date().toISOString(),
    })

    return { success: false, error: error.message }
  }
})
```