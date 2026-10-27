<script setup lang="ts">
import copyToClipboard from 'copy-to-clipboard'
import { computed, ref, watch } from 'vue'

import Card from '@/components/ui/Card.vue'
import IconAction from '@/components/ui/IconAction.vue'
import PendingButton from '@/components/ui/PendingButton.vue'
import { importDevBoards, type DevBoardImportResult, type DevBoardImportRow } from '@/lib/api'
import { getErrorMessage } from '@/lib/error'
import { toast } from '@/lib/toast'
import { cn } from '@/lib/utils'
import { UButton, UIcon, UModal, UTextarea } from '@/ui'

type ParseError = { row: number; message: string }

const props = withDefaults(
  defineProps<{
    open?: boolean
    classId: string | null
  }>(),
  {
    open: false,
  },
)

const emit = defineEmits<{
  'update:open': [value: boolean]
  imported: []
}>()

const isOpen = computed({
  get: () => props.open,
  set: (value) => emit('update:open', value),
})

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
      studentIds: splitStudentNos(cells[3] ?? ''),
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

const dragOver = ref(false)
const fileName = ref<string | null>(null)
const rows = ref<DevBoardImportRow[]>([])
const parseErrors = ref<ParseError[]>([])
const result = ref<DevBoardImportResult | null>(null)
const importing = ref(false)
const pasteText = ref('')

watch(
  () => props.open,
  (open) => {
    if (!open) return
    dragOver.value = false
    fileName.value = null
    rows.value = []
    parseErrors.value = []
    result.value = null
    importing.value = false
    pasteText.value = ''
  },
)

function setParsed(parsed: { rows: DevBoardImportRow[]; errors: ParseError[] }) {
  rows.value = parsed.rows
  parseErrors.value = parsed.errors
}

async function handleFile(file: File) {
  fileName.value = file.name
  result.value = null
  try {
    const parsed = file.name.toLowerCase().endsWith('.xlsx')
      ? await parseBoardXlsx(await file.arrayBuffer())
      : parseBoardCsv(await file.text())
    setParsed(parsed)
  } catch {
    rows.value = []
    parseErrors.value = [{ row: 0, message: '文件读取失败，请确认文件格式与内容' }]
  }
}

function onDrop(event: DragEvent) {
  dragOver.value = false
  const file = event.dataTransfer?.files?.[0]
  if (file) void handleFile(file)
}

function onFileChange(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (file) void handleFile(file)
  input.value = ''
}

function applyPaste() {
  if (!pasteText.value.trim()) return
  fileName.value = '粘贴内容'
  result.value = null
  setParsed(parseBoardCsv(pasteText.value))
}

