const DEV_PROXY_ENDPOINTS = ['/api/overpass', '/api/overpass-kumi']
const PUBLIC_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
]

const OVERPASS_ENDPOINTS = import.meta.env.DEV
  ? [...DEV_PROXY_ENDPOINTS, ...PUBLIC_ENDPOINTS]
  : [...PUBLIC_ENDPOINTS]

const OVERPASS_REQUEST_TIMEOUT_MS = 65000

function toOverpassBody(query) {
  return `data=${encodeURIComponent(query)}`
}

function createAbortSignalWithTimeout(parentSignal, timeoutMs) {
  const controller = new AbortController()

  const timeoutHandle = setTimeout(() => {
    controller.abort(new Error(`timeout-${timeoutMs}ms`))
  }, timeoutMs)

  const abortFromParent = () => {
    controller.abort(parentSignal?.reason || new Error('aborted'))
  }

  if (parentSignal) {
    if (parentSignal.aborted) {
      abortFromParent()
    } else {
      parentSignal.addEventListener('abort', abortFromParent, { once: true })
    }
  }

  return {
    signal: controller.signal,
    cleanup() {
      clearTimeout(timeoutHandle)
      if (parentSignal) {
        parentSignal.removeEventListener('abort', abortFromParent)
      }
    },
  }
}

export async function postOverpassQuery(query, signal) {
  const failures = []
  if (signal?.aborted) {
    throw new Error('Overpass 请求已取消')
  }

  for (const endpoint of OVERPASS_ENDPOINTS) {
    const { signal: requestSignal, cleanup } = createAbortSignalWithTimeout(signal, OVERPASS_REQUEST_TIMEOUT_MS)

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
          Accept: 'application/json',
        },
        body: toOverpassBody(query),
        signal: requestSignal,
      })

      if (!response.ok) {
        failures.push(`${endpoint}(${response.status})`)
        continue
      }

      const responseText = await response.text()
      let payload = null
      try {
        payload = JSON.parse(responseText)
      } catch {
        failures.push(`${endpoint}(invalid-json)`)
        continue
      }

      if (!payload?.elements || !Array.isArray(payload.elements)) {
        failures.push(`${endpoint}(invalid-payload)`)
        continue
      }

      return payload
    } catch (error) {
      if (signal?.aborted) {
        throw new Error('Overpass 请求已取消')
      }
      failures.push(`${endpoint}(${error.message || 'network-error'})`)
    } finally {
      cleanup()
    }
  }

  throw new Error(`Overpass 请求失败: ${failures.join(', ')}`)
}
