import { useEffect, useMemo, useState } from 'react'
import { Badge, Button, Carousel, Col, Row, Tab, Tabs } from 'react-bootstrap'
import { Link, useParams } from 'react-router-dom'
import ElevationChart from '../components/ElevationChart'
import Exhibitions from '../components/Exhibitions'
import FindPlace from '../components/FindPlace'
import InfoBadge from '../components/InfoBadge'
import KindBadge from '../components/KindBadge'
import SpotMap from '../components/SpotMap'
import WalkPanel from '../components/WalkPanel'
import { Empty, ErrorAlert, Loading } from '../components/Status'
import { fetchNearby } from '../api/client'
import { loadProfile } from '../lib/elevationProfile'
import { creditText } from '../lib/photoCredit'
import { kakaoPin } from '../lib/mapLinks'
import { placeOf, useConditions } from '../lib/useConditions'
import { usePageTitle } from '../lib/usePageTitle'
import { pickDust } from '../lib/walkability'
import { useAppStore } from '../store/useAppStore'

const TABS = [['12', '주변 관광지'], ['39', '주변 식당'], ['32', '주변 숙박']]

// 명소 상세: 지도 · 돌담 이야기 · (실측 경로가 있으면) 고도·구간 안내 · 사진 · 주변 정보(관광공사 TourAPI)
export default function SpotDetail() {
  const { id } = useParams()
  const { spots, kinds, loadSpots, stamp } = useAppStore()
  useEffect(() => { loadSpots() }, [loadSpots])
  const idx = spots.findIndex((s) => s.id === id)
  const spot = spots[idx]

  if (!spots.length) return <Loading text="명소를 불러오는 중..." />
  if (!spot) return <Empty text="없는 명소예요" />

  return <Detail key={spot.id} spot={spot} kind={kinds.find((k) => k.id === spot.kind)} prev={spots[idx - 1]} next={spots[idx + 1]}
    onStamp={() => stamp(spot)} />
}

