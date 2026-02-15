const BLTCY_API_BASE = 'https://api.bltcy.ai'
const BLTCY_CHAT_COMPLETIONS_PATH = '/v1/chat/completions'
const DEFAULT_API_TIMEOUT_MS = 120000

function safeJsonParse(text) {
  if (typeof text !== 'string') return null
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

function resolveProviderApiKey() {
  return String(
    import.meta.env.BLTCY_API_KEY ||
      import.meta.env.VITE_BLTCY_API_KEY ||
      import.meta.env.LLM_API_KEY ||
      import.meta.env.VITE_LLM_API_KEY ||
      '',
  ).trim()
}

function resolveChatEndpoint() {
  const customBase = String(import.meta.env.VITE_BLTCY_API_BASE || import.meta.env.BLTCY_API_BASE || '').trim()
  const base = (customBase || BLTCY_API_BASE).replace(/\/+$/, '')
  return `${base}${BLTCY_CHAT_COMPLETIONS_PATH}`
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

function buildErrorMessage(status, body) {
  const apiError = body?.error
  const message = String(apiError?.message || '').trim()
  if (message) return message
  if (typeof body === 'string' && body.trim()) return body.trim()
  return `AI 请求失败（HTTP ${status}）`
}

export async function postLLMChat(payload, signal, timeoutMs = DEFAULT_API_TIMEOUT_MS) {
  if (signal?.aborted) {
    throw new Error('AI 请求已取消')
  }

  const apiKey = resolveProviderApiKey()
  if (!apiKey) {
    throw new Error('缺少 BLTCY_API_KEY（或 VITE_BLTCY_API_KEY），请在环境变量中配置后重试')
  }

  const { signal: requestSignal, cleanup } = createAbortSignalWithTimeout(signal, timeoutMs)

  try {
    const response = await fetch(resolveChatEndpoint(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(payload),
      signal: requestSignal,
    })

    const text = await response.text()
    const json = safeJsonParse(text)
    if (!response.ok) {
      const error = new Error(buildErrorMessage(response.status, json || text))
      error.status = response.status
      error.response = json || text
      throw error
    }
    if (!json || typeof json !== 'object') {
      throw new Error('AI 服务返回了无效 JSON')
    }
    return json
  } catch (error) {
    if (signal?.aborted) {
      throw new Error('AI 请求已取消')
    }
    throw error
  } finally {
    cleanup()
  }
}

export { DEFAULT_API_TIMEOUT_MS }
