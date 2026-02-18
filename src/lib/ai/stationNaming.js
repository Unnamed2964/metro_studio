
import { postLLMChat } from './openrouterClient'
import { getAiConfig } from './aiConfig'
import { extractJsonObject, extractBatchResults } from './jsonUtils'

const BASIS_OPTIONS = ['①道路', '②地域', '③公共设施', '④其它']

// ── JSON Schema ─────────────────────────────────────────────

const CHINESE_NAME_RESPONSE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    nameZh: { type: 'string', minLength: 1, maxLength: 64 },
    basis: { type: 'string', enum: BASIS_OPTIONS },
  },
  required: ['nameZh', 'basis'],
}

const ENGLISH_NAME_RESPONSE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    nameEn: { type: 'string', minLength: 1, maxLength: 96 },
  },
  required: ['nameEn'],
}

const BATCH_ENGLISH_NAME_RESPONSE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    translations: {
      type: 'array',
      minItems: 0,
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          stationId: { type: 'string', minLength: 1, maxLength: 128 },
          nameEn: { type: 'string', minLength: 1, maxLength: 96 },
        },
        required: ['stationId', 'nameEn'],
      },
    },
  },
  required: ['translations'],
}

const BATCH_CHINESE_NAME_RESPONSE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    stations: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          stationId: { type: 'string' },
          nameZh: { type: 'string' },
          nameEn: { type: 'string' },
          basis: { type: 'string', enum: BASIS_OPTIONS },
        },
        required: ['stationId', 'nameZh', 'nameEn', 'basis'],
      },
    },
  },
  required: ['stations'],
}

// ── 常量 ────────────────────────────────────────────────────

const STATION_SUFFIX_REGEX = /(地铁站|车站|站|支路口|路口|辅路|辅|支路|街道)$/u
const NAME_NOISE_REGEX = /辅路|辅道|支路口|路口/gu
const ENGLISH_STATION_SUFFIX_REGEX = /\b(?:metro\s+station|subway\s+station|railway\s+station|train\s+station|station)\b\.?$/iu
const RESIDENTIAL_NAME_REGEX = /(小区|家园|花园|公寓|宿舍|新村|社区|苑区?|住宅区)/u
const JIEDAO_NAME_REGEX = /街道/u

// ── 工具函数 ────────────────────────────────────────────────

function toFiniteNumber(value, fallback = 0) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function normalizeBasis(value) {
  const text = String(value || '').trim()
  if (!text) return '④其它'
  if (text.includes('①') || text.includes('道路')) return '①道路'
  if (text.includes('②') || text.includes('地域') || text.includes('片区') || text.includes('行政区')) return '②地域'
  if (text.includes('③') || text.includes('设施') || text.includes('建筑') || text.includes('机构')) return '③公共设施'
  return '④其它'
}

function stripChineseStationSuffix(text) {
  return String(text || '').trim().replace(STATION_SUFFIX_REGEX, '').trim()
}

function sanitizeEnglishStationName(text) {
  return String(text || '').trim().replace(ENGLISH_STATION_SUFFIX_REGEX, '').replace(/\s{2,}/g, ' ').trim()
}

function isResponseFormatError(error) {
  const text = String(error?.message || '').toLowerCase()
  return text.includes('response_format') || text.includes('json_schema') || text.includes('structured')
}

async function postWithFallback(payload, signal, timeoutMs) {
  try {
    return await postLLMChat(payload, signal, timeoutMs)
  } catch (error) {
    console.warn('[stationNaming] postWithFallback first attempt failed:', error?.message)
    const degraded = { ...payload }
    let changed = false
    if (degraded.thinking) {
      delete degraded.thinking
      changed = true
    }
    if (degraded.response_format && isResponseFormatError(error)) {
      delete degraded.response_format
      changed = true
    }
    if (!changed) throw error
    console.log('[stationNaming] postWithFallback retrying with degraded payload', { removedThinking: !degraded.thinking, removedResponseFormat: !degraded.response_format })
    return postLLMChat(degraded, signal, timeoutMs)
  }
}

function extractContentText(payload) {
  const content = payload?.choices?.[0]?.message?.content
  if (typeof content === 'string') return content
  if (content && typeof content === 'object') {
    if (Array.isArray(content)) {
      return content.map((p) => (typeof p === 'string' ? p : String(p?.text || ''))).join('')
    }
    return JSON.stringify(content)
  }
  return ''
}

