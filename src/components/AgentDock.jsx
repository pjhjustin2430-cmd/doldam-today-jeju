import { useEffect, useRef, useState } from 'react'
import { Spinner } from 'react-bootstrap'
import { useAppStore } from '../store/useAppStore'

// 오른쪽에 붙는 돌담지기 대화창: 어느 화면에서든 열어 두고 물어볼 수 있다.
// AI 가 질문에 맞는 도구(공공 API)를 스스로 골라 부르고, 답 위에 어떤 도구를 썼는지 보여준다.
const TOOLS = {
  search_doldam_spots: { label: '돌담 명소 검색', src: '제주 무장애여행정보 · 직접 정리', icon: 'search' },
  get_spot_detail: { label: '명소 상세·접근성', src: '무장애여행정보 CSV', icon: 'universal-access' },
  get_weather: { label: '날씨', src: '기상청 단기예보', icon: 'cloud-sun' },
  get_air_quality: { label: '미세먼지', src: '에어코리아 (막히면 Open-Meteo 추정)', icon: 'wind' },
  find_nearby_places: { label: '주변 장소', src: '한국관광공사 TourAPI', icon: 'geo-alt' },
  get_stonepark_exhibitions: { label: '돌문화공원 전시', src: '제주특별자치도청 오픈API', icon: 'easel' },
}
const ARG_LABEL = { kind: '종류', keyword: '검색어', accessibleOnly: '무장애만', spotId: '명소', place: '지역', contentTypeId: '유형', status: '상태', limit: '건수', day: '날짜' }
const VALUE = { tomorrow: '내일', today: '오늘' }
const EXAMPLES = [
  { icon: 'wind', q: '오늘 바람 센데 갈 만한 돌담 어디야?' },
  { icon: 'universal-access', q: '휠체어로 걸을 수 있는 돌담길 알려줘' },
  { icon: 'cloud-rain', q: '내일 비 오면 돌문화공원 괜찮아?' },
  { icon: 'geo-alt', q: '별방진 근처에 점심 먹을 곳 있어?' },
]
const argText = (args = {}) => Object.entries(args).map(([k, v]) => `${ARG_LABEL[k] ?? k}: ${VALUE[v] ?? v}`).join(' · ')
// 모델이 **굵게** 를 섞어 보내도 별표 대신 굵은 글씨로 (HTML 은 쓰지 않아 안전하다)
const Rich = ({ text }) => text.split(/\*\*(.+?)\*\*/g).map((part, i) => (i % 2 ? <b key={i}>{part}</b> : part))

export default function AgentDock() {
  const open = useAppStore((s) => s.agentOpen)
  const setOpen = useAppStore((s) => s.setAgentOpen)
  const messages = useAppStore((s) => s.messages)
  const loading = useAppStore((s) => s.chatLoading)
  const sendMessage = useAppStore((s) => s.sendMessage)
  const clearChat = useAppStore((s) => s.clearChat)
  const loadChat = useAppStore((s) => s.loadChat)
  const restored = useAppStore((s) => s.restored)
  const nickname = useAppStore((s) => s.nickname)
  const [input, setInput] = useState('')
  useEffect(() => { if (open) loadChat() }, [open, nickname, loadChat]) // 열 때(닉네임이 바뀔 때도) 저장된 대화를 불러온다
  const end = useRef(null)
  const field = useRef(null)
  useEffect(() => { end.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }) }, [messages, loading, open])
  useEffect(() => { if (open) field.current?.focus({ preventScroll: true }) }, [open])

  function send(text) {
    if (!text.trim() || loading) return
    sendMessage(text.trim())
    setInput('')
  }

  if (!open) {
    return (
      <button type="button" className="dock-fab" onClick={() => setOpen(true)} aria-label="돌담지기 대화창 열기">
        <i className="bi bi-chat-dots" />돌담지기에게 묻기
      </button>
    )
  }

  return (
    <aside className="agent-dock" aria-label="돌담지기 대화창">
      <header className="dock-head">
        <span className="dock-mark"><i className="bi bi-bricks" /></span>
        <div className="flex-grow-1">
          <b>돌담지기</b>
          <small>AI가 공공 API를 골라 불러 답해요</small>
        </div>
        {messages.length > 0 && <button type="button" className="dock-icon" onClick={clearChat} title="대화 지우기 (저장된 기록도 함께 지워요)" aria-label="대화 지우기"><i className="bi bi-arrow-counterclockwise" /></button>}
        <button type="button" className="dock-icon" onClick={() => setOpen(false)} title="닫기" aria-label="대화창 닫기"><i className="bi bi-x-lg" /></button>
      </header>

      <div className="dock-body" aria-live="polite">
        {messages.length === 0 && (
          <>
            <div className="dock-hello">오늘 날씨와 제주 돌담 정보를 보고 갈 만한 곳을 골라 드려요. 이렇게 물어보세요.</div>
            <div className="dock-examples">
              {EXAMPLES.map((e) => (
                <button key={e.q} type="button" onClick={() => send(e.q)}><i className={`bi bi-${e.icon}`} />{e.q}</button>
              ))}
            </div>
            <details className="dock-tools">
              <summary>돌담지기가 쓰는 도구 6개</summary>
              <ul>{Object.entries(TOOLS).map(([k, t]) => <li key={k}><i className={`bi bi-${t.icon}`} /><b>{t.label}</b><span>{t.src}</span></li>)}</ul>
            </details>
          </>
        )}
        {restored > 0 && <div className="dock-saved"><i className="bi bi-clock-history" /> 이전 대화 {restored}개를 불러왔어요 · 대화는 Supabase에 저장돼요</div>}
        {messages.map((m, i) => (
          <div key={i} className={`msg ${m.role} ${m.error ? 'error' : ''}`}>
            {m.steps?.length > 0 && (
              <ol className="agent-steps" aria-label="호출한 도구">
                {m.steps.map((s, j) => {
                  const t = TOOLS[s.tool]
                  return (
                    <li key={j} className={s.error ? 'bad' : ''}>
                      <i className={`bi bi-${t?.icon ?? 'tools'}`} />
                      <span><b>{t?.label ?? s.tool}</b>{argText(s.args) && <span className="args"> ({argText(s.args)})</span>}</span>
                      <span className="res">{s.error ? `오류: ${s.error}` : `${s.count}건`}</span>
                    </li>
                  )
                })}
              </ol>
            )}
            <div style={{ whiteSpace: 'pre-wrap' }}>{m.error && <i className="bi bi-exclamation-triangle me-1" />}<Rich text={m.text} /></div>
            {m.error && <button type="button" className="btn btn-sm btn-outline-danger mt-2" disabled={loading} onClick={() => send(m.retry)}><i className="bi bi-arrow-repeat me-1" />다시 시도</button>}
          </div>
        ))}
        {loading && <div className="msg assistant thinking"><Spinner size="sm" className="me-2" />도구를 고르고 호출하는 중...</div>}
        <div ref={end} />
      </div>

      <form className="dock-input" onSubmit={(e) => { e.preventDefault(); send(input) }}>
        <input ref={field} className="form-control" value={input} maxLength={500} onChange={(e) => setInput(e.target.value)}
          placeholder="예: 구좌 쪽 걷기 좋은 밭담 알려줘" aria-label="돌담지기에게 질문" />
        <button type="submit" className="btn btn-primary" disabled={loading || !input.trim()} aria-label="보내기"><i className="bi bi-send" /></button>
      </form>
    </aside>
  )
}
