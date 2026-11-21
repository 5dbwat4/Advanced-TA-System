import type { Experiment, FocusStudent } from '@/lib/api'
import { downloadMarkdown } from '@/lib/download'
import { SCORE_TYPES, scoreKey } from '@/lib/scores'
import { focusStatus } from '@/components/focus-students/types'

type ExcelJSModule = typeof import('exceljs')

export type FocusStudentsExportFormat = 'xlsx' | 'markdown'

export type FocusStudentsExportData = {
  baseName: string
  className: string
  columns: string[]
  rows: string[][]
}

async function loadExcelJS(): Promise<ExcelJSModule> {
  const mod = (await import('exceljs')) as unknown as { default?: ExcelJSModule } & ExcelJSModule
  return mod.default ?? mod
}

function sanitizeFilename(name: string): string {
  return name.replace(/[\\/:*?"<>|]/g, '_')
}

function markdownCell(value: string): string {
  return value.replace(/\|/g, '\\|').replace(/\r?\n/g, ' ')
}

export function buildFocusStudentsExportData(input: {
  className: string
  hasScoreCols: boolean
  experiments: Experiment[]
  scores: Map<string, number>
  students: FocusStudent[]
}): FocusStudentsExportData {
  const { className, hasScoreCols, experiments, scores, students } = input
  const columns = ['姓名', '学号', '重点关注原因', '当前状态']
  if (hasScoreCols) {
    for (const experiment of experiments) {
      for (const type of SCORE_TYPES) {
        columns.push(`${experiment.mark} · ${experiment.title} ${type.label}`)
      }
    }
  }

  const rows = students.map((item) => {
    const status = focusStatus()
    const base = [
      item.student?.name ?? '',
      item.student?.studentId ?? '',
      item.reason ?? '',
      status.label,
    ]
    if (!hasScoreCols) return base
    const scoreCells = experiments.flatMap((experiment) =>
      SCORE_TYPES.map((type) => {
        const value = scores.get(scoreKey(item.userId, type.value, experiment.id))
        return value == null ? '' : String(value)
      }),
    )
    return [...base, ...scoreCells]
  })

  return {
    baseName: `${sanitizeFilename(className || '课程')}-重点关注学生`,
    className,
    columns,
    rows,
  }
}

function buildMarkdown(data: FocusStudentsExportData): string {
  const { className, columns, rows } = data
  const header = `| ${columns.map(markdownCell).join(' | ')} |`
  const separator = `| ${columns.map(() => '---').join(' | ')} |`
  const body = rows.map((row) => `| ${row.map((cell) => markdownCell(cell)).join(' | ')} |`)
  const lines = [...body]
  if (lines.length === 0) lines.push(`| ${columns.map(() => '—').join(' | ')} |`)
  return [
    `# ${className || '课程'} · 重点关注学生名单`,
    '',
    header,
    separator,
    ...lines,
    '',
  ].join('\n')
}

async function exportXlsx(data: FocusStudentsExportData): Promise<void> {
  const ExcelJS = await loadExcelJS()
  const workbook = new ExcelJS.Workbook()
  const sheet = workbook.addWorksheet('重点关注学生')
  const header = sheet.addRow(data.columns)
  header.font = { bold: true }
  for (const row of data.rows) sheet.addRow(row)
  data.columns.forEach((name, index) => {
    const contentWidth = Math.max(
      ...data.rows.map((row) => [...(row[index] ?? '')].length),
      [...name].length,
    )
    sheet.getColumn(index + 1).width = Math.min(Math.max(contentWidth + 4, 12), 48)
  })

  const buffer = await workbook.xlsx.writeBuffer()
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `${data.baseName}.xlsx`
  link.click()
  URL.revokeObjectURL(url)
}

export async function exportFocusStudents(
  format: FocusStudentsExportFormat,
  data: FocusStudentsExportData,
): Promise<void> {
  if (format === 'markdown') {
    downloadMarkdown(`${data.baseName}.md`, buildMarkdown(data))
  } else {
    await exportXlsx(data)
  }
}
