import Anthropic from '@anthropic-ai/sdk'
import { findSpot, getKinds, listSpots } from '../server/doldam.js'
import { getWeather } from '../server/weather.js'
import { getAirQuality } from '../server/air.js'
import { nearbyPlaces } from '../server/tour.js'
import { stoneparkExhibitions } from '../server/stonepark.js'

// 모델은 환경변수 ANTHROPIC_MODEL 로 바꾼다 (예: claude-haiku-5-5 = 빠르고 저렴, 없으면 claude-sonnet-5-5)
const MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-5-5'

const tools = [
  {
    name: 'search_doldam_spots',
    description: '제주 돌담 명소(밭담·환해장성·진성·마을 돌담·방사탑·돌염전·돌문화공원)를 조회한다. 종류·지역·무장애 여부로 걸러서 후보를 돌려준다',
    input_schema: {
      type: 'object',
      properties: {
        kind: { type: 'string', enum: getKinds().map((k) => k.name), description: '돌담 종류' },
        keyword: { type: 'string', description: '이름·지역에 들어갈 말 (예: 구좌, 애월, 섬, 바다)' },
        accessibleOnly: { type: 'boolean', description: 'true 면 무장애 정보(휠체어·접근성)가 조사된 곳만' },
      },
    },
  },
  {
    name: 'get_spot_detail',
    description: '명소 하나의 설명과 걷기 정보를 조회한다. 실측 경로가 있는 곳(감수굴밭담길·돌문화공원)은 거리·소요시간·접근성 안내·주변 시설까지 준다',
    input_schema: {
      type: 'object',
      properties: { spotId: { type: 'string', description: 'search_doldam_spots 결과의 id' } },
      required: ['spotId'],
    },
  },
  {
    name: 'get_weather',
    description: '기상청 단기예보로 제주시(북쪽)/서귀포시(남쪽)의 기온·강수확률·풍속을 조회한다. 기본은 앞으로 8시간, day=tomorrow 이면 내일 06~20시',
    input_schema: {
      type: 'object',
      properties: {
        place: { type: 'string', enum: ['제주시', '서귀포시'] },
        day: { type: 'string', enum: ['today', 'tomorrow'], description: '내일 날씨를 물으면 tomorrow' },
      },
      required: ['place'],
    },
  },
  {
    name: 'find_nearby_places',
    description: '관광공사 TourAPI로 명소 주변의 관광지·문화시설·음식점·숙박(반경 10km)·축제·행사(제주 전체, 가까운 순)를 조회한다',
    input_schema: {
      type: 'object',
      properties: {
        spotId: { type: 'string', description: 'search_doldam_spots 결과의 id' },
        contentTypeId: { type: 'string', description: '12 관광지, 14 문화시설, 15 축제·행사, 32 숙박, 39 음식점. 비우면 전체' },
      },
      required: ['spotId'],
    },
  },
  {
    name: 'get_stonepark_exhibitions',
    description: '제주특별자치도청 오픈API로 제주돌문화공원의 전시·행사를 조회한다. 비 오는 날 실내에서 볼 거리를 찾을 때 쓴다',
    input_schema: {
      type: 'object',
      properties: {
        status: { type: 'string', enum: ['ING', 'END'], description: 'ING 진행 중(기본), END 지난 전시' },
        limit: { type: 'number', description: '최대 건수 (기본 5)' },
      },
    },
  },
  {
    name: 'get_air_quality',
    description: '에어코리아로 제주 측정소의 실시간 미세먼지(PM10, PM2.5)를 조회한다. 에어코리아가 막혀 있으면 Open-Meteo 모델 추정값을 주며 이때 estimated: true 가 붙는다',
    input_schema: { type: 'object', properties: {} },
  },
]

async function searchSpots({ kind, keyword, accessibleOnly } = {}) {
  const kinds = getKinds()
  let list = listSpots()
  if (kind) list = list.filter((s) => kinds.find((k) => k.id === s.kind)?.name === kind)
  if (keyword) list = list.filter((s) => `${s.name} ${s.area} ${s.summary} ${s.story}`.includes(keyword))
  if (accessibleOnly) list = list.filter((s) => s.hasTrack)
  return list.map((s) => ({
    id: s.id, name: s.name, kind: kinds.find((k) => k.id === s.kind)?.name, area: s.area, summary: s.summary,
    weatherPlace: s.weather, island: Boolean(s.island), hasTrack: Boolean(s.hasTrack), dist: s.dist, minutes: s.minutes,
  }))
}

async function spotDetail({ spotId } = {}) {
  const s = findSpot(spotId)
  if (!s) throw new Error('없는 명소 id예요')
  const kind = getKinds().find((k) => k.id === s.kind)
  return {
    id: s.id, name: s.name, area: s.area, kind: kind.name, kindInfo: kind.text, tip: kind.tip, story: s.story,
    positionNote: s.approx ? '마을·해안 단위의 근사 위치' : s.coordSource === 'osm' ? '성벽을 따라 난 길(OSM)의 좌표' : '실제 좌표',
    walk: s.hasTrack ? { km: s.dist, minutes: s.minutes } : undefined,
    accessibility: s.points?.filter((p) => p.access || p.detail).slice(0, 8).map((p) => `${p.name}: ${[p.detail, p.access].filter(Boolean).join(' / ')}`)
      ?? s.notes?.filter((n) => n.desc).slice(0, 10).map((n) => `${n.name}: ${n.desc}`),
    facilities: s.facilities?.map((f) => `${f.type} ${f.name} (${f.radius}m, ${f.info})`),
  }
}

async function findNearby({ spotId, contentTypeId = '' } = {}) {
  const s = findSpot(spotId)
  if (!s) throw new Error('없는 명소 id예요')
  return nearbyPlaces({ lat: s.lat, lng: s.lng, contentTypeId, radius: contentTypeId === '32' ? 10000 : 3000 })
}