function Detail({ spot, kind, prev, next, onStamp }) {
  usePageTitle(spot.name)
  const { fit, slots, air } = useConditions(placeOf(spot))
  const [tab, setTab] = useState('12')
  const [data, setData] = useState({ loading: true, tabs: {}, error: '' })
  const [prof, setProf] = useState(spot.hasTrack ? null : undefined) // null = 고도를 불러오는 중, undefined = 경로 없음
  const [profError, setProfError] = useState('')

  useEffect(() => {
    let alive = true
    Promise.allSettled(TABS.map(([t]) => fetchNearby({ lat: spot.lat, lng: spot.lng, type: t, radius: t === '32' ? 20000 : 5000, rows: 8 }))).then((r) => {
      if (!alive) return
      const err = r.find((x) => x.status === 'rejected')
      setData({ loading: false, tabs: Object.fromEntries(TABS.map(([t], i) => [t, r[i].status === 'fulfilled' ? r[i].value : []])), error: err ? err.reason.message : '' })
    })
    return () => { alive = false }
  }, [spot])

  useEffect(() => {
    if (!spot.hasTrack) return undefined
    let alive = true
    loadProfile(spot).then((p) => alive && setProf(p)).catch((e) => { if (alive) { setProf(undefined); setProfError(e.message) } })
    return () => { alive = false }
  }, [spot])

  // 사진은 그 돌담의 사진(또는 같은 종류의 사진)만 보여준다. 없는 명소는 사진 칸을 만들지 않는다
  const gallery = spot.photos ?? []
  const guide = spot.notes?.filter((n) => n.desc) ?? spot.points ?? []
  const dust = pickDust(air, spot.weather)

  const stats = [
    ['종류', kind?.name],
    [spot.hasTrack ? '걷는 거리' : '위치', spot.hasTrack ? `${spot.dist}km` : spot.area.replace(/^.*?시 /, '')],
    [spot.hasTrack ? '소요시간' : '위치 정확도', spot.hasTrack ? `약 ${spot.minutes}분` : spot.coordSource === 'kto' ? '관광공사 좌표' : spot.coordSource === 'wiki' ? '위키백과 좌표' : spot.coordSource === 'osm' ? '지도 데이터 좌표' : spot.approx ? '마을·해안 근사' : '지명 확인'],
    ['무장애 조사', spot.hasTrack ? '있음' : '없음'],
    ['오늘 걷기', fit ? <Badge bg={fit.variant}>{fit.label}</Badge> : '확인 중'],
  ]

  const galleryEl = gallery.length === 0 ? null : (
    <>
      <h3 className="section-title">사진<small>출처와 라이선스는 사진 아래에 표시해요</small></h3>
      <Carousel className="gallery" interval={null} indicators={gallery.length > 1} controls={gallery.length > 1}>
        {gallery.map((p) => (
          <Carousel.Item key={p.src}>
            <img src={p.src} alt={p.caption} loading="lazy" />
            <Carousel.Caption>
              <b>{p.caption}</b>
              <div className="small">
                {p.url ? <a href={p.url} target="_blank" rel="noreferrer" className="text-white">{creditText(p)}</a> : creditText(p)}
              </div>
            </Carousel.Caption>
          </Carousel.Item>
        ))}
      </Carousel>
    </>
  )

  return (
    <>
      <div className="detail-head">
        <div>
          <Link to="/spots" className="crumb"><i className="bi bi-chevron-left" /> 전체 명소</Link>
          <div className="d-flex align-items-center gap-2 flex-wrap mb-2"><span className="eyebrow m-0">{kind?.name} · {spot.area}</span><InfoBadge spot={spot} /></div>
          <h1>{spot.name}</h1>
        </div>
        <div className="d-flex gap-2 flex-wrap">
          <Button variant="primary" onClick={onStamp}><i className="bi bi-patch-check me-1" />돌담 도장</Button>
        </div>
      </div>

      <SpotMap spot={spot} kind={kind} prof={prof ?? undefined} dots={spot.hasTrack ? (spot.points ?? spot.notes ?? []) : []} places={spot.hasTrack ? [] : (data.tabs['12'] ?? []).slice(0, 5)} />
      <div className="map-note">
        {spot.hasTrack
          ? `공공데이터(${spot.source})의 실측 경로예요. 선 색은 고도예요(낮음 청록 → 높음 벽돌색).`
          : `${spot.coordSource === 'kto' ? '한국관광공사에 등록된 관광지 좌표예요.' : spot.coordSource === 'wiki' ? '위키백과에 이 이름으로 등록된 유산 항목의 좌표예요.' : spot.coordSource === 'osm' ? '성벽을 따라 난 환해장성로(OpenStreetMap)의 좌표예요.' : spot.approx ? '마을·해안 단위의 대략적인 위치예요.' : '지명으로 확인한 위치예요.'} 번호 핀은 가까운 관광지예요(누르면 카카오맵). 정확한 위치는 아래 '찾아가기'로 확인하세요.`}
      </div>

      <div className="stat-bar">
        {stats.map(([k, v]) => <div key={k}><span>{k}</span><b>{v}</b></div>)}
      </div>

      {fit?.variant === 'danger' && spot.kind !== 'park' && (
        <div className="rain-alt">
          <i className="bi bi-umbrella" /> 오늘은 <b>{fit.reasons.join(' · ')}</b>예요. 실내 전시가 있는 <Link to="/spots/stonepark"><b>제주돌문화공원</b></Link>을 대신 추천해요.
        </div>
      )}

      <WalkPanel place={placeOf(spot)} compact />

      {!spot.hasTrack && galleryEl}

      <Row className="g-4 mt-1">
        <Col lg={7}>
          <h3 className="section-title">돌담 이야기</h3>
          <p className="intro">{spot.story}</p>
          <div className="kind-note" style={{ '--kc': kind?.color }}>
            <KindBadge kind={kind} className="mb-2" />
            <div>{kind?.text}</div>
          </div>
          {slots[0] && (
            <div className="mini-weather mt-3">
              <i className="bi bi-cloud-sun" /> {slots[0].temp}° {slots[0].sky} · 바람 {fit?.wind}m/s · 비 {fit?.pop}%
              {dust && <> · 미세먼지 {dust.grade}{dust.estimated ? ' (추정)' : ''}</>}
            </div>
          )}
        </Col>
        <Col lg={5}>
          <h3 className="section-title">걸을 때 팁</h3>
          <div className="tip-box">
            <div>{kind?.tip}</div>
            {fit && fit.wind >= 6 && <div className="mt-2"><b>오늘은 바람이 {fit.wind}m/s로 센 편이에요.</b> 모자와 가벼운 소지품은 단단히 챙기세요.</div>}
            {data.tabs['39']?.[0] && <div className="mt-2">가까운 식당: <b>{data.tabs['39'][0].title}</b> ({data.tabs['39'][0].dist}m)</div>}
          </div>
        </Col>
      </Row>

      {spot.kind === 'park' && <Exhibitions />}

      {spot.hasTrack && (
        <>
          <h3 className="section-title">고도 프로필<small>{spot.path[0].length === 3 ? '경로 파일에 든 실측 고도예요' : '고도 API(Copernicus DEM 90m) 기준의 대략적인 높낮이예요'} · 마우스를 올려 보기</small></h3>
          {prof ? <ElevationChart prof={prof} /> : prof === null ? <Loading text="고도를 불러오는 중..." /> : <ErrorAlert error={`고도를 불러오지 못했어요 (${profError})`} />}
        </>
      )}

      {guide.length > 0 && (
        <>
          <h3 className="section-title">구간별 안내<small>무장애여행정보 · 휠체어와 유모차가 지나갈 수 있는지 조사한 내용</small></h3>
          <ol className="guide-steps">
            {guide.map((g, i) => (
              <li key={i}>
                <b>{g.name}</b>
                {(g.detail || g.desc) && <span> — {g.detail || g.desc}</span>}
                {g.access && <div className="warn-line"><i className="bi bi-exclamation-triangle me-1" />{g.access}</div>}
              </li>
            ))}
          </ol>
        </>
      )}

      {spot.facilities?.length > 0 && (
        <>
          <h3 className="section-title">주변 시설<small>관광지주변정보 (2020-12-30)</small></h3>
          <div className="panel p-0 table-wrap">
            <table className="table table-sm align-middle mb-0">
              <thead><tr><th>종류</th><th>이름</th><th>거리</th><th>이용 정보</th></tr></thead>
              <tbody>
                {spot.facilities.map((f, i) => (
                  <tr key={i}><td>{f.type}</td><td>{f.name}</td><td>{f.radius}m</td><td>{f.info}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      <FindPlace title="찾아가기" spot={spot} />

      {spot.hasTrack && galleryEl}

      <ErrorAlert error={data.error} />
      <Tabs activeKey={tab} onSelect={(k) => setTab(k)} className="place-tabs mt-4">
        {TABS.map(([t, label]) => (
          <Tab key={t} eventKey={t} title={label}>
            {t === '32' && <div className="small text-muted mt-3">한국관광공사에 등록된 숙박만 보여요. 숙박은 드물어서 반경 20km 안까지 찾았어요.</div>}
            {data.loading ? <Loading /> : (data.tabs[t] ?? []).length === 0 ? <Empty text="근처 정보가 없어요" /> : (
              <>
                <div className="mt-3"><SpotMap spot={spot} kind={kind} places={data.tabs[t]} /></div>
                <Row xs={1} sm={2} lg={3} className="g-3 mt-1">
                  {data.tabs[t].map((p, i) => (
                    <Col key={p.id}>
                      <div className="place-card position-relative">
                        {p.image ? <img src={p.image} alt={p.title} loading="lazy" /> : <div className="noimg"><i className="bi bi-image" /></div>}
                        <span className="place-num">{i + 1}</span>
                        <div className="body">
                          <a className="t stretched-link" href={kakaoPin(p.title, p.lat, p.lng)} target="_blank" rel="noreferrer">{p.title}</a>
                          <div className="a">{p.addr}</div>
                          <div className="d">{spot.name}에서 {p.dist >= 1000 ? `${(p.dist / 1000).toFixed(1)}km` : `${p.dist}m`}</div>
                          <div className="go">
                            <span><i className="bi bi-geo-alt-fill" /> 카카오맵으로 열기</span>
                          </div>
                        </div>
                      </div>
                    </Col>
                  ))}
                </Row>
              </>
            )}
          </Tab>
        ))}
      </Tabs>

      <div className="pager">
        {prev ? <Link to={`/spots/${prev.id}`}><i className="bi bi-arrow-left" /> {prev.name}</Link> : <span />}
        {next ? <Link to={`/spots/${next.id}`}>{next.name} <i className="bi bi-arrow-right" /></Link> : <span />}
      </div>
    </>
  )
}
