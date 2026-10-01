import { Button, Modal, useOverlayState } from '@heroui/react'
import copyToClipboard from 'copy-to-clipboard'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'

import Bot from '~icons/lucide/bot'
import CircleAlert from '~icons/lucide/circle-alert'
import CircleCheck from '~icons/lucide/circle-check'
import Download from '~icons/lucide/download'
import FileSpreadsheet from '~icons/lucide/file-spreadsheet'
import FileUp from '~icons/lucide/file-up'
import Upload from '~icons/lucide/upload'
import { Card } from '@/components/ui/Card'
import { IconAction } from '@/components/ui/IconAction'
import { PendingButton } from '@/components/ui/PendingButton'
import { importDevBoards, type DevBoardImportResult, type DevBoardImportRow } from '@/lib/api'
import { getErrorMessage } from '@/lib/error'
import { cn } from '@/lib/utils'

type ParseError = { row: number; message: string }

type BulkImportModalProps = {
  classId: string | null
  state: ReturnType<typeof useOverlayState>
  onImported: () => void
}

const TEMPLATE_COLUMNS = ['DB id', 'id', '联系电话', '合用学生学号', '是否已借出']
const TEMPLATE_EXAMPLE = ['DB180BD', '21025306', '18989469811', '3210100001;3210100002', '否']
const TEMPLATE_CSV = `\uFEFF${TEMPLATE_COLUMNS.join(',')}\n${TEMPLATE_EXAMPLE.join(',')}\n`

const IMPORT_PROMPT = [
  '请把下面的开发板信息整理成 CSV 表格数据（只输出 CSV 文本，不要解释或代码块标记），表头固定为：',
  'DB id,id,联系电话,合用学生学号,是否已借出',
  '要求：',
  '1. DB id 必填；id、联系电话可为空；',
  '2. 合用学生学号若有多个，用英文分号 ; 分隔；',
  '3. 是否已借出填「是」或「否」；',
  '4. 一行一块开发板，不要改动表头与列顺序。',
  '原始信息：',
  '',
].join('\n')

const BORROWED_TRUE = new Set(['是', 'y', 'yes', '1', 'true', '已借出', '借出'])

type ExcelJSModule = typeof import('exceljs')

async function loadExcelJS(): Promise<ExcelJSModule> {
  const mod = (await import('exceljs')) as unknown as { default?: ExcelJSModule } & ExcelJSModule
  return mod.default ?? mod
}

function parseCsv(text: string): string[][] {
  const source = text.replace(/^\uFEFF/, '')
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let inQuotes = false

  for (let index = 0; index < source.length; index += 1) {
    const char = source[index]
    if (inQuotes) {
      if (char === '"') {
        if (source[index + 1] === '"') {
          field += '"'
          index += 1
        } else {
          inQuotes = false
        }
      } else {
        field += char
      }
    } else if (char === '"') {
      inQuotes = true
    } else if (char === ',') {
      row.push(field)
      field = ''
    } else if (char === '\n') {
      row.push(field)
      rows.push(row)
      row = []
      field = ''
    } else if (char !== '\r') {
      field += char
    }
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field)
    rows.push(row)
  }
  return rows
}

function splitStudentNos(value: string): string[] {
  return value
    .split(/[;；、\s]+/)
    .map((item) => item.trim())
    .filter((item) => item.length > 0)
}

function parseBorrowed(value: string): boolean {
  return BORROWED_TRUE.has(value.trim().toLowerCase())
}

function rowsFromTable(table: string[][]): { rows: DevBoardImportRow[]; errors: ParseError[] } {
  const rows: DevBoardImportRow[] = []
  const errors: ParseError[] = []

  if (table.length === 0) {
    errors.push({ row: 0, message: '文件为空' })
    return { rows, errors }
  }

  const hasHeader = /^db\s*id$/i.test((table[0][0] ?? '').trim())
  for (let index = hasHeader ? 1 : 0; index < table.length; index += 1) {
    const cells = table[index]
    const sourceRow = index + 1
    const dbId = (cells[0] ?? '').trim()
    if (!dbId) {
      errors.push({ row: sourceRow, message: 'DB id 为空' })
      continue
    }
    rows.push({
      dbId,
      boardId: (cells[1] ?? '').trim() || null,
      phone: (cells[2] ?? '').trim() || null,
      studentNos: splitStudentNos(cells[3] ?? ''),
      borrowed: parseBorrowed(cells[4] ?? ''),
    })
  }

  return { rows, errors }
}

function parseBoardCsv(text: string): { rows: DevBoardImportRow[]; errors: ParseError[] } {
  const table = parseCsv(text).filter((cells) => cells.some((cell) => cell.trim() !== ''))
  return rowsFromTable(table)
}

