import { afterEach, describe, expect, it } from 'vitest'

import {
  getBrowserStorage,
  readBrowserStorageItem,
  removeBrowserStorageItem,
  writeBrowserStorageItem
} from '../../app/utils/browser-storage'

describe('browser storage availability', () => {
  const originalDescriptor = Object.getOwnPropertyDescriptor(window, 'localStorage')

  afterEach(() => {
    if (originalDescriptor) {
      Object.defineProperty(window, 'localStorage', originalDescriptor)
    } else {
      Reflect.deleteProperty(window, 'localStorage')
    }
  })

  it('returns unavailable results when acquiring storage throws', () => {
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      get: () => {
        throw new DOMException('Storage disabled', 'SecurityError')
      }
    })

    expect(getBrowserStorage()).toBeNull()
    expect(readBrowserStorageItem('schema')).toBeNull()
    expect(writeBrowserStorageItem('schema', 'text')).toBe(false)
    expect(removeBrowserStorageItem('schema')).toBe(false)
  })

  it('retains the same unavailable results when storage operations throw', () => {
    const fail = () => {
      throw new DOMException('Storage disabled', 'SecurityError')
    }

    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      value: { getItem: fail, removeItem: fail, setItem: fail }
    })

    expect(readBrowserStorageItem('schema')).toBeNull()
    expect(writeBrowserStorageItem('schema', 'text')).toBe(false)
    expect(removeBrowserStorageItem('schema')).toBe(false)
  })

  it('reads, writes, and removes an available storage item', () => {
    expect(writeBrowserStorageItem('storage-boundary-test', 'text')).toBe(true)
    expect(readBrowserStorageItem('storage-boundary-test')).toBe('text')
    expect(removeBrowserStorageItem('storage-boundary-test')).toBe(true)
    expect(readBrowserStorageItem('storage-boundary-test')).toBeNull()
  })
})
