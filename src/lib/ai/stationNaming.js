import { postOpenRouterChat } from './openrouterClient'

const DEFAULT_OPENROUTER_MODEL = 'claude-haiku-4-5-20251001'

const BASIS_OPTIONS = ['①道路', '②地域', '③公共设施', '④其它']

const STATION_NAME_RESPONSE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    candidates: {
      type: 'array',
      minItems: 0,
      maxItems: 5,
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          evidenceId: { type: 'string', minLength: 1, maxLength: 48 },
          nameZh: { type: 'string', minLength: 1, maxLength: 64 },
          nameEn: { type: 'string', minLength: 1, maxLength: 96 },
          basis: { type: 'string', enum: BASIS_OPTIONS },
          reason: { type: 'string', minLength: 1, maxLength: 220 },
        },
        required: ['evidenceId', 'nameZh', 'nameEn', 'basis', 'reason'],
      },
    },
  },
  required: ['candidates'],
}

const CHINESE_NAMING_STANDARD = `轨道交通车站名称按以下条件综合考虑：
① 以与车站站位邻近的主要横向道路名称命名；
② 以相近的地域名称命名；
③ 以相近的较为著名的公共设施名称命名；
④ 以其它符合法律、法规的方法命名。
车站名称命名的优先权主要由被选道路、地域或公共设施的重要程度、对社会的导向性等因素予以确定。`

const ENGLISH_NAMING_STANDARD = `专名部分用汉语拼音，不标声调，多音节连写，各词首字母大写。通名部分按道路和公共场所英文规范意译（如路/马路=Road，大道=Avenue，公园=Park，医院=Hospital，妇幼保健院=Maternal and Child Health Hospital）。含方位词时，用 East/West/South/North 置于专名前。公共机构/医院/学校/政府部门等必须意译其通名，不得整词音译。报站和导向标识仅保留站名主体，英文名末尾不得出现 Station/Metro Station/Subway Station。多线换乘站中英文统一，不用生僻缩写和不规范拼写。`

const STATION_SUFFIX_REGEX = /(地铁站|车站|站)$/u
const ENGLISH_STATION_SUFFIX_REGEX = /\b(?:metro\s+station|subway\s+station|railway\s+station|train\s+station|station)\b\.?$/iu

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

function safeJsonParse(text) {
  if (typeof text !== 'string') return null
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

function extractJsonObject(text) {
  const direct = safeJsonParse(text)
  if (direct && typeof direct === 'object') return direct

  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start < 0 || end <= start) return null
  return safeJsonParse(text.slice(start, end + 1))
}

function hasCjk(text) {
  return /[\u3400-\u9fff]/.test(String(text || ''))
}

function toTitleWords(text) {
  return String(text || '')
    .trim()
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(' ')
}

function stripChineseStationSuffix(text) {
  return String(text || '')
    .trim()
    .replace(STATION_SUFFIX_REGEX, '')
    .trim()
}

