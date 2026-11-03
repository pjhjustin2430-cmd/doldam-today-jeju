// ③ 한국관광공사 TourAPI(KorService2) — 좌표 주변의 관광지·식당, 제주 전체의 숙박·축제를 가까운 순으로
import { memo } from './cache.js'
import { fetchJson, toList } from './http.js'

const BASE = 'https://apis.data.go.kr/B551011/KorService2/'
const TYPE = { 12: '관광지', 14: '문화시설', 15: '축제·행사', 32: '숙박', 39: '음식점' }
const JEJU = '50' // 법정동 지역코드(제주특별자치도). areaCode=39 는 옛 코드라 일부만 나온다

const common = () => ({ serviceKey: process.env.DATA_GO_KR_KEY, MobileOS: 'ETC', MobileApp: 'DoldamToday', _type: 'json' })

async function call(op, params) {
  const data = await fetchJson(`${BASE}${op}?${new URLSearchParams({ ...common(), pageNo: '1', ...params })}`, 'TourAPI')
  const header = data?.response?.header
  if (header && header.resultCode !== '0000') throw new Error(`TourAPI: ${header.resultMsg}`)
  return toList(data?.response?.body?.items?.item)
}

// 두 좌표 사이 거리(m)
function meters(lat1, lng1, lat2, lng2) {
  const t = (x) => (x * Math.PI) / 180
  const a = Math.sin(t(lat2 - lat1) / 2) ** 2 + Math.cos(t(lat1)) * Math.cos(t(lat2)) * Math.sin(t(lng2 - lng1) / 2) ** 2
  return Math.round(2 * 6371000 * Math.asin(Math.sqrt(a)))
}

const place = (p, extra = {}) => ({
  id: p.contentid, title: p.title, addr: p.addr1, type: TYPE[p.contenttypeid] ?? '장소',
  dist: p.dist != null ? Math.round(Number(p.dist)) : 0, lat: Number(p.mapy), lng: Number(p.mapx),
  image: p.firstimage ? p.firstimage.replace('http://', 'https://') : '', ...extra,
})

const kstDay = () => new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10).replaceAll('-', '')
const dotted = (d) => (d && d.length === 8 ? `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6)}` : d)

// 숙박: locationBasedList2 는 숙박이 거의 안 나와서(반경 5km 안에 0곳인 명소가 대부분), 제주 숙박 전체(약 210곳)를 한 번 받아 두고 거리로 걸러 낸다
const allStays = () => memo('tour:stays', 6 * 3600e3, async () => (await call('searchStay2', { lDongRegnCd: JEJU, numOfRows: '500', arrange: 'A' })).filter((p) => p.mapx && p.mapy))
// 축제·행사: 오늘 이후에 끝나는 제주 행사 전체 (진행 중 + 예정, 보통 5곳 안팎)
const allFestivals = () => memo(`tour:fest:${kstDay()}`, 3600e3, async () => (await call('searchFestival2', { eventStartDate: kstDay(), lDongRegnCd: JEJU, numOfRows: '100', arrange: 'A' })).filter((p) => p.mapx && p.mapy))

async function nearbyFrom(list, { lat, lng, radius, rows }, extraOf = () => ({})) {
  return list
    .map((p) => place(p, { dist: meters(Number(lat), Number(lng), Number(p.mapy), Number(p.mapx)), ...extraOf(p) }))
    .filter((p) => p.dist <= radius)
    .sort((a, b) => a.dist - b.dist)
    .slice(0, rows)
}

export const nearbyPlaces = ({ lat, lng, radius = 3000, contentTypeId = '', rows = 8 } = {}) => {
  const type = String(contentTypeId)
  if (type === '32') return memo(`tour:stay:${Number(lat).toFixed(4)},${Number(lng).toFixed(4)},${radius},${rows}`, 30 * 60e3, async () => nearbyFrom(await allStays(), { lat, lng, radius, rows }))
  if (type === '15') {
    return memo(`tour:fest:${kstDay()}:${Number(lat).toFixed(4)},${Number(lng).toFixed(4)},${rows}`, 30 * 60e3, async () =>
      nearbyFrom(await allFestivals(), { lat, lng, radius: Infinity, rows }, (p) => ({
        start: dotted(p.eventstartdate), end: dotted(p.eventenddate), ongoing: p.eventstartdate <= kstDay(),
      })))
  }
  return memo(`tour:${Number(lat).toFixed(4)},${Number(lng).toFixed(4)},${radius},${type},${rows}`, 30 * 60e3, () => fetchNearby({ lat, lng, radius, contentTypeId: type, rows }))
}

async function fetchNearby({ lat, lng, radius, contentTypeId, rows }) {
  const params = { numOfRows: String(rows), mapX: String(lng), mapY: String(lat), radius: String(radius), arrange: 'E' }
  if (contentTypeId) params.contentTypeId = contentTypeId
  return (await call('locationBasedList2', params)).map((p) => place(p))
}
