// Google Gemini(무료 API 키) 로 돌담지기를 돌리는 경로 — Claude 키가 없거나 막혀 있을 때 쓴다.
// 도구(함수) 호출 방식은 Claude 와 같다: 모델이 함수를 고르면 우리 서버가 실행해서 결과를 돌려주고, 최종 답이 나올 때까지 반복한다.
const BASE = process.env.GEMINI_API_BASE || 'https://generativelanguage.googleapis.com/v1beta'
export const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite' // 2.5 모델은 새 사용자에게 막혀 있다(Google 문서 확인). 답이 아쉬우면 gemini-3.8-flash 로

// Claude 도구 정의(input_schema)를 Gemini 함수 선언으로 바꾼다. 인자가 없는 도구는 parameters 를 생략해야 한다.
const declarations = (tools) => tools.map((t) => {
  const props = t.input_schema?.properties ?? {}
  const decl = { name: t.name, description: t.description }
  if (Object.keys(props).length) {
    decl.parameters = {
      type: 'object',
      properties: Object.fromEntries(Object.entries(props).map(([k, v]) => [k, {
        type: v.type, description: v.description, ...(v.enum ? { enum: v.enum } : {}),
      }])),
      ...(t.input_schema.required?.length ? { required: t.input_schema.required } : {}),
    }
  }
  return decl
})

async function generate(body) {
  const r = await fetch(`${BASE}/models/${GEMINI_MODEL}:generateContent`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': process.env.GEMINI_API_KEY }, body: JSON.stringify(body),
  })
  const data = await r.json().catch(() => ({}))
  if (!r.ok) {
    const e = new Error(data?.error?.message ?? `Gemini ${r.status}`)
    e.status = r.status
    throw e
  }
  return data
}

export async function askGemini({ system, tools, runTool, message, history = [] }) {
  const contents = [
    ...history.slice(-10).map((m) => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: String(m.content) }] })),
    { role: 'user', parts: [{ text: message }] },
  ]
  const steps = []
  for (let turn = 0; turn < 6; turn++) {
    const data = await generate({
      systemInstruction: { parts: [{ text: system }] }, contents,
      tools: [{ functionDeclarations: declarations(tools) }],
      generationConfig: { maxOutputTokens: 1024 },
    })
    const cand = data.candidates?.[0]
    const parts = cand?.content?.parts ?? []
    const calls = parts.filter((p) => p.functionCall)
    if (!calls.length) {
      const answer = parts.map((p) => p.text ?? '').join('').trim()
      if (!answer) throw new Error(data.promptFeedback?.blockReason ? `차단됨: ${data.promptFeedback.blockReason}` : '빈 응답')
      return { answer, steps }
    }
    contents.push({ role: 'model', parts }) // 함수 호출 파트를 그대로 돌려줘야 다음 차례에서 이어진다
    const responses = []
    for (const { functionCall: fc } of calls) {
      let result
      try { result = await runTool[fc.name](fc.args ?? {}) }
      catch (e) { result = { error: e.message } }
      steps.push({ tool: fc.name, args: fc.args ?? {}, count: Array.isArray(result) ? result.length : result?.error ? 0 : 1, error: result?.error })
      responses.push({ functionResponse: { name: fc.name, response: result?.error ? { error: result.error } : { result } } })
    }
    contents.push({ role: 'user', parts: responses })
  }
  return { answer: '도구 호출이 너무 많아 중단했어요. 질문을 좁혀 주세요.', steps }
}

// Gemini 오류를 사람이 읽을 수 있는 말로
export function friendlyGemini(e) {
  const msg = String(e?.message ?? '')
  if (e?.status === 400 && /api key/i.test(msg)) return 'Gemini API 키가 올바르지 않아요. Vercel 환경변수 GEMINI_API_KEY 를 확인해 주세요.'
  if (e?.status === 403 || e?.status === 401) return 'Gemini API 키를 쓸 수 없어요. 키와 사용 설정을 확인해 주세요.'
  if (e?.status === 429) return 'Gemini 무료 사용량을 잠시 넘었어요. 1분 뒤 다시 시도해 주세요.'
  if (e?.status === 503 || /overloaded|unavailable/i.test(msg)) return 'Gemini 서버가 붐벼요. 잠시 뒤 다시 시도해 주세요.'
  return '돌담지기가 답하지 못했어요. 잠시 뒤 다시 시도해 주세요.'
}
