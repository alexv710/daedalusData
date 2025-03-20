import fs from 'node:fs/promises'
import path from 'node:path'
import { useStorage } from '#imports'
import { defineEventHandler } from 'h3'

export default defineEventHandler(async () => {
  // Get the atlas generation status from storage
  const storage = useStorage('atlas')
  const status = await storage.getItem('status') || {
    status: 'unknown',
    progress: 0,
    message: 'No atlas generation in progress',
    lastUpdated: null,
  }

  // Check if an atlas generation is in progress but hasn't been updated recently (> 30 seconds)
  if (status.status === 'in_progress' && status.lastUpdated) {
    const lastUpdate = new Date(status.lastUpdated).getTime()
    const now = Date.now()

    // If no updates for more than 30 seconds, assume something went wrong
    if (now - lastUpdate > 30000) {
      // Check if the atlas files exist to determine if it actually completed
      const dataDir = path.join(process.cwd(), '..', 'data')
      const atlasImagePath = path.join(dataDir, 'atlas.png')
      const atlasJsonPath = path.join(dataDir, 'atlas.json')

      try {
        const [imageExists, jsonExists] = await Promise.all([
          fs.access(atlasImagePath).then(() => true).catch(() => false),
          fs.access(atlasJsonPath).then(() => true).catch(() => false),
        ])

        if (imageExists && jsonExists) {
          // It completed successfully despite no status update
          status.status = 'complete'
          status.progress = 100
          status.message = 'Atlas generation complete!'
        }
        else {
          // It likely failed
          status.status = 'error'
          status.message = 'Atlas generation timed out or failed'
        }

        // Update the stored status
        await storage.setItem('status', status)
      }
      catch (error) {
        console.error('Error checking atlas files:', error)
      }
    }
  }

  return status
})
