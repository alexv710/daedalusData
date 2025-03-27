import fs, { createReadStream } from 'node:fs'
import path from 'node:path'
import { createError, defineEventHandler, sendStream } from 'h3'

export default defineEventHandler(async (event) => {
  // Retrieve the catch-all parameter.
  // When using a catch-all route (e.g. [ ...params ].get.ts),
  // the parameter might be passed as a string (with slashes) or as an array.
  const rawParams = event.context.params?.params
  let params: string[] = []
  if (typeof rawParams === 'string') {
    params = rawParams.split('/')
  }
  else if (Array.isArray(rawParams)) {
    params = rawParams
  }
  console.info('Requested params:', params)
  console.info('Request method:', event.node.req.method)

  let relativePath: string
  if (params.length === 1) {
    // For a single parameter, if it's "atlas.png" or "atlas.json", serve from the root.
    if (params[0] === 'atlas.png' || params[0] === 'atlas.json') {
      relativePath = params[0]
    }
    else {
      // Otherwise, assume it's an image in the "images" folder.
      relativePath = path.join('images', params[0])
    }
  }
  else if (params.length === 2) {
    const dir = params[0].toLowerCase()
    const file = params[1]
    // Allowed directories.
    const allowedDirs = ['images', 'metadata', 'labels', 'projections', 'features']
    if (!allowedDirs.includes(dir)) {
      throw createError({
        statusCode: 400,
        statusMessage: 'Bad Request',
        message: 'Invalid directory requested',
      })
    }
    // For directories other than "images", only allow .json files.
    if (dir !== 'images' && !file.toLowerCase().endsWith('.json')) {
      throw createError({
        statusCode: 400,
        statusMessage: 'Bad Request',
        message: `Only .json files are allowed in the ${dir} directory`,
      })
    }
    relativePath = path.join(dir, file)
  }
  else {
    throw createError({
      statusCode: 400,
      statusMessage: 'Bad Request',
      message: 'Invalid parameters',
    })
  }

  // Define possible base directories. This attempts /app/data first and falls back to /data.
  const basePaths = [
    path.join(process.cwd(), '/app/data'),
    path.join(process.cwd(), '/data'),
    path.join(process.cwd(), '../data'),
    path.resolve(process.cwd(), '../../data'), // Going two levels up if needed
  ]

  let finalPath: string | null = null
  for (const base of basePaths) {
    const candidate = path.join(base, relativePath)
    try {
      await fs.promises.access(candidate, fs.constants.R_OK)
      finalPath = candidate
      console.info(`File exists at: ${candidate}`)
      break
    }
    catch (error) {
      console.info(`File ${candidate} not accessible:`, error.message)
      finalPath = null
      // Try the next base path.
    }
  }
  console.info('Final path:', finalPath)

  if (finalPath === null) {
    console.error('File not found:', relativePath)
    throw createError({
      statusCode: 404,
      statusMessage: 'Not Found',
      message: 'File not found',
    })
  }

  // Set the appropriate Content-Type header based on the file extension.
  let contentType = 'application/octet-stream'
  if (finalPath.endsWith('.png')) {
    contentType = 'image/png'
  }
  else if (finalPath.endsWith('.jpg') || finalPath.endsWith('.jpeg')) {
    contentType = 'image/jpeg'
  }
  else if (finalPath.endsWith('.gif')) {
    contentType = 'image/gif'
  }
  else if (finalPath.endsWith('.json')) {
    contentType = 'application/json'
  }

  event.node.res.setHeader('Content-Type', contentType)

  // Get file stats to set Content-Length header
  const stats = await fs.promises.stat(finalPath)
  event.node.res.setHeader('Content-Length', stats.size)

  // For HEAD requests, we just return the headers without the body
  if (event.node.req.method === 'HEAD') {
    event.node.res.statusCode = 200
    event.node.res.end()
    return
  }

  // For GET requests, stream the file to the client
  return sendStream(event, createReadStream(finalPath))
})