function parseJsonResponse(payload) {
  const text = extractContentText(payload)
  return extractJsonObject(text)
}

// ── 上下文 → 自然语言描述 ───────────────────────────────────

function formatItem(item) {
  const name = String(item?.nameZh || '').trim()
  if (!name) return ''
  const type = String(item?.type || '').trim()
  const dist = Math.round(toFiniteNumber(item?.distanceMeters, 0))
  return type ? `${name}（${type}，${dist}m）` : `${name}（${dist}m）`
}

function buildSurroundingsText(context, lngLat) {
  const [lng, lat] = Array.isArray(lngLat) && lngLat.length === 2 ? lngLat : context?.center || [0, 0]
  const radius = Math.round(toFiniteNumber(context?.radiusMeters, 300))
  const lines = [`站点坐标：${toFiniteNumber(lng).toFixed(6)}, ${toFiniteNumber(lat).toFixed(6)}，采样半径 ${radius}m。`]

  const categories = [
    { key: 'intersections', label: '道路交叉口' },
    { key: 'roads', label: '道路' },
    { key: 'areas', label: '地域/片区' },
    { key: 'facilities', label: '公共设施' },
    { key: 'buildings', label: '建筑' },
  ]

  for (const { key, label } of categories) {
    const items = Array.isArray(context?.[key]) ? context[key] : []
    const filtered = items
      .filter((item) => {
        const name = String(item?.nameZh || '').trim()
        if (!name) return false
        if (key !== 'intersections' && key !== 'roads' && RESIDENTIAL_NAME_REGEX.test(name)) return false
        return true
      })
      .slice(0, 8)
    if (!filtered.length) continue
    const descriptions = filtered.map(formatItem).filter(Boolean)
    if (descriptions.length) {
      lines.push(`${label}：${descriptions.join('、')}。`)
    }
  }

  return lines.join('\n')
}

// ── 第一阶段：生成中文站名 ──────────────────────────────────

const NAMING_SYSTEM_PROMPT = `你是中国城市轨道交通命名专家。根据周边信息为站点选一个精准简洁的中文站名，输出JSON：nameZh、basis（①道路/②地域/③公共设施/④其它）。

命名优先级（严格按顺序）：
1. 交通枢纽/知名公共设施（火车站/汽车站/医院/大学/公园/体育馆）→ 直接用其名称
2. 知名地域或片区名（neighbourhood/suburb/quarter等）→ 用片区名
3. 两条路名交叉口 → 格式"A路B路"
4. 只有一条大道时 → 路名加方位词，如"XX大道东"

禁令：
- 禁止只用单条路名（"历山路"无法定位）
- 禁止居住区名（小区/公寓/楼盘）
- 禁止末尾加：站/地铁站/路口/支路口/辅路/支路（火车站/汽车站除外）
- 路名含"辅路"时去掉"辅路"取主路名（"历山路辅路"→"历山路"）
- 地名含"街道"时去掉"街道"（"北园街道"→"北园"）
- 禁止重复路名（"营市街营市街"是错误的）

示例：
---
道路：旅游路（次干路，0m）。公共设施：山东省立医院（公共设施:hospital，60m）。
→ {"nameZh":"省立医院","basis":"③公共设施"}

道路：天桥北路（支路，0m）。公共设施：济南火车站（交通设施:station，80m）。
→ {"nameZh":"济南火车站","basis":"③公共设施"}

道路：解放路（次干路，0m）。地域/片区：大明湖（地域:neighbourhood，50m）。
→ {"nameZh":"大明湖","basis":"②地域"}

道路：无棣二路（支路，0m）。地域/片区：北园街道（地域:neighbourhood，0m）。
→ {"nameZh":"北园","basis":"②地域"}

道路：二环东路辅路（支路，0m）。地域/片区：东风街道（地域:neighbourhood，0m）。
→ {"nameZh":"东风","basis":"②地域"}

道路：历山路（次干路，0m）、泺源大街（主干路，45m）。
→ {"nameZh":"历山路泺源大街","basis":"①道路"}

道路：经十路（主干路，0m）、舜耕路（次干路，30m）。
→ {"nameZh":"经十路舜耕路","basis":"①道路"}

道路：历山路辅路（支路，0m）、东关大街（次干路，30m）。
→ {"nameZh":"历山路东关大街","basis":"①道路"}

道路：营市街（支路，0m）、槐村路（支路，15m）。
→ {"nameZh":"营市街槐村路","basis":"①道路"}

道路：奥体大道（主干路，0m）。地域/片区：东部新城（地域:suburb，40m）。
→ {"nameZh":"奥体大道东","basis":"①道路"}
---`

