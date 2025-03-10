import { promises as fs } from 'node:fs'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import handler from './[filename].put'

// Updated helper: allow injecting the request body.
function createMockEvent({ filename, body }: { filename: string, body?: any }) {
  const req = { headers: {}, method: 'PUT', body }
  const res = { statusCode: 200 }
  return {
    method: 'PUT', // top-level property for H3 method checking
    context: { params: { filename } },
    req,
    node: { req, res },
    _body: body, // our injected body
  } as any
}

describe('put /api/labels/[filename]', () => {
  let writeFileSpy: ReturnType<typeof vi.spyOn>
  let mkdirSpy: ReturnType<typeof vi.spyOn>
  let readBodySpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    // Prevent real file system operations.
    writeFileSpy = vi.spyOn(fs, 'writeFile').mockResolvedValue()
    mkdirSpy = vi.spyOn(fs, 'mkdir').mockResolvedValue()
    // Override readBody to return the injected body.
    readBodySpy = vi.spyOn(require('h3'), 'readBody').mockImplementation(async event => event._body)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('should write the file and return status ok for a valid request', async () => {
    const bodyData = { test: 'data' }
    // Provide the body data when creating the mock event.
    const event = createMockEvent({ filename: 'test.json', body: bodyData })

    const result = await handler(event)
    console.info('result', result)

    expect(result).toEqual({ status: 'ok' })

    // Ensure the directory is created.
    const dataDir = path.join(process.cwd(), '..', 'data')
    const labelsDir = path.join(dataDir, 'labels')
    expect(mkdirSpy).toHaveBeenCalledWith(labelsDir, { recursive: true })

    // Verify that writeFile was called with the correctly formatted JSON.
    const filePath = path.join(labelsDir, 'test.json')
    expect(writeFileSpy).toHaveBeenCalledWith(
      filePath,
      JSON.stringify(bodyData, null, 2),
      'utf-8',
    )
  })

  it('should return an error for a filename with directory traversal', async () => {
    const event = createMockEvent({ filename: '../evil.json' })
    readBodySpy.mockResolvedValue({})

    const result = await handler(event)

    expect(event.node.res.statusCode).toBe(400)
    expect(result).toEqual({
      error: 'Invalid filename. Cannot contain path separators or parent directory references.',
    })
    expect(writeFileSpy).not.toHaveBeenCalled()
  })

  it('should return an error for an invalid file extension', async () => {
    const event = createMockEvent({ filename: 'test.txt' })
    readBodySpy.mockResolvedValue({})

    const result = await handler(event)

    expect(event.node.res.statusCode).toBe(400)
    expect(result).toEqual({
      error: 'Invalid file extension. Allowed extensions: .json',
    })
    expect(writeFileSpy).not.toHaveBeenCalled()
  })

  it('should return an error for a filename containing a slash', async () => {
    const event = createMockEvent({ filename: 'folder/test.json' })
    readBodySpy.mockResolvedValue({})

    const result = await handler(event)

    expect(event.node.res.statusCode).toBe(400)
    expect(result).toEqual({
      error: 'Invalid filename. Cannot contain path separators or parent directory references.',
    })
    expect(writeFileSpy).not.toHaveBeenCalled()
  })

  it('should return an error for a filename containing a backslash', async () => {
    const event = createMockEvent({ filename: 'folder\\test.json' })
    readBodySpy.mockResolvedValue({})

    const result = await handler(event)

    expect(event.node.res.statusCode).toBe(400)
    expect(result).toEqual({
      error: 'Invalid filename. Cannot contain path separators or parent directory references.',
    })
    expect(writeFileSpy).not.toHaveBeenCalled()
  })

  it('should return an error if writeFile fails', async () => {
    const bodyData = { test: 'data' }
    const event = createMockEvent({ filename: 'test.json' })
    readBodySpy.mockResolvedValue(bodyData)
    writeFileSpy.mockRejectedValue(new Error('Disk full'))

    const result = await handler(event)

    expect(event.node.res.statusCode).toBe(500)
    expect(result).toEqual({ error: 'Disk full' })
  })
})
