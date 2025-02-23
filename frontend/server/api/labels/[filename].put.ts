import type { H3Event } from 'h3'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { readBody } from 'h3'

export default async (event: H3Event) => {
  try {
    const body = await readBody(event)
    // Extract the filename from the route parameters.
    const { filename } = event.context.params as { filename: string }
    // Compute the base data directory consistently with your other routes.
    const dataDir = path.join(process.cwd(), '..', 'data')
    // Ensure the labels directory exists.
    const labelsDir = path.join(dataDir, 'labels')
    await fs.mkdir(labelsDir, { recursive: true })
    // Compute the full file path.
    const filePath = path.join(labelsDir, filename)
    await fs.writeFile(filePath, JSON.stringify(body, null, 2), 'utf-8')
    return { status: 'ok' }
  }
  catch (error: any) {
    event.res.statusCode = 500
    return { error: error.message }
  }
}