async function generateChineseName({ context, lngLat, model, signal }) {
  const surroundings = buildSurroundingsText(context, lngLat)
  console.log('[stationNaming] generateChineseName start', { model, lngLat })
  console.log('[stationNaming] surroundings:\n', surroundings)

  const payload = {
    model,
    stream: false,
    response_format: {
      type: 'json_schema',
      json_schema: { name: 'station_chinese_name', strict: true, schema: CHINESE_NAME_RESPONSE_SCHEMA },
    },
    temperature: 0.3,
    top_p: 0.9,
    messages: [
      { role: 'system', content: NAMING_SYSTEM_PROMPT },
      { role: 'user', content: `请为以下站点选择一个最合适的中文站名：\n\n${surroundings}` },
    ],
  }

  const response = await postWithFallback(payload, signal)
  const rawText = extractContentText(response)
  console.log('[stationNaming] generateChineseName raw response:', rawText)
  const parsed = parseJsonResponse(response)
  console.log('[stationNaming] generateChineseName parsed:', parsed)
  if (!parsed?.nameZh) throw new Error('AI 未返回有效中文站名')

  const nameZh = stripChineseStationSuffix(parsed.nameZh)
  if (!nameZh) throw new Error('AI 返回的中文站名为空')

  const result = {
    nameZh,
    basis: normalizeBasis(parsed.basis),
  }
  console.log('[stationNaming] generateChineseName result:', result)
  return result
}

// ── 第二阶段：翻译英文站名 ──────────────────────────────────

const TRANSLATION_SYSTEM_PROMPT = `将中文地铁站名翻译为英文。

专名用汉语拼音，首字母大写，多音节连写（王府井→Wangfujing），不标声调。

通名意译：路/马路→Road，大道→Avenue，街→Street，桥→Bridge，公园→Park，医院→Hospital，大学→University，中学→High School，小学→Primary School，广场→Square，博物馆→Museum，体育馆→Gymnasium，体育场→Stadium。

方位词（东/西/南/北）判断：
- 方位词在路/街/大道之前且构成路名→拼音连写不翻译（二环南路→Erhuan Nanlu）
- 方位词在词尾且修饰独立地标→意译East/West/South/North（西单北→Xidan North）

公共机构完整翻译（妇幼保健院→Maternal and Child Health Hospital）。

末尾禁止出现Station/Metro Station/Subway Station。输出JSON：nameEn。`

async function translateToEnglish({ nameZh, model, signal }) {
  console.log('[stationNaming] translateToEnglish start', { nameZh, model })
  const payload = {
    model,
    stream: false,
    response_format: {
      type: 'json_schema',
      json_schema: { name: 'station_english_name', strict: true, schema: ENGLISH_NAME_RESPONSE_SCHEMA },
    },
    temperature: 0.1,
    top_p: 0.8,
    messages: [
      { role: 'system', content: TRANSLATION_SYSTEM_PROMPT },
      { role: 'user', content: `请将以下中文地铁站名翻译为英文：${nameZh}` },
    ],
  }

  const response = await postWithFallback(payload, signal)
  const rawText = extractContentText(response)
  console.log('[stationNaming] translateToEnglish raw response:', rawText)
  const parsed = parseJsonResponse(response)
  const nameEn = sanitizeEnglishStationName(parsed?.nameEn)
  if (!nameEn) throw new Error('AI 未返回有效英文站名')
  console.log('[stationNaming] translateToEnglish result:', nameEn)
  return nameEn
}

