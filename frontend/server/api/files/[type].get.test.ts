// Import mocked modules
import fs from 'node:fs/promises'
import path from 'node:path'

import { createEvent } from 'h3'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
// Use the Nuxt alias for importing the handler
import handler from './[type].get'

// Mock the fs module
vi.mock('node:fs/promises', () => ({
  default: {
    readdir: vi.fn(),
    stat: vi.fn(),
    access: vi.fn(),
    mkdir: vi.fn(),
  },
}))

// Mock the path module with a more complete implementation
vi.mock('node:path', () => ({
  default: {
    join: vi.fn((...args) => args.join('/')),
  },
}))

describe('files/[type].get route handler', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    // Default mock for cwd
    vi.spyOn(process, 'cwd').mockReturnValue('/current/working/dir')

    // Default mock for console methods
    vi.spyOn(console, 'info').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('should return error for invalid file type', async () => {
    // Create a mock event with invalid type
    const event = createEvent({
      method: 'GET',
      url: '/api/files/invalid',
    })

    // Set params
    event.context.params = { type: 'invalid' }

    // Call the handler
    const response = await handler(event)

    // Verify response
    expect(response).toHaveProperty('error')
    expect(response.error).toContain('Invalid file type requested')
    expect(response).toHaveProperty('validTypes')
    expect(response.validTypes).toContain('images')
    expect(response.validTypes).toContain('metadata')
    expect(response.validTypes).toContain('features')
    expect(response.validTypes).toContain('projections')
  })

  it('should try all base paths and create directory if none exist', async () => {
    // Mock fs.access to throw error for all paths
    vi.mocked(fs.access).mockRejectedValue(new Error('Directory not found'))

    // Mock successful directory creation
    vi.mocked(fs.mkdir).mockResolvedValueOnce(undefined)

    // Mock empty directory
    vi.mocked(fs.readdir).mockResolvedValueOnce([])

    // Create a mock event with valid type
    const event = createEvent({
      method: 'GET',
      url: '/api/files/images',
    })

    // Set params
    event.context.params = { type: 'images' }

    // Call the handler
    const response = await handler(event)

    // Verify access was attempted for all base paths
    expect(fs.access).toHaveBeenCalledTimes(3)
    expect(fs.access).toHaveBeenCalledWith('/current/working/dir/app/data/images')
    expect(fs.access).toHaveBeenCalledWith('/current/working/dir/data/images')
    expect(fs.access).toHaveBeenCalledWith('/current/working/dir/../data/images')

    // Verify mkdir was called with the first base path
    expect(fs.mkdir).toHaveBeenCalledWith('/current/working/dir/app/data/images', { recursive: true })

    // Verify response
    expect(response).toHaveProperty('files')
    expect(response.files).toEqual([])
  })

  it('should use the first accessible directory path', async () => {
    // Mock fs.access to fail for first path but succeed for second
    vi.mocked(fs.access)
      .mockRejectedValueOnce(new Error('First path not accessible'))
      .mockResolvedValueOnce(undefined)

    // Mock empty directory
    vi.mocked(fs.readdir).mockResolvedValueOnce([])

    // Create a mock event with valid type
    const event = createEvent({
      method: 'GET',
      url: '/api/files/images',
    })

    // Set params
    event.context.params = { type: 'images' }

    // Call the handler
    const response = await handler(event)

    // Verify access was attempted twice (should stop after finding valid path)
    expect(fs.access).toHaveBeenCalledTimes(2)
    
    // Verify readdir was called with the second path
    expect(fs.readdir).toHaveBeenCalledWith('/current/working/dir/data/images')
    
    // Verify mkdir was not called
    expect(fs.mkdir).not.toHaveBeenCalled()

    // Verify response
    expect(response).toHaveProperty('files')
    expect(response.files).toEqual([])
  })

  it('should filter and sort image files correctly', async () => {
    // Mock successful directory access on first try
    vi.mocked(fs.access).mockResolvedValueOnce(undefined)

    // Mock directory contents
    vi.mocked(fs.readdir).mockResolvedValueOnce([
      'image1.png',
      'image2.jpg',
      'document.pdf',
      'data.txt',
    ])

    // Mock file stats
    const mockStat = (filename, size, mtime) => {
      return {
        size,
        mtime: new Date(mtime),
      }
    }

    vi.mocked(fs.stat).mockImplementation((path) => {
      if (path.includes('image1.png'))
        return Promise.resolve(mockStat('image1.png', 1024, '2023-01-02'))
      if (path.includes('image2.jpg'))
        return Promise.resolve(mockStat('image2.jpg', 2048, '2023-01-01'))
      if (path.includes('document.pdf'))
        return Promise.resolve(mockStat('document.pdf', 3072, '2023-01-03'))
      if (path.includes('data.txt'))
        return Promise.resolve(mockStat('data.txt', 512, '2023-01-04'))

      return Promise.reject(new Error('Unknown file'))
    })

    // Create a mock event with images type
    const event = createEvent({
      method: 'GET',
      url: '/api/files/images',
    })

    // Set params
    event.context.params = { type: 'images' }

    // Call the handler
    const response = await handler(event)

    // Verify response contains only images, sorted by date (newest first)
    expect(response).toHaveProperty('files')
    expect(response.files).toHaveLength(2)
    expect(response.files[0].name).toBe('image1.png')
    expect(response.files[1].name).toBe('image2.jpg')
    expect(response.files.some(f => f.name === 'document.pdf')).toBe(false)
    expect(response.files.some(f => f.name === 'data.txt')).toBe(false)
  })

  it('should filter metadata files correctly', async () => {
    // Mock successful directory access
    vi.mocked(fs.access).mockResolvedValueOnce(undefined)

    // Mock directory contents
    vi.mocked(fs.readdir).mockResolvedValueOnce([
      'data.json',
      'config.yaml',
      'info.txt',
    ])

    // Mock file stats
    vi.mocked(fs.stat).mockImplementation(() => {
      return Promise.resolve({
        size: 1024,
        mtime: new Date(),
      })
    })

    // Create a mock event with metadata type
    const event = createEvent({
      method: 'GET',
      url: '/api/files/metadata',
    })

    // Set params
    event.context.params = { type: 'metadata' }

    // Call the handler
    const response = await handler(event)

    // Verify response contains only JSON files
    expect(response).toHaveProperty('files')
    expect(response.files).toHaveLength(1)
    expect(response.files[0].name).toBe('data.json')
  })

  it('should filter features files correctly', async () => {
    // Mock successful directory access
    vi.mocked(fs.access).mockResolvedValueOnce(undefined)

    // Mock directory contents
    vi.mocked(fs.readdir).mockResolvedValueOnce([
      'features.csv',
      'embeddings.npz',
      'data.json',
      'readme.txt',
    ])

    // Mock file stats
    vi.mocked(fs.stat).mockImplementation(() => {
      return Promise.resolve({
        size: 1024,
        mtime: new Date(),
      })
    })

    // Create a mock event with features type
    const event = createEvent({
      method: 'GET',
      url: '/api/files/features',
    })

    // Set params
    event.context.params = { type: 'features' }

    // Call the handler
    const response = await handler(event)

    // Verify response contains only CSV, JSON, and NPZ files
    expect(response).toHaveProperty('files')
    expect(response.files).toHaveLength(3)
    expect(response.files.some(f => f.name === 'features.csv')).toBe(true)
    expect(response.files.some(f => f.name === 'embeddings.npz')).toBe(true)
    expect(response.files.some(f => f.name === 'data.json')).toBe(true)
    expect(response.files.some(f => f.name === 'readme.txt')).toBe(false)
  })

  it('should filter projections files correctly', async () => {
    // Mock successful directory access
    vi.mocked(fs.access).mockResolvedValueOnce(undefined)

    // Mock directory contents
    vi.mocked(fs.readdir).mockResolvedValueOnce([
      'projections.json',
      'data.csv',
      'notes.txt',
    ])

    // Mock file stats
    vi.mocked(fs.stat).mockImplementation(() => {
      return Promise.resolve({
        size: 1024,
        mtime: new Date(),
      })
    })

    // Create a mock event with projections type
    const event = createEvent({
      method: 'GET',
      url: '/api/files/projections',
    })

    // Set params
    event.context.params = { type: 'projections' }

    // Call the handler
    const response = await handler(event)

    // Verify response contains only JSON files
    expect(response).toHaveProperty('files')
    expect(response.files).toHaveLength(1)
    expect(response.files[0].name).toBe('projections.json')
  })
})