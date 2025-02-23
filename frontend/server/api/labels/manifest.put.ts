import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { defineEventHandler, readBody, setResponseStatus } from 'h3'

export default defineEventHandler(async (event) => {
  try {
    // Use one level up as in your atlas generator.
    const dataDir = path.join(process.cwd(), '..', 'data')
    console.log('Using data directory:', dataDir)

    // Define the labels directory path.
    const labelsDir = path.join(dataDir, 'labels')
    console.log('Labels directory path:', labelsDir)

    // Create the labels directory if it doesn't exist.
    if (!fs.existsSync(labelsDir)) {
      console.log('Labels directory does not exist. Creating it.')
      fs.mkdirSync(labelsDir, { recursive: true })
    }

    // Read the request body.
    const body = await readBody(event)
    console.log('Saving manifest:', body)
    console.log('Writing manifest to:', labelsDir)

    // Write the manifest file to the labels directory.
    const manifestPath = path.join(labelsDir, 'label_manifest.json')
    fs.writeFileSync(manifestPath, JSON.stringify(body, null, 2), 'utf-8')
    console.log('Manifest saved successfully to', manifestPath)
    
    return { status: 'ok' }
  } catch (error: any) {
    setResponseStatus(event, 500)
    console.error('Error saving manifest:', error)
    return { error: error.message }
  }
})