async function translateToEnglishBatch({ stations, model, signal }) {
  if (!stations || !stations.length) return []
  console.log('[stationNaming] translateToEnglishBatch start', { count: stations.length, model })

  const stationDescriptions = stations.map(
    (item) => `【${item.stationId}】${item.nameZh}`
  ).join('\n')

  const payload = {
    model,
    stream: false,
    response_format: {
      type: 'json_schema',
      json_schema: { name: 'station_english_names_batch', strict: true, schema: BATCH_ENGLISH_NAME_RESPONSE_SCHEMA },
    },
    temperature: 0.1,
    top_p: 0.8,
    messages: [
      { role: 'system', content: TRANSLATION_SYSTEM_PROMPT + '\n\n你将收到多个中文地铁站名，请按 stationId 分别给出英文翻译。输出 JSON 包含 translations 数组，每项含 stationId、nameEn。' },
      { role: 'user', content: `请批量翻译以下中文地铁站名为英文：\n\n${stationDescriptions}` },
    ],
  }

  const response = await postWithFallback(payload, signal)
  const rawText = extractContentText(response)
  console.log('[stationNaming] translateToEnglishBatch raw response:', rawText)
  const parsed = parseJsonResponse(response)
  const translations = Array.isArray(parsed?.translations) ? parsed.translations : []
  console.log('[stationNaming] translateToEnglishBatch parsed translations:', translations.length)

  const enMap = new Map()
  for (const t of translations) {
    const id = String(t?.stationId || '').trim()
    if (!id) continue
    const nameEn = sanitizeEnglishStationName(t?.nameEn)
    if (!nameEn) continue
    enMap.set(id, nameEn)
  }

  console.log('[stationNaming] translateToEnglishBatch result map size:', enMap.size)
  return enMap
}

// ── 对外接口：单站点 ────────────────────────────────────────

export async function generateStationNameCandidates({
  context,
  lngLat,
  model,
  signal,
} = {}) {
  if (!context || typeof context !== 'object') {
    throw new Error('缺少周边命名上下文')
  }

  let resolvedModel = model
  if (!resolvedModel) {
    resolvedModel = getAiConfig().model
  }
  if (!resolvedModel) {
    throw new Error('请先在「设置 → AI 配置」中填写模型名称')
  }

  // 第一阶段：生成中文站名
  const { nameZh, basis } = await generateChineseName({ context, lngLat, model: resolvedModel, signal })

  // 第二阶段：翻译英文站名
  const nameEn = await translateToEnglish({ nameZh, model: resolvedModel, signal })

  // 返回单元素数组，保持与调用方兼容
  return [{ nameZh, nameEn, basis }]
}

// ── 对外接口：批量 ──────────────────────────────────────────

async function generateNamesBatch({ stations, existingNames = [], model, signal }) {
  const stationDescriptions = stations.map((item) => {
    const surroundings = buildSurroundingsText(item.context, item.lngLat)
    return `【${item.stationId}】\n${surroundings}`
  })

  const existingNote = existingNames.length
    ? `\n\n已有站名（严禁重复）：${existingNames.join('、')}`
    : ''

  const payload = {
    model,
    stream: false,
    temperature: 0.3,
    top_p: 0.9,
    messages: [
      { role: 'system', content: NAMING_SYSTEM_PROMPT + '\n\n你将收到多个站点的周边信息，请按 stationId 分别命名，同时给出中英文站名，所有站名不得重复。英文翻译：专名用拼音首字母大写连写；路→Road，大道→Avenue，街→Street，桥→Bridge，公园→Park，医院→Hospital，大学→University，广场→Square；末尾禁止Station/Metro Station。输出JSON：stations数组，每项含stationId、nameZh、nameEn、basis。' + existingNote },
      { role: 'user', content: `请为以下各站点分别选择一个最合适的中英文站名：\n\n${stationDescriptions.join('\n\n')}` },
    ],
  }

  console.log('[stationNaming] generateNamesBatch start', { model: payload.model, stationCount: stations.length, existingNamesCount: existingNames.length })
  const response = await postWithFallback(payload, signal, 600000)
  const text = extractContentText(response)
  console.log('[stationNaming] generateNamesBatch raw response:', text)
  const batchStations = extractBatchResults(text)
  console.log('[stationNaming] generateNamesBatch parsed stations:', batchStations?.length ?? 0)
  return Array.isArray(batchStations) ? batchStations : []
}

