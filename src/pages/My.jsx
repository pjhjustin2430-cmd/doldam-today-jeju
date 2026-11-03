import { useEffect, useMemo } from 'react'
import { Col, Form, ProgressBar, Row } from 'react-bootstrap'
import { Link } from 'react-router-dom'
import PageHeader from '../components/PageHeader'
import ItemCard from '../components/ItemCard'
import StoneFillWall from '../components/StoneFillWall'
import { Empty, Loading } from '../components/Status'
import { buildWall, drawWall, paintWall } from '../lib/stoneWall'
import { usePageTitle } from '../lib/usePageTitle'
import { useAppStore } from '../store/useAppStore'

const LEVELS = [[0, '첫 돌을 기다려요'], [1, '돌 줍는 여행자'], [4, '담 쌓는 견습생'], [8, '돌담 숙련자'], [14, '돌담 장인']]
const levelOf = (n) => [...LEVELS].reverse().find(([min]) => n >= min)[1]

// 내 돌담 수첩: 도장을 찍은 곳은 돌벽의 빈 구멍이 돌로 채워지고, 아래에 도장 카드가 쌓인다
export default function My() {
  usePageTitle('내 돌담 수첩')
  const { nickname, setNickname, favorites, favLoading, loadFavorites, removeFavorite, spots, kinds, loadSpots } = useAppStore()
  useEffect(() => { loadFavorites() }, [nickname, loadFavorites])
  useEffect(() => { loadSpots() }, [loadSpots])
  const visited = useMemo(() => new Set(favorites.map((f) => f.item_id)), [favorites])
  const todo = spots.filter((s) => !visited.has(s.id))
  const n = visited.size
  const me = nickname || '익명'
  const colorOf = (s) => kinds.find((x) => x.id === s.kind)?.color

  // 공유용 이미지: 돌벽 위에 닉네임·진행 상황을 얹어 PNG 로 저장
  function save() {
    const c = document.createElement('canvas')
    c.width = 1200; c.height = 630
    const g = c.getContext('2d')
    g.fillStyle = '#14263f'; g.fillRect(0, 0, 1200, 630)
    drawWall(g, paintWall(buildWall(spots.length), spots, kinds, visited), 0, 0, 1200, 600)
    g.fillStyle = 'rgba(20,38,63,.88)'; g.fillRect(0, 430, 1200, 200)
    const F = "'Malgun Gothic','Pretendard',sans-serif"
    g.fillStyle = '#ffffff'; g.font = `800 56px ${F}`; g.fillText(`${me}의 돌담`, 48, 508)
    g.fillStyle = '#ff9a8c'; g.font = `700 30px ${F}`; g.fillText(`${n} / ${spots.length}곳 · ${levelOf(n)}`, 50, 560)
    g.fillStyle = '#9fb3c8'; g.font = `400 24px ${F}`; g.textAlign = 'right'
    g.fillText('돌담 오늘 · doldam-today-jeju-project.vercel.app', 1152, 580)
    c.toBlob((b) => {
      const a = document.createElement('a')
      a.href = URL.createObjectURL(b); a.download = '내-돌담.png'; a.click()
      setTimeout(() => URL.revokeObjectURL(a.href), 1000)
    })
  }

  return (
    <>
      <PageHeader icon="patch-check" title="내 돌담 수첩" subtitle={`다녀올 때마다 돌벽이 채워져요 · 도장 ${favorites.length}개 · Supabase에 저장되어 새로고침해도 남아요`} />
      <Form.Control className="mb-3" style={{ maxWidth: 320 }} placeholder="닉네임 (비우면 '익명')" aria-label="닉네임"
        value={nickname} onChange={(e) => setNickname(e.target.value)} />

      {spots.length > 0 && (
        <>
          <div className="wind-card">
            <StoneFillWall spots={spots} kinds={kinds} visited={visited} />
            <div className="wind-controls">
              <button type="button" className="tool-btn on" onClick={save}><i className="bi bi-download" />이미지로 저장</button>
            </div>
          </div>
          <div className="mywall-status">
            <div><b>{n}</b> / {spots.length}곳 <span className="level">{levelOf(n)}</span></div>
            <ProgressBar now={(n / spots.length) * 100} className="stone-progress" aria-label="다녀온 비율" />
          </div>
          <ol className="hm-list mb-4">
            {spots.map((s, i) => (
              <li key={s.id}>
                <Link to={`/spots/${s.id}`} className={`wall-chip ${visited.has(s.id) ? 'on' : ''}`} style={{ '--kc': colorOf(s) }}>
                  <span className="hm-no" style={{ '--kc': visited.has(s.id) ? colorOf(s) : '#9aa4a8' }}>{i + 1}</span>{s.label ?? s.name}
                </Link>
              </li>
            ))}
          </ol>
        </>
      )}

      <h3 className="section-title">내 도장<small>찍은 곳</small></h3>
      {favLoading ? <Loading /> : favorites.length === 0 ? <Empty text="아직 찍은 도장이 없어요. 아래에서 가고 싶은 돌담을 골라 보세요." /> : (
        <Row xs={1} sm={2} lg={3} className="g-3">
          {favorites.map((f) => {
            const sp = spots.find((x) => x.id === f.item_id)
            return (
              <Col key={f.id}>
                <ItemCard title={f.title} badge="다녀옴" photo={sp?.photos?.[0]} color={sp ? colorOf(sp) : undefined} subtitle={new Date(f.created_at).toLocaleDateString('ko-KR')}
                  onRemove={() => removeFavorite(f.id)} />
              </Col>
            )
          })}
        </Row>
      )}

      {todo.length > 0 && (
        <>
          <h3 className="section-title">아직 안 가 본 곳<small>{todo.length}곳 · 누르면 상세로 가요</small></h3>
          <Row xs={2} md={3} lg={4} className="g-3">
            {todo.map((s) => {
              const k = kinds.find((x) => x.id === s.kind)
              return (
                <Col key={s.id}>
                  <Link to={`/spots/${s.id}`} className="todo-card" style={{ '--kc': k?.color }}>
                    {s.photos?.[0]
                      ? <span className="todo-photo" role="img" aria-label={s.photos[0].caption} style={{ backgroundImage: `url(${s.photos[0].src})` }} />
                      : <i className={`bi bi-${k?.icon ?? 'bricks'}`} />}
                    <b>{s.name}</b>
                    <span>{k?.name}</span>
                  </Link>
                </Col>
              )
            })}
          </Row>
        </>
      )}
    </>
  )
}
