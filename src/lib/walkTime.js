// 시간대별 걷기 좋은 때 · 체감온도 · 옷차림 · 자외선 — 기상청 예보(바람·강수·기온·습도)와 Open-Meteo(일몰·자외선)로 계산한다

export const hourOf = (slot) => Number(slot.time.slice(9, 11))

// 한 시간대의 걷기 수준: good 걷기 좋아요 / ok 주의 / bad 쉬어가요
export function hourLevel(s) {
  if (s.pop >= 60 || s.wind >= 9 || (s.rain && s.rain !== '없음')) return 'bad'
  if (s.pop >= 30 || s.wind >= 6) return 'ok'
  return 'good'
}

export const fmtHour = (h) => (h === 12 ? '낮 12시' : h === 0 || h === 24 ? '밤 12시' : h < 12 ? `오전 ${h}시` : `오후 ${h - 12}시`)

// 가장 길게 이어지는 "걷기 좋아요" 구간 (없으면 "주의" 구간, 그것도 없으면 null)
export function bestWindow(slots = []) {
  const step = slots.length > 1 ? Math.max(1, hourOf(slots[1]) - hourOf(slots[0])) : 1
  for (const want of ['good', 'ok']) {
    let best = null, run = []
    const flush = () => { if (run.length && (!best || run.length > best.length)) best = run; run = [] }
    slots.forEach((s) => { if (hourLevel(s) === want) run.push(s); else flush() })
    flush()
    if (best) return { level: want, from: hourOf(best[0]), to: hourOf(best[best.length - 1]) + step, count: best.length }
  }
  return null
}

// 체감온도(°C): 기온·습도·풍속으로 계산하는 겉보기 온도(Steadman). 바람 1m/s 당 약 0.7도 낮아지고 습하면 높아진다
export function feelsLike(temp, hum = 60, wind = 0) {
  const e = (hum / 100) * 6.105 * Math.exp((17.27 * temp) / (237.7 + temp))
  return Math.round(temp + 0.33 * e - 0.7 * wind - 4)
}

export function uvLabel(uv) {
  if (uv == null) return null
  if (uv < 3) return '낮음'
  if (uv < 6) return '보통'
  if (uv < 8) return '높음'
  if (uv < 11) return '매우 높음'
  return '위험'
}

// 옷차림 한 줄: 체감온도로 겉옷을 고르고, 바람·비·자외선이 있으면 챙길 것을 덧붙인다
export function dressLine({ feels, pop = 0, wind = 0, uv = null }) {
  const main = feels <= 3 ? '두꺼운 패딩과 장갑' : feels <= 9 ? '패딩이나 두꺼운 코트' : feels <= 15 ? '가벼운 코트나 가디건'
    : feels <= 20 ? '얇은 긴팔에 가벼운 겉옷' : feels <= 25 ? '얇은 긴팔이나 반팔' : '반팔과 마실 물'
  const extra = []
  if (wind >= 6) extra.push('바람막이')
  if (pop >= 30) extra.push('우산')
  if (uv != null && uv >= 6) extra.push('모자와 선크림')
  else if (uv != null && uv >= 3) extra.push('선크림')
  return `${main}${extra.length ? ` + ${extra.join(' · ')}` : ''} 차림을 추천해요`
}
