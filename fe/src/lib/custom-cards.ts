export const CUSTOM_CARD_SLOT_COUNT = 9
export const CUSTOM_CARD_COUNT_MAX = 9
export const CUSTOM_CARD_TEXT_MAX = 1
export const CUSTOM_CARD_CONTENT_MAX = 20000

export type CustomCard = {
  id: string
  content: string
  text: string
  textColor: string
  backgroundColor: string
}

export type CustomCardSlot = {
  id: string
  cardId: string | null
}

export type CustomCards = {
  slots: CustomCardSlot[]
  cards: CustomCard[]
}

export const CUSTOM_CARD_COLORS: Array<[background: string, text: string]> = [
  ['#dbeafe', '#1e3a8a'],
  ['#dcfce7', '#166534'],
  ['#fef3c7', '#92400e'],
  ['#fce7f3', '#9d174d'],
  ['#ede9fe', '#5b21b6'],
  ['#cffafe', '#155e75'],
  ['#ffedd5', '#9a3412'],
  ['#f3e8ff', '#6b21a8'],
  ['#f1f5f9', '#334155'],
]

export function createDefaultCustomCards(): CustomCards {
  return {
    slots: Array.from({ length: CUSTOM_CARD_SLOT_COUNT }, (_, index) => ({
      id: `slot-${index + 1}`,
      cardId: null,
    })),
    cards: [],
  }
}

export function readSingleText(value: string): string {
  return [...value].slice(0, CUSTOM_CARD_TEXT_MAX).join('')
}
