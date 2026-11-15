export const getBrowserStorage = () => {
  if (!import.meta.client) {
    return null
  }

  try {
    const storage = window.localStorage

    if (
      typeof storage?.getItem !== 'function'
      || typeof storage.setItem !== 'function'
      || typeof storage.removeItem !== 'function'
    ) {
      return null
    }

    return storage
  } catch {
    return null
  }
}

export const readBrowserStorageItem = (key: string) => {
  const storage = getBrowserStorage()

  if (!storage) {
    return null
  }

  try {
    return storage.getItem(key)
  } catch {
    return null
  }
}

export const writeBrowserStorageItem = (key: string, value: string) => {
  const storage = getBrowserStorage()

  if (!storage) {
    return false
  }

  try {
    storage.setItem(key, value)
    return true
  } catch {
    return false
  }
}

export const removeBrowserStorageItem = (key: string) => {
  const storage = getBrowserStorage()

  if (!storage) {
    return false
  }

  try {
    storage.removeItem(key)
    return true
  } catch {
    return false
  }
}