function sanitizeEnglishStationName(text) {
  return String(text || '')
    .trim()
    .replace(ENGLISH_STATION_SUFFIX_REGEX, '')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

function fallbackEnglishName(nameZh, nameEnHint = '') {
  const fromHint = sanitizeEnglishStationName(nameEnHint)
  if (fromHint) return fromHint
  const fromZh = stripChineseStationSuffix(nameZh)
  if (!fromZh) return ''
  if (!hasCjk(fromZh)) {
    return toTitleWords(fromZh)
  }
  return fromZh
}

function normalizeNameKey(text) {
  return String(text || '')
    .trim()
    .replace(STATION_SUFFIX_REGEX, '')
    .replace(/[\s\-_()\[\]{}<>.,，。·•'"`]/g, '')
    .toLowerCase()
}

function resolveBasisByCategory(category) {
  if (category === 'intersections') return '①道路'
  if (category === 'roads') return '①道路'
  if (category === 'areas') return '②地域'
  if (category === 'facilities' || category === 'buildings') return '③公共设施'
  return '④其它'
}

function prioritizeIntersectionEvidenceItems(items) {
  return (Array.isArray(items) ? items : [])
    .filter((item) => String(item?.nameZh || '').trim())
    .sort((a, b) => {
      const scoreDelta = toFiniteNumber(b?.score, 0) - toFiniteNumber(a?.score, 0)
      if (Math.abs(scoreDelta) > 1e-6) return scoreDelta
      const distanceDelta = toFiniteNumber(a?.distanceMeters, 0) - toFiniteNumber(b?.distanceMeters, 0)
      if (Math.abs(distanceDelta) > 1e-6) return distanceDelta
      return String(a?.nameZh || '').localeCompare(String(b?.nameZh || ''), 'zh-Hans-CN')
    })
    .slice(0, 10)
}

function shouldEnforceIntersectionPriority(intersections) {
  const items = Array.isArray(intersections) ? intersections : []
  if (!items.length) return false
  return items.some((item) => {
    const score = toFiniteNumber(item?.score, 0)
    const distance = toFiniteNumber(item?.distanceMeters, 9999)
    const importance = toFiniteNumber(item?.importance, 0)
    return score >= 0.78 && distance <= 80 && importance >= 0.75
  })
}

function prioritizeRoadEvidenceItems(items) {
  const roads = (Array.isArray(items) ? items : []).filter((item) => String(item?.nameZh || '').trim())
  if (!roads.length) return []

  const hasNearbyMajorRoad = roads.some(
    (road) => toFiniteNumber(road?.importance, 0) >= 0.9 && toFiniteNumber(road?.distanceMeters, 9999) <= 240,
  )

  const filtered = hasNearbyMajorRoad
    ? roads.filter((road) => {
        const importance = toFiniteNumber(road?.importance, 0)
        const distance = toFiniteNumber(road?.distanceMeters, 9999)
        if (importance >= 0.84) return true
        return distance <= 42
      })
    : roads

  return filtered.slice(0, 12)
}

function buildEvidenceListFromContext(context) {
  const prioritizedIntersectionItems = prioritizeIntersectionEvidenceItems(context?.intersections)
  const enforceIntersectionPriority = shouldEnforceIntersectionPriority(prioritizedIntersectionItems)
  const categories = [
    { key: 'intersections', limit: 10 },
    { key: 'roads', limit: 18 },
    { key: 'areas', limit: 14 },
    { key: 'facilities', limit: 20 },
    { key: 'buildings', limit: 20 },
  ]

  const evidences = []
  let sequence = 1
  const prioritizedRoadItems = prioritizeRoadEvidenceItems(context?.roads)

  for (const category of categories) {
    if (enforceIntersectionPriority && category.key === 'roads') continue
    const sourceItems =
      category.key === 'intersections'
        ? prioritizedIntersectionItems
        : category.key === 'roads'
          ? prioritizedRoadItems
          : Array.isArray(context?.[category.key])
            ? context[category.key]
            : []
    const items = sourceItems.slice(0, category.limit)
    for (const item of items) {
      const nameZh = String(item?.nameZh || '').trim()
      if (!nameZh) continue
      const evidenceId = `ev_${String(sequence).padStart(3, '0')}`
      sequence += 1
      evidences.push({
        evidenceId,
        category: category.key,
        basis: resolveBasisByCategory(category.key),
        nameZh,
        nameEn: String(item?.nameEn || '').trim(),
        type: String(item?.type || '').trim(),
        distanceMeters: Math.round(toFiniteNumber(item?.distanceMeters, 0)),
        importance: toFiniteNumber(item?.importance, 0),
        score: toFiniteNumber(item?.score, 0),
      })
    }
  }

  return {
    evidences,
    enforceIntersectionPriority,
  }
}

function buildEvidenceMap(evidences) {
  const map = new Map()
  for (const evidence of evidences) {
    if (!evidence?.evidenceId) continue
    map.set(evidence.evidenceId, evidence)
  }
  return map
}

function normalizeCandidate(rawCandidate, evidenceById) {
  const evidenceId = String(rawCandidate?.evidenceId || rawCandidate?.evidence_id || '').trim()
  if (!evidenceId) return null
  const evidence = evidenceById.get(evidenceId)
  if (!evidence) return null

  const nameZh = stripChineseStationSuffix(rawCandidate?.nameZh || rawCandidate?.zh || rawCandidate?.name)
  if (!nameZh) return null

  const evidenceNameKey = normalizeNameKey(evidence.nameZh)
  const candidateNameKey = normalizeNameKey(nameZh)
  if (!candidateNameKey || candidateNameKey !== evidenceNameKey) return null

  const basis = evidence.basis || normalizeBasis(rawCandidate?.basis || rawCandidate?.rule)
  const nameEn = fallbackEnglishName(nameZh, rawCandidate?.nameEn || rawCandidate?.en || evidence.nameEn)
  if (!nameEn) return null

  const reasonRaw = String(rawCandidate?.reason || rawCandidate?.why || '').trim()
  const reason = reasonRaw || `基于证据“${evidence.nameZh}”（${evidence.type || '周边要素'}）。`

  return {
    evidenceId,
    nameZh,
    nameEn,
    basis,
    reason,
  }
}

function normalizeCandidateKey(candidate) {
  return `${String(candidate?.nameZh || '').trim().toLowerCase()}::${String(candidate?.nameEn || '').trim().toLowerCase()}`
}

function dedupeCandidates(candidates) {
  const result = []
  const seen = new Set()
  for (const candidate of candidates) {
    const key = normalizeCandidateKey(candidate)
    if (!key || seen.has(key)) continue
    seen.add(key)
    result.push(candidate)
  }
  return result
}

function projectContextForModel(context, lngLat, evidences) {
  const [lng, lat] = Array.isArray(lngLat) && lngLat.length === 2 ? lngLat : context.center || [0, 0]

  return {
    stationPoint: {
      lng: Number(toFiniteNumber(lng, 0).toFixed(6)),
      lat: Number(toFiniteNumber(lat, 0).toFixed(6)),
      radiusMeters: Math.round(toFiniteNumber(context?.radiusMeters, 300)),
    },
    evidences: evidences.map((item) => ({
      evidenceId: item.evidenceId,
      basis: item.basis,
      nameZh: item.nameZh,
      nameEn: item.nameEn,
      type: item.type,
      distanceMeters: item.distanceMeters,
      score: item.score,
    })),
  }
}

function buildFallbackCandidatesFromEvidence(evidences) {
  return dedupeCandidates(
    evidences.map((evidence) => ({
      evidenceId: evidence.evidenceId,
      nameZh: evidence.nameZh,
      nameEn: fallbackEnglishName(evidence.nameZh, evidence.nameEn),
      basis: evidence.basis,
      reason: `依据${evidence.basis}对象“${evidence.nameZh}”（${evidence.type || '周边要素'}，约${evidence.distanceMeters}m）。`,
    })),
  )
}

function extractCandidatesFromChatResponse(payload) {
  const content = payload?.choices?.[0]?.message?.content
  if (content && typeof content === 'object') {
    if (Array.isArray(content)) {
      const joined = content
        .map((part) => {
          if (typeof part === 'string') return part
          return String(part?.text || '')
        })
        .join('')
      const parsed = extractJsonObject(joined)
      return parsed && Array.isArray(parsed.candidates) ? parsed.candidates : []
    }
    return Array.isArray(content.candidates) ? content.candidates : []
  }
  if (typeof content === 'string') {
    const parsed = extractJsonObject(content)
    if (parsed && Array.isArray(parsed.candidates)) {
      return parsed.candidates
    }
  }
  return []
}

function isResponseFormatError(error) {
  const text = String(error?.message || '').toLowerCase()
  return text.includes('response_format') || text.includes('json_schema') || text.includes('structured')
}

async function postOpenRouterChatWithFallback(payload, signal) {
  try {
    return await postOpenRouterChat(payload, signal)
  } catch (error) {
    if (!payload?.response_format || !isResponseFormatError(error)) {
      throw error
    }
    const degradedPayload = { ...payload }
    delete degradedPayload.response_format
    return postOpenRouterChat(degradedPayload, signal)
  }
}

export async function generateStationNameCandidates({ context, lngLat, model = DEFAULT_OPENROUTER_MODEL, signal } = {}) {
  if (!context || typeof context !== 'object') {
    throw new Error('缺少周边命名上下文')
  }

  const { evidences, enforceIntersectionPriority } = buildEvidenceListFromContext(context)
  if (!evidences.length) {
    throw new Error('周边命名要素不足，无法生成候选站名')
  }

  const evidenceById = buildEvidenceMap(evidences)
  const modelInput = projectContextForModel(context, lngLat, evidences)
  const systemPrompt = [
    '你是轨道交通车站命名评审助手。',
    '你只能从输入 evidence 列表中选择命名依据，禁止输出 evidence 列表之外的任何地名或设施名。',
    '每个候选必须绑定一个 evidenceId，且 nameZh 必须与该 evidence 的 nameZh 对应。nameZh 末尾禁止出现“站/车站/地铁站”。',
    '若 evidence 中存在主干路/次干路（高 importance 道路），优先考虑其作为道路命名依据，不要优先选择居住小路或服务道路。',
    enforceIntersectionPriority
      ? '当前证据显示站位处于强交叉口场景：①道路类候选只能使用 intersections 证据，严禁用单一道路证据命名。'
      : '若证据中存在道路交叉口（intersections），优先使用交叉口证据作为①道路候选，不要忽略交汇关系。',
    '如果无法给出充分 grounded 的候选，可以少给，绝不编造。',
    '严格遵守以下中文标准：',
    CHINESE_NAMING_STANDARD,
    '严格遵守以下英文标准：',
    ENGLISH_NAMING_STANDARD,
    '输出约束：',
    '1) 仅输出 JSON；2) candidates 最多 5 条；3) 候选中英文名称均需互不重复；4) basis 仅可取 ①道路/②地域/③公共设施/④其它；5) 不得出现训练记忆中的外部知名站名；6) nameEn 末尾严禁出现 Station/Metro Station/Subway Station；7) 公共机构必须意译通名（医院/学校/政府机构等）。',
  ].join('\n')

  const payload = {
    model,
    stream: false,
    response_format: {
      type: 'json_schema',
      json_schema: {
        name: 'station_name_candidates',
        strict: true,
        schema: STATION_NAME_RESPONSE_SCHEMA,
      },
    },
    temperature: 0.1,
    top_p: 0.8,
    messages: [
      {
        role: 'system',
        content: systemPrompt,
      },
      {
        role: 'user',
        content: JSON.stringify(
          {
            task: '请根据输入 evidence 生成 grounded 的地铁车站命名候选。',
            output: '返回 candidates 数组，每项含 evidenceId/nameZh/nameEn/basis/reason。',
            context: modelInput,
          },
          null,
          2,
        ),
      },
    ],
  }

  const responsePayload = await postOpenRouterChatWithFallback(payload, signal)
  const rawCandidates = extractCandidatesFromChatResponse(responsePayload)
  const groundedModelCandidates = dedupeCandidates(
    rawCandidates.map((item) => normalizeCandidate(item, evidenceById)).filter(Boolean),
  )

  const fallbackCandidates = buildFallbackCandidatesFromEvidence(evidences)
  const merged = dedupeCandidates([...groundedModelCandidates, ...fallbackCandidates]).slice(0, 5)

  if (merged.length < 5) {
    throw new Error('周边命名要素不足，无法生成 5 个候选站名')
  }

  return merged.map(({ evidenceId, ...rest }) => rest)
}

export { DEFAULT_OPENROUTER_MODEL }