async function runBatchWithJiedaoRetry({ stations, existingNames, model, signal }) {
  console.log('[stationNaming] runBatchWithJiedaoRetry start', { stationCount: stations.length })
  const rawResults = await generateNamesBatch({ stations, existingNames, model, signal })
  console.log('[stationNaming] runBatchWithJiedaoRetry rawResults:', rawResults.length)
  let batchResults = parseBatchRawResults(rawResults)

  // 补充未返回的站点
  const returnedIds = new Set(batchResults.map((r) => r.stationId))
  for (const item of stations) {
    if (!returnedIds.has(item.stationId)) {
      batchResults.push({ stationId: item.stationId, candidates: [], error: 'AI 未返回该站点的命名结果' })
    }
  }

  // 检查含"街道"的结果，重试一次
  const badIds = new Set()
  for (const r of batchResults) {
    const name = r.candidates?.[0]?.nameZh || ''
    if (JIEDAO_NAME_REGEX.test(name)) badIds.add(r.stationId)
  }

  if (badIds.size && !signal?.aborted) {
    console.log('[stationNaming] jiedao retry for stations:', [...badIds])
    const retryStations = stations.filter((s) => badIds.has(s.stationId))
    const goodNames = batchResults
      .filter((r) => r.candidates?.[0]?.nameZh && !badIds.has(r.stationId))
      .map((r) => r.candidates[0].nameZh)

    const retryRaw = await generateNamesBatch({
      stations: retryStations,
      existingNames: [...existingNames, ...goodNames],
      model,
      signal,
    })
    const retryResults = parseBatchRawResults(retryRaw)
    const retryMap = new Map(retryResults.map((r) => [r.stationId, r]))

    batchResults = batchResults.map((r) => {
      const replacement = retryMap.get(r.stationId)
      if (!replacement) return r
      return JIEDAO_NAME_REGEX.test(replacement.candidates?.[0]?.nameZh || '') ? r : replacement
    })
  }

  // 收集成功的站名
  for (const r of batchResults) {
    const name = r.candidates?.[0]?.nameZh
    if (name) existingNames.push(name)
  }

  return batchResults
}

function parseBatchRawResults(rawResults) {
  const results = []
  for (const raw of rawResults) {
    const id = String(raw?.stationId || '').trim()
    if (!id) continue
    const nameZh = stripChineseStationSuffix(raw?.nameZh)
    if (!nameZh) continue
    const nameEn = sanitizeEnglishStationName(raw?.nameEn)
    results.push({
      stationId: id,
      candidates: [{
        nameZh,
        nameEn: nameEn || '',
        basis: normalizeBasis(raw?.basis),
      }],
      error: '',
    })
  }
  return results
}

export async function generateStationNameCandidatesBatch({
  stations,
  existingNames = [],
  model,
  signal,
  batchSize = 3,
  concurrency = 3,
  maxRetries = 2,
  onBatchDone,
} = {}) {
  const stationItems = Array.isArray(stations) ? stations : []
  if (!stationItems.length) return []

  let resolvedModel = model
  if (!resolvedModel) {
    resolvedModel = getAiConfig().model
  }
  if (!resolvedModel) {
    throw new Error('请先在「设置 → AI 配置」中填写模型名称')
  }

  const prepared = []
  const failures = []
  const seen = new Set()

  for (const item of stationItems) {
    const stationId = String(item?.stationId || '').trim()
    if (!stationId || seen.has(stationId)) continue
    seen.add(stationId)

    const ctx = item?.context
    if (!ctx || typeof ctx !== 'object') {
      failures.push({ stationId, candidates: [], error: '缺少周边命名上下文' })
      continue
    }

    prepared.push({
      stationId,
      lngLat: Array.isArray(item?.lngLat) ? item.lngLat : ctx.center || [0, 0],
      context: ctx,
    })
  }

  if (!prepared.length) return failures

  // 分 batch
  const chunks = []
  for (let i = 0; i < prepared.length; i += batchSize) {
    chunks.push(prepared.slice(i, i + batchSize))
  }

  const allResults = []
  // 收集已命名的站名（含已有 + 本次已成功的）用于去重
  const dynamicExistingNames = [...existingNames]

  let chunkCursor = 0
  const worker = async () => {
    while (true) {
      const idx = chunkCursor++
      if (idx >= chunks.length) return
      if (signal?.aborted) return
      const chunk = chunks[idx]

      let batchResults = []
      let lastError = ''
      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        if (signal?.aborted) return
        try {
          batchResults = await runBatchWithJiedaoRetry({
            stations: chunk,
            existingNames: dynamicExistingNames,
            model: resolvedModel,
            signal,
          })
          lastError = ''
          break
        } catch (error) {
          if (signal?.aborted) return
          lastError = String(error?.message || 'AI 批量请求失败')
          if (attempt < maxRetries) {
            await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)))
          }
        }
      }
      if (lastError) {
        batchResults = chunk.map((item) => ({
          stationId: item.stationId, candidates: [], error: lastError,
        }))
      }

      allResults.push(...batchResults)
      onBatchDone?.(batchResults)
    }
  }

  const workerCount = Math.min(concurrency, chunks.length)
  await Promise.all(Array.from({ length: workerCount }, () => worker()))

  return [...allResults, ...failures]
}
