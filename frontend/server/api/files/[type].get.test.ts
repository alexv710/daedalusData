// Import mocked modules
import fs from 'node:fs/promises'
import nfs from 'node:fs'
import path from 'node:path'
import { createEvent } from 'h3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import handler from './[type].get' // Nuxt alias

// Mock the fs/promises module (async API)
vi.mock('node:fs/promises', () => ({
  default: {
    readdir: vi.fn(),
    stat: vi.fn(),
  },
}))

// Mock the node:fs module (sync API: existsSync)
vi.mock('node:fs', () => ({
  default: {
    existsSync: vi.fn(),
  },
}))

// Mock the path module as before
vi.mock('node:path', () => ({
  default: {
    join: vi.fn((...args) => args.join('/'))
  },
}))

describe('files/[type].get route handler', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    vi.spyOn(process, 'cwd').mockReturnValue('/current/working/dir')
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.spyOn(console, 'info').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('should return error for invalid file type', async () => {
    const event = createEvent({ method: 'GET', url: '/api/files/invalid' })
    event.context.params = { type: 'invalid' }
    const response = await handler(event)

    expect(response).toHaveProperty('error')
    expect(response.error).toContain('Invalid file type requested')
    expect(response).toHaveProperty('validTypes')
    expect(response.validTypes).toContain('images')
    expect(response.validTypes).toContain('metadata')
    expect(response.validTypes).toContain('features')
    expect(response.validTypes).toContain('projections')
  })

  it('should throw error if none of the base paths exist', async () => {
    vi.mocked(nfs.existsSync).mockReturnValue(false)
    const event = createEvent({ method: 'GET', url: '/api/files/images' })
    event.context.params = { type: 'images' }
    const response = await handler(event)
    // Handler now throws, but it catches and returns an error object
    expect(response).toHaveProperty('error')
    expect(response.error).toMatch(/Failed to read images directory/)
    expect(response.details).toMatch(/Could not find an accessible data directory/)
  })

  it('should use the first existing directory path', async () => {
    vi.mocked(nfs.existsSync)
      .mockImplementationOnce((p) => p === '/current/working/dir/app/data')
    vi.mocked(fs.readdir).mockResolvedValueOnce([])

    const event = createEvent({ method: 'GET', url: '/api/files/images' })
    event.context.params = { type: 'images' }
    const response = await handler(event)

    expect(nfs.existsSync).toHaveBeenCalledWith('/current/working/dir/app/data')
    // Should only check until it finds one (i.e., first called true)
    expect(fs.readdir).toHaveBeenCalledWith('/current/working/dir/app/data/images')
    expect(response).toHaveProperty('files')
    expect(response.files).toEqual([])
  })

  it('should use the second base dir if the first does not exist', async () => {
    vi.mocked(nfs.existsSync)
      .mockImplementation((p) => p === '/current/working/dir/data') // only 2nd exists
    vi.mocked(fs.readdir).mockResolvedValueOnce([])

    const event = createEvent({ method: 'GET', url: '/api/files/images' })
    event.context.params = { type: 'images' }
    const response = await handler(event)

    expect(nfs.existsSync).toHaveBeenCalledWith('/current/working/dir/app/data')
    expect(nfs.existsSync).toHaveBeenCalledWith('/current/working/dir/data')
    expect(response.files).toEqual([])
    expect(fs.readdir).toHaveBeenCalledWith('/current/working/dir/data/images')
  })

  it('should filter and sort image files correctly', async () => {
    vi.mocked(nfs.existsSync).mockImplementation(() => true) // any basepath exists
    vi.mocked(fs.readdir).mockResolvedValueOnce([
      'image1.png', 'image2.jpg', 'document.pdf', 'data.txt'
    ])

    // mtime objects for sorting
    const mockStat = (filename, size, mtime) => ({ size, mtime: new Date(mtime) })
    vi.mocked(fs.stat).mockImplementation((filepath) => {
      if (filepath.endsWith('image1.png')) return Promise.resolve(mockStat('image1.png', 1024, '2023-01-02'))
      if (filepath.endsWith('image2.jpg')) return Promise.resolve(mockStat('image2.jpg', 2048, '2023-01-01'))
      if (filepath.endsWith('document.pdf')) return Promise.resolve(mockStat('document.pdf', 3072, '2023-01-03'))
      if (filepath.endsWith('data.txt')) return Promise.resolve(mockStat('data.txt', 512, '2023-01-04'))
      return Promise.reject(new Error('Not found'))
    })

    const event = createEvent({ method: 'GET', url: '/api/files/images' })
    event.context.params = { type: 'images' }
    const response = await handler(event)

    expect(response).toHaveProperty('files')
    expect(response.files).toHaveLength(2)
    expect(response.files[0].name).toBe('image1.png') // 2023-01-02 newer than 2023-01-01
    expect(response.files[1].name).toBe('image2.jpg')
    expect(response.files.some(f => f.name === 'document.pdf')).toBe(false)
    expect(response.files.some(f => f.name === 'data.txt')).toBe(false)
  })

  it('should filter metadata files correctly', async () => {
    vi.mocked(nfs.existsSync).mockImplementation(() => true)
    vi.mocked(fs.readdir).mockResolvedValueOnce(['data.json', 'config.yaml', 'info.txt'])
    vi.mocked(fs.stat).mockResolvedValue({ size: 1024, mtime: new Date() })

    const event = createEvent({ method: 'GET', url: '/api/files/metadata' })
    event.context.params = { type: 'metadata' }
    const response = await handler(event)

    expect(response).toHaveProperty('files')
    expect(response.files).toHaveLength(1)
    expect(response.files[0].name).toBe('data.json')
  })

  it('should filter features files correctly', async () => {
    vi.mocked(nfs.existsSync).mockImplementation(() => true)
    vi.mocked(fs.readdir).mockResolvedValueOnce(['features.csv', 'embeddings.npz', 'data.json', 'readme.txt'])
    vi.mocked(fs.stat).mockResolvedValue({ size: 1024, mtime: new Date() })

    const event = createEvent({ method: 'GET', url: '/api/files/features' })
    event.context.params = { type: 'features' }
    const response = await handler(event)

    expect(response).toHaveProperty('files')
    expect(response.files).toHaveLength(3)
    expect(response.files.some(f => f.name === 'features.csv')).toBe(true)
    expect(response.files.some(f => f.name === 'embeddings.npz')).toBe(true)
    expect(response.files.some(f => f.name === 'data.json')).toBe(true)
    expect(response.files.some(f => f.name === 'readme.txt')).toBe(false)
  })

  it('should filter projections files correctly', async () => {
    vi.mocked(nfs.existsSync).mockImplementation(() => true)
    vi.mocked(fs.readdir).mockResolvedValueOnce(['projections.json', 'data.csv', 'notes.txt'])
    vi.mocked(fs.stat).mockResolvedValue({ size: 1024, mtime: new Date() })
    vi.mocked(fs.stat).mockResolvedValue({ size: 1024, mtime: new Date() })

    const event = createEvent({ method: 'GET', url: '/api/files/projections' })
    event.context.params = { type: 'projections' }
    const response = await handler(event)

    expect(response).toHaveProperty('files')
    expect(response.files).toHaveLength(1)
    expect(response.files[0].name).toBe('projections.json')
  })
})