export type FocusStudentsViewTab = 'basic' | 'scores' | 'actions' | 'all'

export type FocusStudentOption = { id: string; name: string; studentId: string }

export type FocusStatus = {
  label: '正常' | '有挂科风险'
  tooltip: string
  color: 'success' | 'danger'
}

export function focusStatus(): FocusStatus {
  // TODO: 挂科风险判定见 TODO.md（未实现）
  return { label: '正常', tooltip: '一切正常', color: 'success' }
}
