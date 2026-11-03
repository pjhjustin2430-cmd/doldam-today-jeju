// 화면 → 우리 서버 함수(/api). 공공 API 키가 브라우저에 노출되지 않도록 항상 /api 를 거친다.
async function readJson(r) {
  let data
  try { data = await r.json() }
  catch { throw new Error(`서버 응답이 JSON이 아님 (${r.status})`) }
  if (!r.ok) throw new Error(data.error || r.statusText)
  return data
}
const get = async (path) => readJson(await fetch(path))
const post = async (path, body) => readJson(await fetch(path, {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
}))

export const ping = () => get('/api/hello')
export const fetchSpots = () => get('/api/spots')
export const fetchNearby = ({ id, lat, lng, type = '', radius = 3000, rows = 8 }) =>
  get(`/api/nearby?${new URLSearchParams({ ...(id ? { id } : { lat, lng }), type, radius, rows })}`)
// 안내 바·홈·지도가 같은 값을 쓰므로 5분 동안 한 번만 받는다 (진행 중인 요청도 함께 쓴다)
const cache = new Map()
const cached = (key, fn, ttl = 5 * 60 * 1000) => {
  const hit = cache.get(key)
  if (hit && Date.now() - hit.at < ttl) return hit.p
  const p = fn().catch((e) => { cache.delete(key); throw e })
  cache.set(key, { at: Date.now(), p })
  return p
}
export const fetchWeather = (place = '서귀포시', day = 'today') =>
  cached(`weather:${place}:${day}`, () => get(`/api/weather?place=${encodeURIComponent(place)}${day === 'today' ? '' : `&day=${day}`}`))
export const fetchSun = () => cached('sun', () => get('/api/sun'), 30 * 60 * 1000)
export const fetchAir = () => cached('air', () => get('/api/air'))
export const askAgent = (message, history) => post('/api/agent', { message, history })
export const fetchExhibitions = (status = '', limit = 10) => get(`/api/exhibitions?status=${status}&limit=${limit}`)
