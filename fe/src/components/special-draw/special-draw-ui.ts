import { SPECIAL_DRAW_FLAG_COUNT, type SpecialDrawNodeType } from '@/lib/special-draw'

export const END_VALUE = '__end__'
export const FLAG_OPTIONS = Array.from({ length: SPECIAL_DRAW_FLAG_COUNT }, (_, index) => index)
export const NODE_TYPE_LABEL: Record<SpecialDrawNodeType, string> = {
  start: '开始',
  draw: '抽题',
  ratio: '抽取比例',
  count: '数量条件',
  flag: 'Flag 条件',
  setFlag: '设置 Flag',
  toggleFlag: '翻转 Flag',
  end: '结束',
}
