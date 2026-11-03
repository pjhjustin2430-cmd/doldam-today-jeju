import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { fetchExhibitions, fetchNearby, fetchSun, fetchWeather } from '../api/client'
import { bestWindow, dressLine, feelsLike, fmtHour, hourLevel, hourOf, uvLabel } from '../lib/walkTime'

const LV = { good: '걷기 좋아요', ok: '주의', bad: '쉬어가요' }

// 오늘·내일 시간대별 걷기 수준 + 가장 좋은 때 + 체감온도·옷차림 + 일몰·자외선
function useWalkData(place) {
  const [s, setS] = useState({ loading: true, today: [], tomorrow: [], sun: [] })
  useEffect(() => {
    let alive = true
    setS((x) => ({ ...x, loading: true }))
    Promise.allSettled([fetchWeather(place, 'hours'), fetchWeather(place, 'tomorrow'), fetchSun()]).then(([h, t, u]) => {
      if (alive) setS({ loading: false, today: h.value ?? [], tomorrow: t.value ?? [], sun: u.value ?? [], error: h.status === 'rejected' ? h.reason.message : '' })
    })
    return () => { alive = false }
  }, [place])
  return s
}

export default function WalkPanel({ place: first = '제주시', compact = false }) {
  const [place, setPlace] = useState(first)
  const [day, setDay] = useState('today')
  const d = useWalkData(place)
  const slots = day === 'today' ? d.today : d.tomorrow
  const sun = d.sun[day === 'today' ? 0 : 1]
  const win = useMemo(() => bestWindow(slots), [slots])
  const ref = slots.find((s) => s.temp != null) // 옷차림은 지금(내일은 가장 이른 시간) 기준
  const feels = ref ? feelsLike(ref.temp, ref.hum, ref.wind) : null
  const maxPop = slots.length ? Math.max(...slots.map((s) => s.pop || 0)) : 0
  const maxWind = slots.length ? Math.max(...slots.map((s) => s.wind || 0)) : 0

  return (
    <section className={`walk-panel ${compact ? 'compact' : ''}`} aria-label="걷기 좋은 때">
      <div className="walk-head">
        <div className="walk-tabs" role="tablist" aria-label="날짜">
          {[['today', '오늘'], ['tomorrow', '내일']].map(([k, l]) => (
            <button key={k} type="button" role="tab" aria-selected={day === k} className={day === k ? 'on' : ''} onClick={() => setDay(k)}>{l}</button>
          ))}
        </div>
        {!compact && (
          <div className="walk-tabs" role="tablist" aria-label="지역">
            {['제주시', '서귀포시'].map((p) => (
              <button key={p} type="button" role="tab" aria-selected={place === p} className={place === p ? 'on' : ''} onClick={() => setPlace(p)}>{p}</button>
            ))}
          </div>
        )}
        {compact && <span className="small text-muted">{place} 기준</span>}
      </div>

      {d.loading ? <div className="text-muted small p-2">예보를 불러오는 중...</div> : slots.length === 0 ? (
        <div className="text-muted small p-2">{day === 'today' ? '오늘 남은 시간의 예보가 없어요. 내일 예보를 확인해 보세요.' : '예보를 불러오지 못했어요.'}</div>
      ) : (
        <>
          <div className="walk-best">
            {win
              ? <><i className={`bi bi-clock-history lv-${win.level}`} /> {day === 'today' ? '오늘' : '내일'} <b>{fmtHour(win.from)}~{fmtHour(win.to)}</b>
                <span className={`walk-badge lv-${win.level}`}>{LV[win.level]}</span></>
              : <><i className="bi bi-cloud-rain lv-bad" /> {day === 'today' ? '오늘' : '내일'}은 걷기 좋은 시간이 없어요 <span className="walk-badge lv-bad">쉬어가요</span></>}
          </div>

          <div className="walk-bars" role="list">
            {slots.map((s) => {
              const lv = hourLevel(s)
              return (
                <div key={s.time} className="walk-cell" role="listitem" title={`${fmtHour(hourOf(s))} · ${s.temp}° · 바람 ${s.wind}m/s · 비 ${s.pop}%`}>
                  <span className="t">{s.temp}°</span>
                  <i className={`bar lv-${lv}`} />
                  <span className="h">{hourOf(s)}시</span>
                </div>
              )
            })}
          </div>
          <div className="walk-legend"><i className="lv-good" />걷기 좋아요 <i className="lv-ok" />주의(비 30%·바람 6m/s 이상) <i className="lv-bad" />쉬어가요(비 60%·바람 9m/s 이상)</div>

          <ul className="walk-lines">
            {feels != null && (
              <li><i className="bi bi-thermometer-half" /> <b>체감 {feels}°</b> (기온 {ref.temp}°) — {dressLine({ feels, pop: maxPop, wind: maxWind, uv: sun?.uvMax })}</li>
            )}
            {sun && (
              <li><i className="bi bi-sunset" /> 일몰 <b>{sun.sunset}</b>{sun.uvMax != null && <> · 자외선 최고 <b>{sun.uvMax}</b> ({uvLabel(sun.uvMax)})</>}
                {day === 'today' && <span className="text-muted"> · 해 지기 전에 마치면 좋아요</span>}</li>
            )}
          </ul>
        </>
      )}

      {!compact && <RainCourse rainy={d.today.some((s) => s.pop >= 50) || d.tomorrow.some((s) => s.pop >= 50)} todayRain={d.today.some((s) => s.pop >= 50)} />}
    </section>
  )
}

// 비 오는 날 대안 코스: 실내 전시가 있는 제주돌문화공원 + 지금 열리는 전시 + 근처 식당 (도청 오픈API · TourAPI)
function RainCourse({ rainy, todayRain }) {
  const [c, setC] = useState({ ex: [], food: null })
  useEffect(() => {
    let alive = true
    Promise.allSettled([fetchExhibitions('ING', 2), fetchNearby({ id: 'stonepark', type: '39', radius: 3000, rows: 1 })]).then(([e, f]) => {
      if (alive) setC({ ex: e.value ?? [], food: f.value?.[0] ?? null })
    })
    return () => { alive = false }
  }, [])
  return (
    <div className={`rain-course ${rainy ? 'on' : ''}`}>
      <div className="rc-title"><i className="bi bi-umbrella" /> 비 오는 날 대안 코스
        {rainy && <span className="walk-badge lv-bad">{todayRain ? '오늘 비 예보' : '내일 비 예보'}</span>}</div>
      <ol>
        <li><Link to="/spots/stonepark"><b>제주돌문화공원</b></Link> — 실내 전시관과 무장애 산책로(약 2km)가 있어 비가 와도 둘러볼 수 있어요</li>
        <li>지금 열리는 전시: {c.ex.length ? <b>{c.ex[0].title}</b> : <span className="text-muted">불러오는 중...</span>}</li>
        <li>점심은 근처에서: {c.food ? <b>{c.food.title}</b> : <span className="text-muted">불러오는 중...</span>}{c.food ? ` (${c.food.dist}m)` : ''}</li>
      </ol>
    </div>
  )
}
