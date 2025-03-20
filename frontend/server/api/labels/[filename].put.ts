import type { H3Event } from 'h3'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { readBody } from 'h3'

export default async (event: H3Event) => {
  try {
    const body = await readBody(event)
    // Extract the filename from the route parameters.
    const { filename } = event.context.params as { filename: string }

    // Security: Validate filename to explicitly prevent directory traversal
    if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
      event.node.res.statusCode = 400
      return { error: 'Invalid filename. Cannot contain path separators or parent directory references.' }
    }

    // Additional security: Only allow certain file extensions
    const allowedExtensions = ['.json']
    const ext = path.extname(filename).toLowerCase()
    if (!allowedExtensions.includes(ext)) {
      event.node.res.statusCode = 400
      return { error: `Invalid file extension. Allowed extensions: ${allowedExtensions.join(', ')}` }
    }

    // Compute the base data directory consistently with your other routes.
    const dataDir = path.join(process.cwd(), '..', 'data')
    // Ensure the labels directory exists.
    const labelsDir = path.join(dataDir, 'labels')
    await fs.mkdir(labelsDir, { recursive: true })

    // Compute the full file path - path.join will sanitize, but we already validated above for extra security
    const filePath = path.join(labelsDir, filename)

    // Verify the resulting path is still within the labels directory (defense in depth)
    if (!filePath.startsWith(labelsDir)) {
      event.node.res.statusCode = 400
      return { error: 'Invalid path location' }
    }

    await fs.writeFile(filePath, JSON.stringify(body, null, 2), 'utf-8')
    return { status: 'ok' }
  }
  catch (error: any) {
    event.node.res.statusCode = 500
    return { error: error.message }
  }
}