function downloadCsvTemplate() {
  const blob = new Blob([TEMPLATE_CSV], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = '开发板导入模板.csv'
  link.click()
  URL.revokeObjectURL(url)
}

async function downloadXlsxTemplate() {
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

async function copyPrompt() {
  const ok = await copyToClipboard(IMPORT_PROMPT)
  if (ok) toast.success('已复制提示词')
  else toast.error('复制失败')
}

async function runImport() {
  if (!props.classId || rows.value.length === 0) return
  importing.value = true
  try {
    const res = await importDevBoards(props.classId, rows.value)
    result.value = res
    emit('imported')
    if (res.failed.length === 0) {
      toast.success(`已导入 ${res.created} 块开发板`)
      isOpen.value = false
    } else {
      toast.error(`导入完成：成功 ${res.created} · 失败 ${res.failed.length}`)
    }
  } catch (error) {
    toast.error(getErrorMessage(error, '导入失败'))
  } finally {
    importing.value = false
  }
}
</script>

<template>
  <UModal
    v-model:open="isOpen"
    title="批量导入开发板"
    :dismissible="!importing"
    :ui="{ content: 'sm:max-w-xl' }"
  >
    <template #body>
      <div class="flex flex-col gap-4">
        <Card class="flex items-center justify-between gap-4">
          <div class="min-w-0">
            <div class="text-sm font-semibold">下载模板</div>
            <div class="mt-1 text-xs text-fg-subtle">请勿改动表头与列顺序。</div>
          </div>
          <div class="flex shrink-0 flex-wrap items-center justify-end gap-2">
            <UButton color="secondary" variant="soft" @click="downloadCsvTemplate">
              <UIcon name="i-lucide-download" class="h-4 w-4 shrink-0" />
              CSV模板
            </UButton>
            <UButton color="secondary" variant="soft" @click="downloadXlsxTemplate">
              <UIcon name="i-lucide-download" class="h-4 w-4 shrink-0" />
              xlsx模板
            </UButton>
            <IconAction label="复制提示词" variant="soft" @click="copyPrompt">
              <UIcon name="i-lucide-bot" class="h-4 w-4 shrink-0" />
            </IconAction>
          </div>
        </Card>

        <Card class="flex flex-col gap-3">
          <div class="text-sm font-semibold">上传文件</div>
          <label
            :class="
              cn(
                'flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-6 py-8 text-center transition-colors',
                dragOver
                  ? 'border-brand-500 bg-brand-500/5'
                  : 'border-line hover:border-brand-400/60',
              )
            "
            @dragover.prevent="dragOver = true"
            @dragleave="dragOver = false"
            @drop.prevent="onDrop"
          >
            <input
              type="file"
              accept=".xlsx,.csv,.txt,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
              class="hidden"
              @change="onFileChange"
            />
            <UIcon
              name="i-lucide-file-up"
              :class="cn('h-6 w-6 shrink-0', dragOver ? 'text-brand-500' : 'text-fg-subtle')"
            />
            <div class="text-sm">{{ fileName ?? '拖拽文件到此处，或点击选择' }}</div>
            <div class="text-xs text-fg-subtle">支持 .xlsx / .csv（.csv 请使用 UTF-8 编码）</div>
          </label>

          <div class="flex flex-col gap-2">
            <div class="text-sm font-semibold">粘贴 CSV</div>
            <UTextarea
              v-model="pasteText"
              :rows="4"
              class="w-full"
              placeholder="粘贴 CSV 内容，表头：DB id,id,联系电话,合用学生学号,是否已借出"
            />
            <div class="flex justify-end">
              <UButton
                color="secondary"
                variant="soft"
                size="sm"
                :disabled="!pasteText.trim()"
                @click="applyPaste"
              >
                解析粘贴内容
              </UButton>
            </div>
          </div>

          <div v-if="rows.length > 0 || parseErrors.length > 0" class="flex flex-col gap-2 text-xs">
            <div class="flex items-center gap-2 text-fg-muted">
              <UIcon name="i-lucide-file-spreadsheet" class="h-3.5 w-3.5 shrink-0" />
              解析到 <span class="tabular font-semibold text-fg">{{ rows.length }}</span> 条
              <span v-if="parseErrors.length > 0" class="text-warning">
                · {{ parseErrors.length }} 条问题
              </span>
            </div>
            <div
              v-for="(row, index) in rows.slice(0, 5)"
              :key="`${row.dbId}-${index}`"
              class="flex items-center gap-2 rounded-lg bg-sunken/50 px-2 py-1"
            >
              <span class="tabular font-semibold">{{ row.dbId }}</span>
              <span class="truncate text-fg-subtle">
                {{ row.boardId || '—' }} · {{ row.studentIds?.length ?? 0 }} 人
                {{ row.borrowed ? ' · 已借出' : '' }}
              </span>
            </div>
            <div v-if="rows.length > 5" class="text-fg-subtle">…等共 {{ rows.length }} 条</div>
            <div
              v-for="error in parseErrors.slice(0, 6)"
              :key="`${error.row}-${error.message}`"
              class="flex items-center gap-1.5 text-warning"
            >
              <UIcon name="i-lucide-circle-alert" class="h-3 w-3 shrink-0" />
              {{ error.row > 0 ? `第 ${error.row} 行：` : '' }}
              {{ error.message }}
            </div>
          </div>

          <div
            v-if="result && result.failed.length > 0"
            class="flex flex-col gap-2 rounded-xl border border-warning/30 bg-warning/5 px-3 py-2 text-xs"
          >
            <div class="font-semibold text-warning">
              成功 {{ result.created }} · 失败 {{ result.failed.length }}
            </div>
            <div
              v-for="item in result.failed.slice(0, 10)"
              :key="`${item.row}-${item.dbId}`"
              class="text-fg-muted"
            >
              第 {{ item.row }} 行（{{ item.dbId }}）：{{ item.reason }}
            </div>
            <div v-if="result.failed.length > 10" class="text-fg-subtle">…</div>
          </div>

          <div
            v-if="result && result.failed.length === 0 && result.created > 0"
            class="flex items-center gap-1.5 text-xs text-success"
          >
            <UIcon name="i-lucide-circle-check" class="h-3.5 w-3.5 shrink-0" />
            成功导入 {{ result.created }} 条
          </div>
        </Card>
      </div>
    </template>
    <template #footer>
      <UButton color="neutral" variant="soft" @click="isOpen = false">取消</UButton>
      <PendingButton
        color="primary"
        icon="i-lucide-upload"
        loading-label="导入中"
        :disabled="!classId || rows.length === 0"
        :loading="importing"
        @click="runImport"
      >
        导入{{ rows.length > 0 ? ` ${rows.length} 条` : '' }}
      </PendingButton>
    </template>
  </UModal>
</template>
