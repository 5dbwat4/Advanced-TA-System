<script setup lang="ts">
import { BrowserMultiFormatReader, type IScannerControls } from '@zxing/browser'
import { BarcodeFormat, DecodeHintType } from '@zxing/library'
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'

import BackLink from '@/components/ui/BackLink.vue'
import Card from '@/components/ui/Card.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import PageHeader from '@/components/ui/PageHeader.vue'
import PendingButton from '@/components/ui/PendingButton.vue'
import { listDevBoards, returnDevBoard, type DevBoard } from '@/lib/api'
import { getErrorMessage } from '@/lib/error'
import { useCurrentClassComputed } from '@/lib/store'
import { toast } from '@/lib/toast'
import { UButton, UIcon, UInput, USelect } from '@/ui'

type ScanStatus = 'returned' | 'in-stock' | 'not-found' | 'error'

type ScanEntry = {
  id: string
  code: string
  status: ScanStatus
  boardLabel?: string
  message?: string
}

type StatusMeta = {
  label: string
  className: string
  icon: string
}

const SCAN_COOLDOWN_MS = 4000
const SUPPORTED_FORMATS = 'Code128 / Code39 / QR'
const AUTO_DEVICE = '__auto__'

const STATUS_META: Record<ScanStatus, StatusMeta> = {
  returned: { label: '已归还', className: 'text-success', icon: 'i-lucide-circle-check' },
  'in-stock': { label: '已在库', className: 'text-fg-muted', icon: 'i-lucide-package-check' },
  'not-found': { label: '未找到', className: 'text-warning', icon: 'i-lucide-circle-x' },
  error: { label: '失败', className: 'text-danger', icon: 'i-lucide-circle-alert' },
}

function createReader(): BrowserMultiFormatReader {
  const hints = new Map<DecodeHintType, unknown>()
  hints.set(DecodeHintType.POSSIBLE_FORMATS, [
    BarcodeFormat.CODE_128,
    BarcodeFormat.CODE_39,
    BarcodeFormat.QR_CODE,
  ])
  hints.set(DecodeHintType.TRY_HARDER, true)
  return new BrowserMultiFormatReader(hints)
}

function cameraErrorMessage(error: unknown): string {
  if (error instanceof DOMException) {
    if (error.name === 'NotAllowedError') return '未获得摄像头权限，请在浏览器设置中允许后重试'
    if (error.name === 'NotFoundError' || error.name === 'DevicesNotFoundError') {
      return '未检测到可用摄像头'
    }
    if (error.name === 'NotReadableError' || error.name === 'TrackStartError') {
      return '摄像头被其他程序占用，请关闭后重试'
    }
    if (error.name === 'OverconstrainedError') return '当前摄像头不支持所需参数'
  }
  return getErrorMessage(error, '无法启动摄像头')
}

const currentClass = useCurrentClassComputed()
const classId = computed(() => currentClass.value?.id ?? null)

const videoRef = ref<HTMLVideoElement | null>(null)
const readerRef = ref<BrowserMultiFormatReader | null>(null)
const controlsRef = ref<IScannerControls | null>(null)
const runIdRef = ref(0)
const cooldownsRef = ref<Map<string, number>>(new Map())

const boards = ref<DevBoard[]>([])
const scanning = ref(false)
const starting = ref(false)
const cameraError = ref<string | null>(null)
const deviceId = ref<string | null>(null)
const devices = ref<MediaDeviceInfo[]>([])
const entries = ref<ScanEntry[]>([])
const manualCode = ref('')
const manualBusy = ref(false)

const deviceSelectValue = computed(() => deviceId.value ?? AUTO_DEVICE)

const deviceOptions = computed(() => [
  { label: '自动（后置优先）', value: AUTO_DEVICE },
  ...devices.value.map((device, index) => ({
    label: device.label || `摄像头 ${index + 1}`,
    value: device.deviceId,
  })),
])

const returnedCount = computed(() => entries.value.filter((entry) => entry.status === 'returned').length)
const notFoundCount = computed(
  () => entries.value.filter((entry) => entry.status === 'not-found').length,
)

async function load() {
  const id = classId.value
  if (!id) {
    boards.value = []
    return
  }
  try {
    const { devBoards } = await listDevBoards(id)
    boards.value = devBoards
  } catch (error) {
    toast.error(getErrorMessage(error, '加载开发板失败'))
  }
}

function addEntry(entry: Omit<ScanEntry, 'id'>) {
  entries.value = [{ ...entry, id: crypto.randomUUID() }, ...entries.value].slice(0, 30)
}

