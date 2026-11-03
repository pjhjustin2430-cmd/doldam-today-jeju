import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { supabase } from '../lib/supabase'
import { askAgent, fetchSpots } from '../api/client'

const NEED_DB = 'Supabase 설정(.env.local)이 필요해요'
const SOURCE = 'doldam' // favorites 테이블에서 돌담 수첩 기록을 구분하는 값
const CHAT = 'doldam-chat' // 같은 테이블에서 돌담지기 대화 기록을 구분하는 값 (title = 질문, item_id = {답변, 호출 내역} JSON)
const CHAT_KEEP = 40 // 불러올 최근 질문 수

// 여러 페이지가 함께 쓰는 상태: 닉네임, 알림, 돌담 명소·종류, 선택 명소, 돌담 수첩(Supabase), 에이전트 대화
export const useAppStore = create(
  persist(
    (set, get) => ({
      nickname: '',
      setNickname: (nickname) => {
        const next = nickname.trim()
        if (next !== get().nickname) set({ nickname: next, messages: [], chatFor: null, restored: 0 }) // 닉네임이 바뀌면 그 사람의 대화를 다시 불러온다
        else set({ nickname: next })
      },
      me: () => get().nickname || '익명',
      // 닉네임이 없을 때도 다른 사람과 대화 기록이 섞이지 않도록, 이 브라우저만의 번호를 붙인다
      deviceId: Math.random().toString(36).slice(2, 8),
      chatKey: () => get().nickname || `익명-${get().deviceId}`,

      toasts: [],
      toast: (message, variant = 'success') => {
        const id = Date.now() + Math.random()
        set({ toasts: [...get().toasts, { id, message, variant }] })
        setTimeout(() => set({ toasts: get().toasts.filter((t) => t.id !== id) }), 2500)
      },

      // 돌담 명소·종류 (지도, 목록, 상세 화면이 같이 쓴다)
      spots: [],
      kinds: [],
      spotsLoading: false,
      spotsError: '',
      loadSpots: async () => {
        if (get().spots.length || get().spotsLoading) return
        set({ spotsLoading: true, spotsError: '' })
        try {
          const { spots, kinds } = await fetchSpots()
          set({ spots, kinds, spotsLoading: false })
        } catch (e) { set({ spotsLoading: false, spotsError: e.message }) }
      },

      // 돌담 수첩 — Supabase favorites 테이블 (source = 'doldam')
      favorites: [],
      favLoading: false,
      loadFavorites: async () => {
        if (!supabase) return get().toast(NEED_DB, 'warning')
        set({ favLoading: true })
        const { data, error } = await supabase.from('favorites').select('*')
          .eq('nickname', get().me()).eq('source', SOURCE).order('created_at', { ascending: false })
        set({ favLoading: false })
        if (error) return get().toast(error.message, 'danger')
        set({ favorites: data })
      },
      stamp: async (spot) => {
        if (!supabase) return get().toast(NEED_DB, 'warning')
        if (get().favorites.some((f) => f.item_id === spot.id)) return get().toast('이미 도장을 찍은 곳이에요', 'info')
        const { data, error } = await supabase.from('favorites')
          .insert({ nickname: get().me(), source: SOURCE, item_id: spot.id, title: spot.name }).select().single()
        if (error) return get().toast(error.message, 'danger')
        set({ favorites: [data, ...get().favorites] })
        get().toast('돌담 도장을 찍었어요')
      },
      removeFavorite: async (id) => {
        if (!supabase) return get().toast(NEED_DB, 'warning')
        const { error } = await supabase.from('favorites').delete().eq('id', id)
        if (error) return get().toast(error.message, 'danger')
        set({ favorites: get().favorites.filter((f) => f.id !== id) })
      },

      // 오른쪽 아래 돌담지기 팝업 (기본은 닫힘)
      agentOpen: false,
      setAgentOpen: (agentOpen) => set({ agentOpen }),

      messages: [],
      chatLoading: false,
      chatFor: null, // 어느 대화 키의 기록을 불러왔는지
      restored: 0, // 저장돼 있다가 불러온 질문 수
      // 돌담지기 대화 기록: Supabase favorites(source = 'doldam-chat')에서 이 사람의 최근 대화를 불러온다
      loadChat: async () => {
        if (!supabase) return
        const key = get().chatKey()
        if (get().chatFor === key) return
        set({ chatFor: key })
        const { data, error } = await supabase.from('favorites').select('title,item_id,created_at')
          .eq('nickname', key).eq('source', CHAT).order('created_at', { ascending: false }).limit(CHAT_KEEP)
        if (error || !data?.length) return
        const restored = data.reverse().flatMap((r) => {
          let saved = {}
          try { saved = JSON.parse(r.item_id) } catch { /* 형식이 다르면 질문만 보여 준다 */ }
          return [{ role: 'user', text: r.title }, { role: 'assistant', text: saved.a ?? '(저장된 답변을 읽지 못했어요)', steps: saved.steps ?? [] }]
        })
        set({ messages: [...restored, ...get().messages], restored: data.length })
      },
      sendMessage: async (text) => {
        // 오류 말풍선은 대화 맥락에 넣지 않는다
        let shown = get().messages.filter((m) => !m.error)
        const last = shown[shown.length - 1]
        if (last?.role === 'user' && last.text === text) shown = shown.slice(0, -1) // 다시 시도: 실패한 같은 질문은 한 번만 보이게
        const history = shown.map((m) => ({ role: m.role, content: m.text }))
        set({ messages: [...shown, { role: 'user', text }], chatLoading: true })
        try {
          const { answer, steps } = await askAgent(text, history)
          set({ messages: [...get().messages, { role: 'assistant', text: answer, steps }] })
          if (supabase) { // 저장 실패가 대화를 막지 않도록 조용히 처리
            supabase.from('favorites').insert({ nickname: get().chatKey(), source: CHAT, title: text, item_id: JSON.stringify({ a: answer, steps: steps ?? [] }) })
              .then(({ error }) => { if (error) console.warn('대화 기록 저장 실패:', error.message) })
          }
        } catch (e) {
          // 실패해도 대화에 남겨 두고 "다시 시도" 버튼을 보여준다
          set({ messages: [...get().messages, { role: 'assistant', error: true, text: e.message, retry: text }] })
        } finally {
          set({ chatLoading: false })
        }
      },
      // 대화를 지우면 Supabase 에 저장된 이 사람의 대화 기록도 함께 지운다
      clearChat: async () => {
        set({ messages: [], restored: 0 })
        if (!supabase) return
        const { error } = await supabase.from('favorites').delete().eq('nickname', get().chatKey()).eq('source', CHAT)
        if (error) get().toast('저장된 대화를 지우지 못했어요', 'warning')
      },
    }),
    { name: 'doldam-store', partialize: (s) => ({ nickname: s.nickname, deviceId: s.deviceId }) },
  ),
)
