import fs from 'node:fs'
import path from 'node:path'
import { defineEventHandler, send, sendStream, setResponseStatus } from 'h3'

const CONTENT_TYPE_MAP: Record<string, string> = {
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.json': 'application/json',
}
const DEFAULT_CONTENT_TYPE = 'application/octet-stream'

async function findRelevantPaths(): Promise<string> {
  const basePaths = [
    path.join(process.cwd(), '/app/data'),
    path.join(process.cwd(), '/data'),
    path.join(process.cwd(), '../data'),
  ]

  const dataDir = basePaths.find(p => fs.existsSync(p))
  if (!dataDir) {
    throw new Error('Could not find an accessible data directory')
  }
  return dataDir
}

export default defineEventHandler(async (event) => {
  const DATA_ROOT = await findRelevantPaths()
  const rawParams = event.context.params?.params
  const requestedRelativePath = Array.isArray(rawParams) ? rawParams.join('/') : rawParams || ''

  if (!requestedRelativePath) {
    setResponseStatus(event, 400, 'Bad Request')
    return send(event, 'No file path specified')
  }

  const finalPath = path.join(DATA_ROOT, requestedRelativePath)

  const relativeFromRoot = path.relative(DATA_ROOT, finalPath)
  if (relativeFromRoot.startsWith('..') || path.isAbsolute(relativeFromRoot)) {
    console.warn(`Potential path traversal attempt: ${requestedRelativePath} resolved outside DATA_ROOT`)
    setResponseStatus(event, 400, 'Bad Request')
    return send(event, 'Invalid file path')
  }

  let stats: fs.Stats
  try {
    stats = await fs.promises.stat(finalPath)

    if (!stats.isFile()) {
      setResponseStatus(event, 400, 'Bad Request')
      return send(event, 'Not a file')
    }
  }
  catch (error: any) {
    // Re-throw if it's already a handled error
    if (error.statusCode) {
      throw error
    }
    // Handle file not found specifically
    if (error.code === 'ENOENT') {
      console.warn(`File not found: ${finalPath}`)
      setResponseStatus(event, 404, 'Not Found')
      return send(event, 'File not found')
    }
    // Handle other potential errors (permissions, etc.)
    console.error(`Error accessing file ${finalPath}:`, error)
    setResponseStatus(event, 500, 'Internal Server Error')
    return send(event, 'Server error')
  }

  const extension = path.extname(finalPath).toLowerCase()
  const contentType = CONTENT_TYPE_MAP[extension] || DEFAULT_CONTENT_TYPE
  event.node.res.setHeader('Content-Type', contentType)
  event.node.res.setHeader('Content-Length', stats.size)

  if (event.node.req.method === 'HEAD') {
    event.node.res.statusCode = 200
    event.node.res.end()
    return
  }

  // GET: Stream the file content.
  if (event.node.req.method === 'GET') {
    return sendStream(event, fs.createReadStream(finalPath))
  }
})
