export const getBrowserStorage = () => {
  if (!import.meta.client) {
    return null
  }

  const storage = window.localStorage

  if (
    typeof storage?.getItem !== 'function'
    || typeof storage.setItem !== 'function'
    || typeof storage.removeItem !== 'function'
  ) {
    return null
  }

  return storage
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
