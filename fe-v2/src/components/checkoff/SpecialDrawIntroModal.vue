<script setup lang="ts">
import copyToClipboard from 'copy-to-clipboard'
import { computed, ref } from 'vue'

import IconAction from '@/components/ui/IconAction.vue'
import PendingButton from '@/components/ui/PendingButton.vue'
import { listBanks } from '@/lib/api'
import { getErrorMessage } from '@/lib/error'
import { formatLocaleDateTime } from '@/lib/format'
import {
  createSpecialDrawPayload,
  listSavedSpecialDrawMachines,
  parseSpecialDrawPayload,
  removeSavedSpecialDrawMachine,
  saveSpecialDrawMachine,
  saveSpecialDrawMachineToLibrary,
  validateSpecialDrawMachine,
  type SavedSpecialDrawMachine,
  type SpecialDrawMachine,
  type SpecialDrawNode,
  type SpecialDrawNodeType,
} from '@/lib/special-draw'
import { toast } from '@/lib/toast'
import { cn } from '@/lib/utils'
import { UAlert, UButton, UIcon, UModal, UTextarea } from '@/ui'

const props = withDefaults(
  defineProps<{
    open?: boolean
  }>(),
  {
    open: false,
  },
)

const emit = defineEmits<{
  'update:open': [value: boolean]
  edit: []
  applied: [machine: SpecialDrawMachine]
}>()

const NODE_TYPE_LABEL: Record<SpecialDrawNodeType, string> = {
  start: '开始',
  draw: '抽题',
  ratio: '抽取比例',
  count: '数量条件',
  flag: 'Flag 条件',
  setFlag: '设置 Flag',
  toggleFlag: '翻转 Flag',
  end: '结束',
}

const isOpen = computed({
  get: () => props.open,
  set: (value: boolean) => emit('update:open', value),
})

const importOpen = ref(false)
const savedMachines = ref<SavedSpecialDrawMachine[]>(listSavedSpecialDrawMachines())
const importText = ref('')
const saving = ref(false)
const selectedSavedId = ref<string | null>(null)

const selectedSaved = computed(
  () => savedMachines.value.find((entry) => entry.id === selectedSavedId.value) ?? null,
)

const preview = computed<{ machine: SpecialDrawMachine | null; error: string | null } | null>(
  () => {
    const raw = importText.value.trim()
    if (!raw) return null
    try {
      return { machine: parseSpecialDrawPayload(raw), error: null }
    } catch (error) {
      return { machine: null, error: getErrorMessage(error, '无法解析状态机') }
    }
  },
)

function machineSummary(machine: SpecialDrawMachine): string {
  const names = [
    ...new Set(
      machine.nodes.flatMap((node) =>
        node.type === 'draw' && node.bankName ? [node.bankName] : [],
      ),
    ),
  ]
  return names.length > 0 ? names.join('、') : '未引用题目集'
}

function nodeLabel(node: SpecialDrawNode): string {
  const label = NODE_TYPE_LABEL[node.type]
  return node.type === 'draw' && node.bankName ? `${label} · ${node.bankName}` : label
}

function refreshSaved() {
  const next = listSavedSpecialDrawMachines()
  savedMachines.value = next
  selectedSavedId.value =
    selectedSavedId.value && next.some((entry) => entry.id === selectedSavedId.value)
      ? selectedSavedId.value
      : null
}

function goEdit() {
  isOpen.value = false
  emit('edit')
}

function openImport() {
  importText.value = ''
  importOpen.value = true
}

function confirmSaved() {
  const saved = selectedSaved.value
  if (!saved) return
  saveSpecialDrawMachine(saved.machine)
  emit('applied', saved.machine)
  isOpen.value = false
  toast.success('已应用本地保存的状态机')
}

function editSaved(entry: SavedSpecialDrawMachine) {
  saveSpecialDrawMachine(entry.machine)
  isOpen.value = false
  emit('edit')
}

async function shareSaved(entry: SavedSpecialDrawMachine) {
  const ok = await copyToClipboard(createSpecialDrawPayload(entry.machine))
  if (ok) toast.success('分享 payload 已复制')
  else toast.error('复制分享 payload 失败')
}

