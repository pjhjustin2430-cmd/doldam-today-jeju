import { memo } from '../server/cache.js'

// 키가 실제로 쓸 수 있는지: 모델 목록 조회(토큰을 쓰지 않음)로 확인하고 10분 동안 기억한다
const claudeWorks = () => memo('claude-key', 10 * 60e3, async () => {
  const r = await fetch('https://api.anthropic.com/v1/models?limit=1', {
    headers: { 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
  })
  return r.ok
})
const geminiWorks = () => memo('gemini-key', 10 * 60e3, async () => {
  const r = await fetch('https://generativelanguage.googleapis.com/v1beta/models?pageSize=1', { headers: { 'x-goog-api-key': process.env.GEMINI_API_KEY } })
  return r.ok
})

// 동작 확인용 — 키 값은 내보내지 않고 "있는지"와 "쓸 수 있는지"만 알려준다
export default async function handler(req, res) {
  const hasClaudeKey = Boolean(process.env.ANTHROPIC_API_KEY)
  const hasGeminiKey = Boolean(process.env.GEMINI_API_KEY)
  let claudeOk = false, geminiOk = false
  if (hasClaudeKey) { try { claudeOk = await claudeWorks() } catch { claudeOk = false } }
  if (hasGeminiKey) { try { geminiOk = await geminiWorks() } catch { geminiOk = false } }
  res.status(200).json({
    ok: true, time: new Date().toISOString(),
    hasDataKey: Boolean(process.env.DATA_GO_KR_KEY),
    hasClaudeKey, claudeOk, hasGeminiKey, geminiOk,
  })
}
