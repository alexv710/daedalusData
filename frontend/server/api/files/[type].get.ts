import fs from 'node:fs/promises'
import path from 'node:path'
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

  // Expanded list of valid file types
  const validTypes = ['images', 'metadata', 'features', 'projections']

  if (!type || !validTypes.includes(type)) {
    return { error: 'Invalid file type requested', validTypes }
  }

  try {
    // Debug log
    const dirPath = path.join('/app/data', type)
    console.log('Attempting to read directory:', dirPath)

    // Make sure the directory exists, if not create it
    try {
      await fs.access(dirPath)
    }
    catch (error) {
      console.log(`Creating directory ${dirPath} as it doesn't exist yet`)
      await fs.mkdir(dirPath, { recursive: true })
    }

    const files = await getFileStats(dirPath)
    console.log(`Found ${files.length} files in ${type}`)

    // Filter files based on type
    let filteredFiles = files

    if (type === 'images') {
      // For images, only return supported formats
      filteredFiles = files.filter(f =>
        f.name.toLowerCase().match(/\.(jpg|jpeg|png|gif)$/))
    }
    else if (type === 'metadata') {
      // For metadata, only return json files
      filteredFiles = files.filter(f =>
        f.name.toLowerCase().endsWith('.json'))
    }
    else if (type === 'features') {
      // For features, return csv, json, and npz files
      filteredFiles = files.filter(f =>
        f.name.toLowerCase().match(/\.(csv|json|npz)$/))
    }
    else if (type === 'projections') {
      // For projections, return json files
      filteredFiles = files.filter(f =>
        f.name.toLowerCase().endsWith('.json'))
    }

    // Sort files by last modified (newest first) to show the most recent ones at the top
    filteredFiles.sort((a, b) => {
      const dateA = new Date(a.lastModified).getTime()
      const dateB = new Date(b.lastModified).getTime()
      return dateB - dateA
    })

    return { files: filteredFiles }
  }
  catch (error) {
    console.error(`Error reading ${type} directory:`, error)
    return { error: `Failed to read ${type} directory`, details: error.message }
  }
})
