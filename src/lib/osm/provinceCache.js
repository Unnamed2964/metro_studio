const MAX_CACHE_SIZE = 100

class ProvinceCache {
  constructor() {
    this.cache = new Map()
    this.accessOrder = []
  }

  generateKey(lng, lat) {
    return `${lng.toFixed(6)},${lat.toFixed(6)}`
  }

  get(lng, lat) {
    const key = this.generateKey(lng, lat)
    const value = this.cache.get(key)
    if (value) {
      this.moveToEnd(key)
    }
    return value
  }

  set(lng, lat, province) {
    if (!province) return
    const key = this.generateKey(lng, lat)
    if (this.cache.has(key)) {
      this.moveToEnd(key)
    } else {
      if (this.cache.size >= MAX_CACHE_SIZE) {
        const oldestKey = this.accessOrder.shift()
        this.cache.delete(oldestKey)
      }
      this.accessOrder.push(key)
    }
    this.cache.set(key, province)
  }

  moveToEnd(key) {
    const index = this.accessOrder.indexOf(key)
    if (index > -1) {
      this.accessOrder.splice(index, 1)
      this.accessOrder.push(key)
    }
  }

  clear() {
    this.cache.clear()
    this.accessOrder = []
  }
}

const provinceCache = new ProvinceCache()

export function getProvinceFromCache(lng, lat) {
  return provinceCache.get(lng, lat)
}

export function setProvinceToCache(lng, lat, province) {
  provinceCache.set(lng, lat, province)
}

export function clearProvinceCache() {
  provinceCache.clear()
}
