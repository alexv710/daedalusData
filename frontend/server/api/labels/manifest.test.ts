// server/api/labels/manifest.test.ts
import fs from 'node:fs'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import handler from './manifest.put'

// Helper: create a minimal mock H3Event.
// We set the HTTP method at the top level and on req, and inject the body on both event._body and event.req.body.
function createMockEvent(bodyData?: any) {
  const req = { headers: {}, method: 'PUT', body: bodyData }
  const res = { statusCode: 200 }
  return {
    method: 'PUT', // needed by H3 for method checking
    req,
    node: { req, res },
    _body: bodyData, // our injected body
  } as any
}

describe('pUT /api/labels/manifest', () => {
  let existsSyncSpy: ReturnType<typeof vi.spyOn>
  let mkdirSyncSpy: ReturnType<typeof vi.spyOn>
  let writeFileSyncSpy: ReturnType<typeof vi.spyOn>
  let readBodySpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    // Spy on synchronous fs methods.
    existsSyncSpy = vi.spyOn(fs, 'existsSync')
    mkdirSyncSpy = vi.spyOn(fs, 'mkdirSync')
    writeFileSyncSpy = vi.spyOn(fs, 'writeFileSync')
    // Spy on readBody from h3 so that it returns our injected body.
    readBodySpy = vi.spyOn(require('h3'), 'readBody').mockImplementation(async (event) => {
      return event._body ?? event.req.body
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('should write the manifest file and return status ok when labels directory does not exist', async () => {
    existsSyncSpy.mockReturnValue(false) // simulate that the labels directory does not exist
    const bodyData = { manifest: 'data' }
    const event = createMockEvent(bodyData)

    const result = await handler(event)

    expect(result).toEqual({ status: 'ok' })

    const dataDir = path.join(process.cwd(), '..', 'data')
    const labelsDir = path.join(dataDir, 'labels')
    expect(existsSyncSpy).toHaveBeenCalledWith(labelsDir)
    // Because the directory didn't exist, mkdirSync should have been called.
    expect(mkdirSyncSpy).toHaveBeenCalledWith(labelsDir, { recursive: true })

    // Check that the manifest file is written with the correct data.
    const manifestPath = path.join(labelsDir, 'label_manifest.json')
    expect(writeFileSyncSpy).toHaveBeenCalledWith(
      manifestPath,
      JSON.stringify(bodyData, null, 2),
      'utf-8',
    )
  })

  it('should write the manifest file and return status ok when labels directory exists', async () => {
    existsSyncSpy.mockReturnValue(true) // simulate that the directory exists
    const bodyData = { manifest: 'data2' }
    const event = createMockEvent(bodyData)

    const result = await handler(event)

    expect(result).toEqual({ status: 'ok' })
    // Since the directory exists, mkdirSync should not be called.
    expect(mkdirSyncSpy).not.toHaveBeenCalled()

    const dataDir = path.join(process.cwd(), '..', 'data')
    const labelsDir = path.join(dataDir, 'labels')
    const manifestPath = path.join(labelsDir, 'label_manifest.json')
    expect(writeFileSyncSpy).toHaveBeenCalledWith(
      manifestPath,
      JSON.stringify(bodyData, null, 2),
      'utf-8',
    )
  })

  it('should return error and set status 500 when an exception occurs', async () => {
    existsSyncSpy.mockReturnValue(true)
    const bodyData = { manifest: 'data' }
    const event = createMockEvent(bodyData)

    // Force writeFileSync to throw an error.
    writeFileSyncSpy.mockImplementation(() => {
      throw new Error('Write error')
    })

    const result = await handler(event)
    // The handler should set the response status to 500 and return the error message.
    expect(event.node.res.statusCode).toBe(500)
    expect(result).toEqual({ error: 'Write error' })
  })
})