const runTool = { search_doldam_spots: searchSpots, get_spot_detail: spotDetail, get_weather: getWeather, find_nearby_places: findNearby, get_air_quality: getAirQuality,
  get_stonepark_exhibitions: ({ status = 'ING', limit = 5 } = {}) => stoneparkExhibitions({ status, limit }) }

const SYSTEM = `너는 제주 돌담 안내 "돌담지기" 에이전트다. 밭담·환해장성·진성·마을 돌담·방사탑·돌염전을 걷는 사람에게 오늘 갈 곳을 골라 준다.
- 명소·날씨·미세먼지는 반드시 도구로 확인한 뒤 답한다. 도구 결과에 없는 명소나 사실은 지어내지 않는다.
- 제주시는 북쪽, 서귀포시는 남쪽 날씨다. 명소의 weatherPlace 에 맞춰 고른다.
- 환해장성·돌염전·섬(우도·가파도)은 바닷바람을 직접 맞는다. 풍속 6m/s 이상이면 권하지 않고, 마을 안쪽 돌담이나 돌문화공원 같은 곳을 대신 제안한다.
- get_air_quality 결과에 estimated: true 가 있으면 실측이 아니라 모델 추정값이라고 한 번 밝힌다.
- 강수확률 60% 이상, 풍속 9m/s 이상, 미세먼지 나쁨 이상이면 야외 걷기를 권하지 않는다.
- 휠체어·유모차·무릎이 불편한 사람이 물으면 무장애 정보가 있는 곳(hasTrack)과 get_spot_detail 의 접근성 안내를 근거로 답한다.
- 비가 오거나 바람이 센 날에는 돌문화공원을 권하고, get_stonepark_exhibitions 로 지금 진행 중인 전시를 확인해 함께 알려 준다.
- 위치가 근사인 곳은 "지도 앱에서 이름으로 검색해 확인하세요"라고 덧붙인다.
- 내일 날씨를 물으면 get_weather 를 day='tomorrow' 로 부른다.
- 마크다운 기호(**, #, 목록 기호)는 쓰지 말고 평범한 문장으로, 한국어로 5문장 이내로 짧게 답한다.`

// 키 사용량을 지키려는 간단한 제한: IP 하나당 10분에 20번, 질문은 500자까지 (서버리스에서는 인스턴스별로 세는 최소한의 방어)
const hits = new Map()
function tooMany(req) {
  const ip = String(req.headers?.['x-forwarded-for'] ?? 'local').split(',')[0].trim()
  const now = Date.now()
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < 10 * 60 * 1000)
  recent.push(now)
  hits.set(ip, recent)
  if (hits.size > 500) for (const [k, v] of hits) if (!v.some((t) => now - t < 10 * 60 * 1000)) hits.delete(k)
  return recent.length > 20
}

// Claude API 오류를 사람이 읽을 수 있는 말로 (원문 JSON 을 화면에 그대로 내보내지 않는다)
function friendly(e) {
  const msg = String(e?.message ?? '')
  if (/credit balance/i.test(msg)) return 'Claude API 크레딧이 부족해요. Anthropic 콘솔의 Billing 에서 충전한 뒤 다시 시도해 주세요.'
  if (e?.status === 401 || /api[_ ]?key|authentication/i.test(msg)) return 'Claude API 키가 올바르지 않아요. Vercel 환경변수 ANTHROPIC_API_KEY 를 확인해 주세요.'
  if (e?.status === 429) return '요청이 많아요. 잠시 뒤 다시 시도해 주세요.'
  if (e?.status === 529 || /overloaded/i.test(msg)) return 'Claude 서버가 붐벼요. 잠시 뒤 다시 시도해 주세요.'
  return '돌담지기가 답하지 못했어요. 잠시 뒤 다시 시도해 주세요.'
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' })
  if (tooMany(req)) return res.status(429).json({ error: '질문이 너무 많아요. 10분 뒤에 다시 시도해 주세요.' })
  const asked = req.body?.message
  if (typeof asked !== 'string' || !asked.trim() || asked.length > 500) return res.status(400).json({ error: '질문은 1~500자로 입력해 주세요.' })
  if (!process.env.ANTHROPIC_API_KEY) return res.status(500).json({ error: 'ANTHROPIC_API_KEY 가 설정되지 않았어요' })
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  const { message, history = [] } = req.body ?? {}
  const messages = [...history.slice(-10), { role: 'user', content: message }]
  const steps = []

  try {
    for (let turn = 0; turn < 6; turn++) {
      const r = await client.messages.create({ model: MODEL, max_tokens: 1024, system: SYSTEM, tools, messages })
      if (r.stop_reason !== 'tool_use') {
        const answer = r.content.filter((b) => b.type === 'text').map((b) => b.text).join('\n')
        return res.status(200).json({ answer, steps })
      }
      messages.push({ role: 'assistant', content: r.content })
      const results = []
      for (const block of r.content) {
        if (block.type !== 'tool_use') continue
        let result
        try { result = await runTool[block.name](block.input ?? {}) }
        catch (e) { result = { error: e.message } }
        steps.push({ tool: block.name, args: block.input, count: Array.isArray(result) ? result.length : result?.error ? 0 : 1, error: result?.error })
        results.push({ type: 'tool_result', tool_use_id: block.id, content: JSON.stringify(result) })
      }
      messages.push({ role: 'user', content: results })
    }
    res.status(200).json({ answer: '도구 호출이 너무 많아 중단했어요. 질문을 좁혀 주세요.', steps })
  } catch (e) {
    res.status(e.status ?? 500).json({ error: friendly(e) })
  }
}