async function handleCode(raw: string) {
  const code = raw.trim()
  if (!code) return

  const now = Date.now()
  if ((cooldownsRef.value.get(code) ?? 0) > now) return
  cooldownsRef.value.set(code, now + SCAN_COOLDOWN_MS)

  const lower = code.toLowerCase()
  const board = boards.value.find(
    (item) =>
      item.dbId === code ||
      item.boardId === code ||
      item.dbId.toLowerCase() === lower ||
      item.boardId?.toLowerCase() === lower,
  )

  if (!board) {
    addEntry({ code, status: 'not-found' })
    return
  }
  if (!board.borrowed) {
    addEntry({ code, status: 'in-stock', boardLabel: board.dbId })
    return
  }

  try {
    const { devBoard } = await returnDevBoard(board.id)
    boards.value = boards.value.map((item) => (item.id === devBoard.id ? devBoard : item))
    addEntry({ code, status: 'returned', boardLabel: devBoard.dbId })
    navigator.vibrate?.(80)
  } catch (error) {
    addEntry({
      code,
      status: 'error',
      boardLabel: board.dbId,
      message: getErrorMessage(error, '归还失败'),
    })
  }
}

async function refreshDevices() {
  try {
    const list = await BrowserMultiFormatReader.listVideoInputDevices()
    devices.value = list
  } catch {
    devices.value = []
  }
}

function onDeviceChange() {
  void refreshDevices()
}

async function start() {
  if (scanning.value || starting.value) return
  const video = videoRef.value
  if (!video) return

  const runId = ++runIdRef.value
  cameraError.value = null
  starting.value = true
  try {
    const reader = readerRef.value ?? createReader()
    readerRef.value = reader
    const controls = await reader.decodeFromVideoDevice(
      deviceId.value ?? undefined,
      video,
      (result) => {
        if (result) void handleCode(result.getText())
      },
    )
    if (runId !== runIdRef.value) {
      controls.stop()
      return
    }
    controlsRef.value = controls
    scanning.value = true
    void refreshDevices()
  } catch (error) {
    if (runId !== runIdRef.value) return
    cameraError.value = cameraErrorMessage(error)
  } finally {
    if (runId === runIdRef.value) starting.value = false
  }
}

function stop() {
  runIdRef.value += 1
  controlsRef.value?.stop()
  controlsRef.value = null
  scanning.value = false
  starting.value = false
}

function selectDevice(id: string | null) {
  deviceId.value = id
  if (scanning.value) {
    stop()
    void start()
  }
}

function onDeviceSelect(value: unknown) {
  const id = String(value ?? AUTO_DEVICE)
  selectDevice(id === AUTO_DEVICE ? null : id)
}

async function submitManual() {
  if (!manualCode.value.trim()) return
  manualBusy.value = true
  try {
    await handleCode(manualCode.value)
    manualCode.value = ''
  } finally {
    manualBusy.value = false
  }
}

watch(
  classId,
  async (id) => {
    if (!id) {
      boards.value = []
      return
    }
    void load()
    await nextTick()
    if (!scanning.value && !starting.value) void start()
  },
  { immediate: true },
)

onMounted(() => {
  if (navigator.mediaDevices) {
    navigator.mediaDevices.addEventListener('devicechange', onDeviceChange)
  }
  void start()
})

onUnmounted(() => {
  if (navigator.mediaDevices) {
    navigator.mediaDevices.removeEventListener('devicechange', onDeviceChange)
  }
  stop()
  const video = videoRef.value
  const stream = video?.srcObject
  if (stream instanceof MediaStream) stream.getTracks().forEach((track) => track.stop())
  if (video) video.srcObject = null
})
</script>

