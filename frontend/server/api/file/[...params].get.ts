import fs from 'node:fs'
import path from 'node:path'
import { createError, defineEventHandler, sendStream } from 'h3'


const CONTENT_TYPE_MAP: Record<string, string> = {
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.json': 'application/json',
};
const DEFAULT_CONTENT_TYPE = 'application/octet-stream';

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
const DATA_ROOT = await findRelevantPaths()
console.info(`Serving static files from: ${DATA_ROOT}`);

export default defineEventHandler(async (event) => {
  const rawParams = event.context.params?.params;
  const requestedRelativePath = Array.isArray(rawParams) ? rawParams.join('/') : rawParams || '';

  if (!requestedRelativePath) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Bad Request',
      message: 'No file path specified in the request.',
    });
  }

  const finalPath = path.join(DATA_ROOT, requestedRelativePath);

  const relativeFromRoot = path.relative(DATA_ROOT, finalPath);
  if (relativeFromRoot.startsWith('..') || path.isAbsolute(relativeFromRoot)) {
      console.warn(`Potential path traversal attempt: ${requestedRelativePath} resolved outside DATA_ROOT`);
      throw createError({
          statusCode: 400,
          statusMessage: 'Bad Request',
          message: 'Invalid file path requested.',
      });
  }

  let stats: fs.Stats;
  try {
    stats = await fs.promises.stat(finalPath);

    if (!stats.isFile()) {
        throw createError({
            statusCode: 400,
            statusMessage: 'Bad Request',
            message: 'Requested path is not a file.',
        });
    }
  } catch (error: any) {
    // Handle file not found specifically
    if (error.code === 'ENOENT') {
      console.warn(`File not found: ${finalPath}`);
      throw createError({
        statusCode: 404,
        statusMessage: 'Not Found',
        message: 'The requested file could not be found.',
      });
    }
    // Handle other potential errors (permissions, etc.)
    console.error(`Error accessing file ${finalPath}:`, error);
    throw createError({
      statusCode: 500,
      statusMessage: 'Internal Server Error',
      message: 'Could not access the requested file due to a server error.',
    });
  }

  const extension = path.extname(finalPath).toLowerCase();
  const contentType = CONTENT_TYPE_MAP[extension] || DEFAULT_CONTENT_TYPE;
  event.node.res.setHeader('Content-Type', contentType);
  event.node.res.setHeader('Content-Length', stats.size);


  if (event.node.req.method === 'HEAD') {
    event.node.res.statusCode = 200;
    event.node.res.end();
    return;
  }

  // GET: Stream the file content.
  if (event.node.req.method === 'GET') {
    return sendStream(event, fs.createReadStream(finalPath));
  }
});