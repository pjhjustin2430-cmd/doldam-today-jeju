// ⑥ Open-Meteo(키 불필요) — 제주 일출·일몰 시각과 자외선 지수. 걷기 좋은 때·옷차림 안내에 쓴다.
import { memo } from './cache.js'
import { fetchJson } from './http.js'

const hm = (iso) => iso?.slice(11, 16) // "2026-11-03T17:42" → "17:42"

// 오늘·내일의 일출/일몰/자외선 최고치 (한국 시간 기준, 1시간 캐시)
export const getSun = () => memo('sun', 60 * 60e3, async () => {
  const params = new URLSearchParams({
    latitude: '33.4', longitude: '126.55', daily: 'sunrise,sunset,uv_index_max', timezone: 'Asia/Seoul', forecast_days: '2',
  })
  const d = (await fetchJson(`https://api.open-meteo.com/v1/forecast?${params}`, 'Open-Meteo')).daily
  if (!d?.time) throw new Error('Open-Meteo: 일몰 정보가 없어요')
  return d.time.map((date, i) => ({
    date, sunrise: hm(d.sunrise[i]), sunset: hm(d.sunset[i]), uvMax: d.uv_index_max[i] == null ? null : Math.round(d.uv_index_max[i] * 10) / 10,
  }))
})