function cellToString(value: unknown): string {
  if (value == null) return ''
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (value instanceof Date) return value.toISOString()
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>
    if (Array.isArray(record.richText)) {
      return record.richText
        .map((part) => String((part as { text?: unknown }).text ?? ''))
        .join('')
    }
    if (typeof record.text === 'string') return record.text
    if (record.result != null) return cellToString(record.result)
    if (typeof record.hyperlink === 'string') return record.hyperlink
  }
  return String(value)
}

async function parseBoardXlsx(
  buffer: ArrayBuffer,
): Promise<{ rows: DevBoardImportRow[]; errors: ParseError[] }> {
  const ExcelJS = await loadExcelJS()
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(buffer)

  const table: string[][] = []
  workbook.worksheets[0]?.eachRow({ includeEmpty: false }, (row) => {
    const cells: string[] = []
    row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
      cells[colNumber - 1] = cellToString(cell.value)
    })
    table.push(cells)
  })

  return rowsFromTable(table.filter((cells) => cells.some((cell) => cell.trim() !== '')))
}

export function BulkImportModal({ classId, state, onImported }: BulkImportModalProps) {
  const [dragOver, setDragOver] = useState(false)
  const [fileName, setFileName] = useState<string | null>(null)
  const [rows, setRows] = useState<DevBoardImportRow[]>([])
  const [parseErrors, setParseErrors] = useState<ParseError[]>([])
  const [result, setResult] = useState<DevBoardImportResult | null>(null)
  const [importing, setImporting] = useState(false)

  useEffect(() => {
    if (!state.isOpen) return
    setDragOver(false)
    setFileName(null)
    setRows([])
    setParseErrors([])
    setResult(null)
    setImporting(false)
  }, [state.isOpen])

  const handleFile = async (file: File) => {
    setFileName(file.name)
    setResult(null)
    try {
      const parsed = file.name.toLowerCase().endsWith('.xlsx')
        ? await parseBoardXlsx(await file.arrayBuffer())
        : parseBoardCsv(await file.text())
      setRows(parsed.rows)
      setParseErrors(parsed.errors)
    } catch {
      setRows([])
      setParseErrors([{ row: 0, message: '文件读取失败，请确认文件格式与内容' }])
    }
  }

  const downloadCsvTemplate = () => {
    const blob = new Blob([TEMPLATE_CSV], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = '开发板导入模板.csv'
    link.click()
    URL.revokeObjectURL(url)
  }

  const downloadXlsxTemplate = async () => {
    const ExcelJS = await loadExcelJS()
    const workbook = new ExcelJS.Workbook()
    const sheet = workbook.addWorksheet('开发板')
    sheet.columns = [{ width: 14 }, { width: 14 }, { width: 16 }, { width: 30 }, { width: 14 }]
    const header = sheet.addRow(TEMPLATE_COLUMNS)
    header.font = { bold: true }
    sheet.addRow(TEMPLATE_EXAMPLE)

    const buffer = await workbook.xlsx.writeBuffer()
    const blob = new Blob([buffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = '开发板导入模板.xlsx'
    link.click()
    URL.revokeObjectURL(url)
  }

  const copyPrompt = async () => {
    const ok = await copyToClipboard(IMPORT_PROMPT)
    if (ok) toast.success('已复制提示词')
    else toast.error('复制失败')
  }

  const runImport = async () => {
    if (!classId || rows.length === 0) return
    setImporting(true)
    try {
      const res = await importDevBoards(classId, rows)
      setResult(res)
      onImported()
      if (res.failed.length === 0) {
        toast.success(`已导入 ${res.created} 块开发板`)
        state.close()
      } else {
        toast.error(`导入完成：成功 ${res.created} · 失败 ${res.failed.length}`)
      }
    } catch (error) {
      toast.error(getErrorMessage(error, '导入失败'))
    } finally {
      setImporting(false)
    }
  }

  return (
    <Modal state={state}>
      <Modal.Backdrop>
        <Modal.Container>
          <Modal.Dialog className="sm:max-w-xl">
            <Modal.CloseTrigger />
            <Modal.Header>
              <Modal.Icon className="bg-brand-500/10 text-brand-600 dark:text-brand-300">
                <Upload width={18} height={18} className="shrink-0" />
              </Modal.Icon>
              <Modal.Heading>批量导入开发板</Modal.Heading>
            </Modal.Header>
            <Modal.Body className="flex flex-col gap-4">
              <Card className="flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <div className="text-sm font-semibold">下载模板</div>
                  <div className="mt-1 text-xs text-fg-subtle">请勿改动表头与列顺序。</div>
                </div>
                <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
                  <Button variant="secondary" onPress={downloadCsvTemplate}>
                    <Download width={16} height={16} className="shrink-0" />
                    CSV模板
                  </Button>
                  <Button variant="secondary" onPress={() => void downloadXlsxTemplate()}>
                    <Download width={16} height={16} className="shrink-0" />
                    xlsx模板
                  </Button>
                  <IconAction
                    label="复制提示词"
                    variant="secondary"
                    onPress={() => void copyPrompt()}
                  >
                    <Bot width={16} height={16} className="shrink-0" />
                  </IconAction>
                </div>
              </Card>

              <Card className="flex flex-col gap-3">
                <div className="text-sm font-semibold">上传文件</div>
                <label
                  onDragOver={(event) => {
                    event.preventDefault()
                    setDragOver(true)
                  }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={(event) => {
                    event.preventDefault()
                    setDragOver(false)
                    const file = event.dataTransfer.files?.[0]
                    if (file) void handleFile(file)
                  }}
                  className={cn(
                    'flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-6 py-8 text-center transition-colors',
                    dragOver
                      ? 'border-brand-500 bg-brand-500/5'
                      : 'border-line hover:border-brand-400/60',
                  )}
                >
                  <input
                    type="file"
                    accept=".xlsx,.csv,.txt,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
                    className="hidden"
                    onChange={(event) => {
                      const file = event.target.files?.[0]
                      if (file) void handleFile(file)
                      event.target.value = ''
                    }}
                  />
                  <FileUp
                    width={24}
                    height={24}
                    className={cn('shrink-0', dragOver ? 'text-brand-500' : 'text-fg-subtle')}
                  />
                  <div className="text-sm">{fileName ?? '拖拽文件到此处，或点击选择'}</div>
                  <div className="text-xs text-fg-subtle">支持 .xlsx / .csv（.csv 请使用 UTF-8 编码）</div>
                </label>

                {(rows.length > 0 || parseErrors.length > 0) && (
                  <div className="flex flex-col gap-2 text-xs">
                    <div className="flex items-center gap-2 text-fg-muted">
                      <FileSpreadsheet width={14} height={14} className="shrink-0" />
                      解析到 <span className="tabular font-semibold text-fg">{rows.length}</span> 条
                      {parseErrors.length > 0 && (
                        <span className="text-warning">· {parseErrors.length} 条问题</span>
                      )}
                    </div>
                    {rows.slice(0, 5).map((row, index) => (
                      <div
                        key={`${row.dbId}-${index}`}
                        className="flex items-center gap-2 rounded-lg bg-sunken/50 px-2 py-1"
                      >
                        <span className="tabular font-semibold">{row.dbId}</span>
                        <span className="truncate text-fg-subtle">
                          {row.boardId || '—'} · {row.studentNos?.length ?? 0} 人
                          {row.borrowed ? ' · 已借出' : ''}
                        </span>
                      </div>
                    ))}
                    {rows.length > 5 && <div className="text-fg-subtle">…等共 {rows.length} 条</div>}
                    {parseErrors.slice(0, 6).map((error) => (
                      <div
                        key={`${error.row}-${error.message}`}
                        className="flex items-center gap-1.5 text-warning"
                      >
                        <CircleAlert width={13} height={13} className="shrink-0" />
                        {error.row > 0 ? `第 ${error.row} 行：` : ''}
                        {error.message}
                      </div>
                    ))}
                  </div>
                )}

                {result && result.failed.length > 0 && (
                  <div className="flex flex-col gap-2 rounded-xl border border-warning/30 bg-warning/5 px-3 py-2 text-xs">
                    <div className="font-semibold text-warning">
                      成功 {result.created} · 失败 {result.failed.length}
                    </div>
                    {result.failed.slice(0, 10).map((item) => (
                      <div key={`${item.row}-${item.dbId}`} className="text-fg-muted">
                        第 {item.row} 行（{item.dbId}）：{item.reason}
                      </div>
                    ))}
                    {result.failed.length > 10 && <div className="text-fg-subtle">…</div>}
                  </div>
                )}

                {result && result.failed.length === 0 && result.created > 0 && (
                  <div className="flex items-center gap-1.5 text-xs text-success">
                    <CircleCheck width={14} height={14} className="shrink-0" />
                    成功导入 {result.created} 条
                  </div>
                )}
              </Card>
            </Modal.Body>
            <Modal.Footer>
              <Button slot="close" variant="secondary">
                取消
              </Button>
              <PendingButton
                variant="primary"
                icon={Upload}
                pendingLabel="导入中"
                isDisabled={!classId || rows.length === 0}
                isPending={importing}
                onPress={() => void runImport()}
              >
                导入{rows.length > 0 ? ` ${rows.length} 条` : ''}
              </PendingButton>
            </Modal.Footer>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal>
  )
}
