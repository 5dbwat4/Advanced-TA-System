import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type BasketQuestion = {
  id: string
  question: string
  answer: string
  /** 命题人显示名 */
  author?: string
  tags?: { id: string; name: string }[]
}

type QuestionBasketState = {
  items: BasketQuestion[]
  add: (question: BasketQuestion) => void
  remove: (id: string) => void
  toggle: (question: BasketQuestion) => void
  update: (question: BasketQuestion) => void
  clear: () => void
}

export const useQuestionBasket = create<QuestionBasketState>()(
  persist(
    (set) => ({
      items: [],
      add: (question) =>
        set((state) =>
          state.items.some((item) => item.id === question.id)
            ? state
            : { items: [...state.items, question] },
        ),
      remove: (id) =>
        set((state) => ({ items: state.items.filter((item) => item.id !== id) })),
      toggle: (question) =>
        set((state) =>
          state.items.some((item) => item.id === question.id)
            ? { items: state.items.filter((item) => item.id !== question.id) }
            : { items: [...state.items, question] },
        ),
      update: (question) =>
        set((state) => ({
          items: state.items.map((item) =>
            item.id === question.id ? { ...item, ...question } : item,
          ),
        })),
      clear: () => set({ items: [] }),
    }),
    {
      name: 'tasaas.question-basket',
      partialize: (state) => ({ items: state.items }),
    },
  ),
)