<template>
  <div class="mx-auto max-w-6xl">
    <BackLink to="/console/boards">返回开发板</BackLink>

    <PageHeader title="扫码归还">
      <template #subtitle>
        已归还 <span class="tabular">{{ returnedCount }}</span> · 未找到
        <span class="tabular">{{ notFoundCount }}</span> · 共
        <span class="tabular">{{ boards.length }}</span> 块开发板
      </template>
      <template #actions>
        <UButton v-if="scanning" color="secondary" variant="soft" @click="stop">
          <UIcon name="i-lucide-camera-off" class="h-4 w-4 shrink-0" />
          停止扫描
        </UButton>
        <PendingButton
          v-else
          color="primary"
          icon="i-lucide-camera"
          :loading="starting"
          loading-label="启动中"
          @click="start"
        >
          开始扫描
        </PendingButton>
      </template>
    </PageHeader>

    <EmptyState
      v-if="!classId"
      icon="i-lucide-scan-line"
      title="未选择课程"
      hint="请先在右上角选择或绑定一个课程"
    />

    <div v-else class="grid gap-4 lg:grid-cols-[2fr_1fr]">
      <Card class="flex flex-col gap-4">
        <div class="relative aspect-[4/3] overflow-hidden rounded-xl border border-line bg-black">
          <video
            ref="videoRef"
            class="h-full w-full object-cover"
            autoplay
            muted
            playsinline
          />
          <div v-if="scanning" class="pointer-events-none absolute inset-0">
            <div class="absolute inset-[12%] rounded-2xl border border-white/25">
              <div
                class="absolute -left-px -top-px h-8 w-8 rounded-tl-2xl border-l-2 border-t-2 border-brand-400"
              />
              <div
                class="absolute -right-px -top-px h-8 w-8 rounded-tr-2xl border-r-2 border-t-2 border-brand-400"
              />
              <div
                class="absolute -bottom-px -left-px h-8 w-8 rounded-bl-2xl border-b-2 border-l-2 border-brand-400"
              />
              <div
                class="absolute -bottom-px -right-px h-8 w-8 rounded-br-2xl border-b-2 border-r-2 border-brand-400"
              />
              <div
                class="scan-line absolute inset-x-2 h-0.5 rounded-full bg-brand-400 shadow-[0_0_12px_2px] shadow-brand-400/60"
              />
            </div>
          </div>
          <div
            v-if="!scanning && !starting"
            class="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/60 px-6 text-center text-sm text-white/80"
          >
            <UIcon name="i-lucide-scan-line" class="h-7 w-7 shrink-0" />
            <div>{{ cameraError ?? '摄像头未开启' }}</div>
          </div>
        </div>

        <div class="flex flex-col gap-3">
          <div class="flex flex-wrap items-center justify-between gap-2">
            <div class="flex items-center gap-1.5 text-xs text-fg-subtle">
              <UIcon name="i-lucide-scan-line" class="h-3.5 w-3.5 shrink-0" />
              支持 {{ SUPPORTED_FORMATS }}
            </div>
            <div class="flex items-center gap-2">
              <span class="text-xs font-semibold text-fg-muted">摄像头</span>
              <USelect
                :model-value="deviceSelectValue"
                :items="deviceOptions"
                :disabled="starting"
                class="min-w-[12rem]"
                aria-label="选择摄像头"
                @update:model-value="onDeviceSelect"
              />
            </div>
          </div>

          <div class="flex flex-col gap-1.5">
            <div class="flex items-center gap-1.5 text-xs font-semibold text-fg-muted">
              <UIcon name="i-lucide-keyboard" class="h-3.5 w-3.5 shrink-0" />
              手动录入
            </div>
            <div class="flex items-center gap-2">
              <UInput
                v-model="manualCode"
                class="w-full"
                placeholder="输入 DB id 或 id 后回车"
                aria-label="手动录入编码"
                @keydown.enter.prevent="submitManual"
              />
              <PendingButton
                color="secondary"
                variant="soft"
                :loading="manualBusy"
                :disabled="!manualCode.trim()"
                @click="submitManual"
              >
                处理
              </PendingButton>
            </div>
          </div>
        </div>
      </Card>

      <Card class="flex flex-col gap-3">
        <div class="flex items-center justify-between gap-2">
          <span class="text-sm font-bold">扫码记录</span>
          <UButton
            v-if="entries.length > 0"
            size="sm"
            color="neutral"
            variant="ghost"
            @click="entries = []"
          >
            清空
          </UButton>
        </div>
        <div v-if="entries.length === 0" class="py-12 text-center text-sm text-fg-subtle">
          扫码结果会显示在这里
        </div>
        <ul v-else class="flex max-h-[62vh] flex-col gap-2 overflow-auto">
          <li
            v-for="entry in entries"
            :key="entry.id"
            class="flex items-start gap-3 rounded-xl border border-line bg-sunken/40 px-3 py-2"
          >
            <UIcon
              :name="STATUS_META[entry.status].icon"
              :class="[STATUS_META[entry.status].className, 'mt-0.5 h-4 w-4 shrink-0']"
            />
            <div class="min-w-0 flex-1">
              <div class="flex items-center gap-2">
                <span class="tabular truncate text-sm font-semibold">{{ entry.code }}</span>
                <span
                  :class="[
                    STATUS_META[entry.status].className,
                    'ms-auto shrink-0 text-xs font-semibold',
                  ]"
                >
                  {{ STATUS_META[entry.status].label }}
                </span>
              </div>
              <div class="mt-0.5 truncate text-xs text-fg-subtle">
                {{ entry.boardLabel ? `开发板 ${entry.boardLabel}` : '未匹配到开发板' }}
                {{ entry.message ? ` · ${entry.message}` : '' }}
              </div>
            </div>
          </li>
        </ul>
      </Card>
    </div>
  </div>
</template>

<style scoped>
.scan-line {
  animation: scan-move 2.4s ease-in-out infinite;
}

@keyframes scan-move {
  0%,
  100% {
    top: 6%;
  }
  50% {
    top: 94%;
  }
}
</style>