function deleteSaved(entry: SavedSpecialDrawMachine) {
  try {
    removeSavedSpecialDrawMachine(entry.id)
    refreshSaved()
    toast.success('已删除本地状态机')
  } catch (error) {
    toast.error(getErrorMessage(error, '删除失败'))
  }
}

async function saveImported(apply: boolean) {
  const current = preview.value
  const machine = current?.machine
  if (!machine) {
    toast.error(current?.error ?? '请先粘贴状态机内容')
    return
  }

  saving.value = true
  try {
    const { banks } = await listBanks()
    const error = validateSpecialDrawMachine(
      machine,
      banks.map((bank) => ({ id: bank.id, name: bank.name, count: bank.questions.length })),
    )
    if (error) throw new Error(error)

    if (apply) {
      saveSpecialDrawMachine(machine)
      emit('applied', machine)
      refreshSaved()
      importOpen.value = false
      isOpen.value = false
      toast.success('状态机已保存并应用')
    } else {
      saveSpecialDrawMachineToLibrary(machine)
      refreshSaved()
      importOpen.value = false
      toast.success('状态机已保存到本地')
    }
    importText.value = ''
  } catch (error) {
    toast.error(getErrorMessage(error, '保存失败'))
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <UModal v-model:open="isOpen" title="特殊的抽题方式" :ui="{ content: 'sm:max-w-3xl' }">
    <template #body>
      <div class="flex flex-col gap-4">
        <UAlert
          color="warning"
          icon="i-lucide-triangle-alert"
          description="我们支持使用状态机进行抽题。请注意，这是不鼓励的且我们认为这不是一个常见需求。该模式下你创建的状态机，不会被保存到云端，你需要自行分享给你的助教朋友或其他设备。"
        />

        <div class="flex w-full flex-col gap-2">
          <div class="flex items-center justify-between gap-2">
            <div class="text-xs font-semibold tracking-wider text-fg-subtle">本地状态机</div>
            <div class="flex gap-1.5">
              <UButton size="sm" color="neutral" variant="soft" @click="goEdit">
                <UIcon name="i-lucide-plus" class="size-3.5 shrink-0" />
                添加
              </UButton>
              <UButton size="sm" color="neutral" variant="soft" @click="openImport">
                <UIcon name="i-lucide-upload" class="size-3.5 shrink-0" />
                导入
              </UButton>
            </div>
          </div>

          <p
            v-if="savedMachines.length === 0"
            class="rounded-xl border border-dashed border-line px-3 py-3 text-center text-xs text-fg-subtle"
          >
            当前设备还没有已保存的状态机
          </p>

          <div v-else class="flex max-h-48 flex-col gap-2 overflow-y-auto">
            <div
              v-for="entry in savedMachines"
              :key="entry.id"
              :class="
                cn(
                  'flex items-center gap-1 rounded-xl border px-2 py-1.5 transition-colors',
                  entry.id === selectedSavedId
                    ? 'border-brand-500 bg-brand-500/5'
                    : 'border-line bg-elevated hover:bg-sunken',
                )
              "
            >
              <button
                type="button"
                class="flex min-w-0 flex-1 cursor-pointer flex-col gap-0.5 rounded-lg px-1.5 py-0.5 text-left"
                @click="selectedSavedId = entry.id"
              >
                <span class="flex items-center gap-2">
                  <span class="truncate text-sm font-semibold text-fg">
                    {{ machineSummary(entry.machine) }}
                  </span>
                  <UIcon
                    v-if="entry.id === selectedSavedId"
                    name="i-lucide-check"
                    class="size-3.5 shrink-0 text-brand-600 dark:text-brand-300"
                  />
                </span>
                <span class="text-xs text-fg-subtle">
                  {{ entry.machine.nodes.length }} 个节点 ·
                  {{
                    entry.savedAt > 0
                      ? formatLocaleDateTime(new Date(entry.savedAt).toISOString())
                      : '当前启用的状态机'
                  }}
                </span>
              </button>
              <div class="flex shrink-0 items-center gap-0.5">
                <IconAction
                  label="分享状态机"
                  tooltip="复制分享 payload"
                  placement="left"
                  @click="shareSaved(entry)"
                >
                  <UIcon name="i-lucide-share-2" class="size-3.5 shrink-0" />
                </IconAction>
                <IconAction label="编辑状态机" placement="left" @click="editSaved(entry)">
                  <UIcon name="i-lucide-pencil" class="size-3.5 shrink-0" />
                </IconAction>
                <IconAction label="删除状态机" placement="left" @click="deleteSaved(entry)">
                  <UIcon name="i-lucide-trash-2" class="size-3.5 shrink-0" />
                </IconAction>
              </div>
            </div>
          </div>
        </div>

        <div v-if="selectedSaved" class="flex flex-col gap-3">
          <div class="overflow-hidden rounded-xl border border-line bg-sunken">
            <div
              class="flex items-center justify-between gap-2 border-b border-line px-3 py-2 text-xs"
            >
              <span class="truncate font-semibold text-fg">
                {{ machineSummary(selectedSaved.machine) }}
              </span>
              <span class="shrink-0 text-fg-subtle">
                {{ selectedSaved.machine.nodes.length }} 个节点
              </span>
            </div>
            <div class="max-h-40 overflow-y-auto p-3">
              <span
                v-for="node in selectedSaved.machine.nodes"
                :key="node.id"
                class="m-1 inline-flex rounded-lg bg-elevated px-2 py-1 text-xs text-fg-muted"
              >
                {{ nodeLabel(node) }}
              </span>
            </div>
          </div>
          <UButton class="w-full" @click="confirmSaved">确认应用</UButton>
        </div>
      </div>
    </template>
  </UModal>

  <UModal v-model:open="importOpen" title="导入状态机" :ui="{ content: 'sm:max-w-lg' }">
    <template #body>
      <div class="flex flex-col gap-3">
        <p class="text-xs text-fg-subtle">
          如果别人给你提供了一个抽题文件或数组，请将它粘贴到此处。
        </p>
        <UTextarea
          v-model="importText"
          :rows="8"
          aria-label="粘贴特殊抽题状态机文件或数组"
          placeholder="粘贴 payload 或节点数组"
          class="w-full font-mono text-xs"
        />

        <div class="flex flex-col gap-2">
          <div class="text-xs font-semibold tracking-wider text-fg-subtle">预览</div>
          <p
            v-if="preview === null"
            class="rounded-xl border border-dashed border-line py-3 text-center text-xs text-fg-subtle"
          >
            粘贴后自动预览
          </p>
          <UAlert
            v-else-if="preview.machine === null"
            color="error"
            icon="i-lucide-circle-alert"
            :description="preview.error ?? '无法解析状态机'"
          />
          <div v-else class="overflow-hidden rounded-xl border border-line bg-sunken">
            <div
              class="flex items-center justify-between gap-2 border-b border-line px-3 py-2 text-xs"
            >
              <span class="truncate font-semibold text-fg">
                {{ machineSummary(preview.machine) }}
              </span>
              <span class="shrink-0 text-fg-subtle">
                {{ preview.machine.nodes.length }} 个节点
              </span>
            </div>
            <div class="max-h-40 overflow-y-auto p-3">
              <span
                v-for="node in preview.machine.nodes"
                :key="node.id"
                class="m-1 inline-flex rounded-lg bg-elevated px-2 py-1 text-xs text-fg-muted"
              >
                {{ nodeLabel(node) }}
              </span>
            </div>
          </div>
        </div>
      </div>
    </template>

    <template #footer>
      <UButton color="neutral" variant="soft" @click="importOpen = false">取消</UButton>
      <PendingButton color="neutral" variant="soft" :loading="saving" @click="saveImported(false)">
        保存
      </PendingButton>
      <PendingButton :loading="saving" @click="saveImported(true)">保存并应用</PendingButton>
    </template>
  </UModal>
</template>