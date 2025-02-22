import fs from 'node:fs/promises'
import path from 'node:path'
// server/routes/files/[type].get.ts
import { defineEventHandler } from 'h3'

async function getFileStats(dirPath: string) {
  try {
    const files = await fs.readdir(dirPath)
    const statsPromises = files.map(async (file) => {
      const filePath = path.join(dirPath, file)
      const stats = await fs.stat(filePath)
      return {
        name: file,
        size: stats.size,
        lastModified: stats.mtime,
      }
    })
    return Promise.all(statsPromises)
  }
  catch (error) {
    console.error('Error reading directory:', dirPath, error)
    return []
  }
}

export default defineEventHandler(async (event) => {
  const type = event.context.params?.type

  if (!type || !['images', 'metadata'].includes(type)) {
    return { error: 'Invalid file type requested' }
  }

  try {
    // Debug log
    const dirPath = path.join('/app/data', type)
    console.log('Attempting to read directory:', dirPath)

    const files = await getFileStats(dirPath)
    console.log(`Found ${files.length} files in ${type}`)

    // For images, only return supported formats
    if (type === 'images') {
      const imageFiles = files.filter(f =>
        f.name.toLowerCase().match(/\.(jpg|jpeg|png|gif)$/))
      return { files: imageFiles }
    }

    // For metadata, only return json files
    if (type === 'metadata') {
      const metaFiles = files.filter(f =>
        f.name.toLowerCase().endsWith('.json'))
      return { files: metaFiles }
    }
  }
  catch (error) {
    console.error(`Error reading ${type} directory:`, error)
    return { error: `Failed to read ${type} directory`, details: error.message }
  }
})
