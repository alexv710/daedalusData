import fs from 'node:fs'
import path from 'node:path'
import { defineEventHandler } from 'h3'
import sharp from 'sharp'

async function generateAtlas() {
  // Since process.cwd() is likely /app/frontend, go one level up for the data folder.
  const dataDir = path.join(process.cwd(), '..', 'data')
  console.log('Using data directory:', dataDir)

  // Log the files in the data directory and in metadata
  console.log('Files in the data directory:', fs.readdirSync(dataDir))
  console.log('Files in the metadata directory:', fs.readdirSync(path.join(dataDir, 'metadata')))

  // Adjust the metadata path accordingly.
  const metadataPath = path.join(dataDir, 'metadata', 'images.json')
  console.log('Looking for image metadata JSON at:', metadataPath)

  if (!fs.existsSync(metadataPath)) {
    console.error('Image metadata JSON not found at', metadataPath)
    throw new Error('Image metadata JSON not found')
  }

  const rawMetadata = JSON.parse(fs.readFileSync(metadataPath, 'utf-8'))

  // Convert the metadata object to an array if needed.
  // Here we assume each key corresponds to an image file (e.g., "bulbasaur" → "bulbasaur.png").
  let images = []
  if (Array.isArray(rawMetadata)) {
    images = rawMetadata
  } else {
    images = Object.entries(rawMetadata).map(([key, data]) => ({
      filename: `${key}.png`,
      ...data,
    }))
  }

  if (!images.length) {
    console.error('No images found in the JSON metadata.')
    throw new Error('No images found in the JSON metadata')
  }

  // For each image, get its actual width and height from the file.
  images = await Promise.all(
    images.map(async (img) => {
      const imgPath = path.join(dataDir, 'images', img.filename)
      if (!fs.existsSync(imgPath)) {
        console.warn(`File not found: ${imgPath}`)
        return null
      }
      try {
        const meta = await sharp(imgPath).metadata()
        return {
          ...img,
          width: meta.width,
          height: meta.height,
        }
      } catch (err) {
        console.error(`Error reading metadata for ${img.filename}:`, err)
        return null
      }
    })
  )
  images = images.filter((img) => img !== null)

  // Sort images by height descending (optional, helps with packing)
  images.sort((a, b) => b.height - a.height)

  // Atlas settings
  const MAX_ATLAS_WIDTH = 4096
  let currentX = 0
  let currentY = 0
  let rowMaxHeight = 0

  // This object will map each filename to its atlas coordinates.
  const atlasCoordinates = {}

  // First pass: determine positions for each image and final atlas height.
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
    }

    currentX += img.width
    rowMaxHeight = Math.max(rowMaxHeight, img.height)
  }

  const atlasWidth = MAX_ATLAS_WIDTH
  const atlasHeight = currentY + rowMaxHeight
  console.log(`Atlas dimensions: ${atlasWidth}x${atlasHeight}`)

  // Create a blank atlas image using sharp.
  let atlas = sharp({
    create: {
      width: atlasWidth,
      height: atlasHeight,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })

  // Build an array of composite operations to place each image in the atlas.
  const composites = []
  for (const img of images) {
    const imgPath = path.join(dataDir, 'images', img.filename)
    if (!fs.existsSync(imgPath)) {
      console.warn(`File not found: ${imgPath}`)
      continue
    }
    const { x, y } = atlasCoordinates[img.filename]
    composites.push({
      input: imgPath,
      left: x,
      top: y,
    })
  }

  atlas = atlas.composite(composites)

  // Write the atlas image to disk in the data folder.
  const atlasImagePath = path.join(dataDir, 'atlas.png')
  await atlas.png().toFile(atlasImagePath)
  console.log(`Atlas image saved to ${atlasImagePath}`)

  // Write the JSON file with atlas coordinates.
  const atlasJsonPath = path.join(dataDir, 'atlas.json')
  fs.writeFileSync(atlasJsonPath, JSON.stringify(atlasCoordinates, null, 2))
  console.log(`Atlas JSON metadata saved to ${atlasJsonPath}`)

  return { atlasImagePath, atlasJsonPath }
}

// Export a lazy handler that calls generateAtlas when thzis API endpoint is requested.
export default defineEventHandler(async (event) => {
  try {
    const result = await generateAtlas()
    return { success: true, ...result }
  } catch (error) {
    console.error('An error occurred:', error)
    return { success: false, error: error.message }
  }
})
