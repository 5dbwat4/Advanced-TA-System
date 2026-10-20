import { Alert, Button, Modal, TextArea, useOverlayState } from '@heroui/react'
import copyToClipboard from 'copy-to-clipboard'
import { useMemo, useState } from 'react'
import { toast } from 'sonner'

import Check from '~icons/lucide/check'
import Dices from '~icons/lucide/dices'
import Pencil from '~icons/lucide/pencil'
import Plus from '~icons/lucide/plus'
import Share2 from '~icons/lucide/share-2'
import Trash2 from '~icons/lucide/trash-2'
import Upload from '~icons/lucide/upload'
import { SpecialDrawPreview } from '@/components/special-draw/SpecialDrawPreview'
import { specialDrawMachineSummary } from '@/components/special-draw/special-draw-ui'
import { IconAction } from '@/components/ui/IconAction'
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
} from '@/lib/special-draw'
import { cn } from '@/lib/utils'

type ModalState = ReturnType<typeof useOverlayState>

export function SpecialDrawIntroModal({
  state,
  onEdit,
  onApplied,
}: {
  state: ModalState
  onEdit: () => void
  onApplied: (machine: SpecialDrawMachine) => void
}) {
  const importState = useOverlayState()
  const [savedMachines, setSavedMachines] = useState<SavedSpecialDrawMachine[]>(() =>
    listSavedSpecialDrawMachines(),
  )
  const [importText, setImportText] = useState('')
  const [saving, setSaving] = useState(false)
  const [selectedSavedId, setSelectedSavedId] = useState<string | null>(null)
  const selectedSaved =
    savedMachines.find((entry) => entry.id === selectedSavedId) ?? null

  const preview = useMemo(() => {
    const raw = importText.trim()
    if (!raw) return null
    try {
      return { machine: parseSpecialDrawPayload(raw), error: null }
    } catch (error) {
      return { machine: null, error: getErrorMessage(error, '无法解析状态机') }
    }
  }, [importText])

  const refreshSaved = () => {
    const next = listSavedSpecialDrawMachines()
    setSavedMachines(next)
    setSelectedSavedId((current) =>
      current && next.some((entry) => entry.id === current) ? current : null,
    )
  }

  const goEdit = () => {
    state.close()
    onEdit()
  }

  const openImport = () => {
    setImportText('')
    importState.open()
  }

  const confirmSaved = () => {
    if (!selectedSaved) return
    saveSpecialDrawMachine(selectedSaved.machine)
    onApplied(selectedSaved.machine)
    state.close()
    toast.success('已应用本地保存的状态机')
  }

  const editSaved = (entry: SavedSpecialDrawMachine) => {
    saveSpecialDrawMachine(entry.machine)
    state.close()
    onEdit()
  }

  const shareSaved = async (entry: SavedSpecialDrawMachine) => {
    const ok = await copyToClipboard(createSpecialDrawPayload(entry.machine))
    if (ok) toast.success('分享 payload 已复制')
    else toast.error('复制分享 payload 失败')
  }

  const deleteSaved = (entry: SavedSpecialDrawMachine) => {
    try {
      removeSavedSpecialDrawMachine(entry.id)
      refreshSaved()
      toast.success('已删除本地状态机')
    } catch (error) {
      toast.error(getErrorMessage(error, '删除失败'))
    }
  }

  const saveImported = async (apply: boolean) => {
    const machine = preview?.machine
    if (!machine) {
      toast.error(preview?.error ?? '请先粘贴状态机内容')
      return
    }

    setSaving(true)
    try {
      const { banks } = await listBanks()
      const error = validateSpecialDrawMachine(
        machine,
        banks.map((bank) => ({ id: bank.id, name: bank.name, count: bank.questions.length })),
      )
      if (error) throw new Error(error)

      if (apply) {
        saveSpecialDrawMachine(machine)
        onApplied(machine)
        refreshSaved()
        importState.close()
        state.close()
        toast.success('状态机已保存并应用')
      } else {
        saveSpecialDrawMachineToLibrary(machine)
        refreshSaved()
        importState.close()
        toast.success('状态机已保存到本地')
      }
      setImportText('')
    } catch (error) {
      toast.error(getErrorMessage(error, '保存失败'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <Modal state={state}>
        <Modal.Backdrop>
          <Modal.Container>
            <Modal.Dialog className="sm:max-w-3xl">
              <Modal.CloseTrigger />
              <Modal.Header>
                <Modal.Icon className="bg-brand-500/10 text-brand-600 dark:text-brand-300">
                  <Dices width={18} height={18} className="shrink-0" />
                </Modal.Icon>
                <Modal.Heading>特殊的抽题方式</Modal.Heading>
              </Modal.Header>
              <Modal.Body className="flex flex-col gap-4">
                <Alert status="warning">
                  <Alert.Indicator />
                  <Alert.Content>
                    <Alert.Description>
                      我们支持使用状态机进行抽题。请注意，这是不鼓励的且我们认为这不是一个常见需求。该模式下你创建的状态机，不会被保存到云端，你需要自行分享给你的助教朋友或其他设备。
                    </Alert.Description>
                  </Alert.Content>
                </Alert>

                <div className="flex w-full flex-col gap-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-xs font-semibold tracking-wider text-fg-subtle">
                      本地状态机
                    </div>
                    <div className="flex gap-1.5">
                      <Button size="sm" variant="secondary" onPress={goEdit}>
                        <Plus width={14} height={14} className="shrink-0" />
                        添加
                      </Button>
                      <Button size="sm" variant="secondary" onPress={openImport}>
                        <Upload width={14} height={14} className="shrink-0" />
                        导入
                      </Button>
                    </div>
                  </div>

                  {savedMachines.length === 0 ? (
                    <p className="rounded-xl border border-dashed border-line px-3 py-3 text-center text-xs text-fg-subtle">
                      当前设备还没有已保存的状态机
                    </p>
                  ) : (
                    <div className="flex max-h-48 flex-col gap-2 overflow-y-auto">
                      {savedMachines.map((entry) => {
                        const selected = entry.id === selectedSavedId
                        return (
                          <div
                            key={entry.id}
                            className={cn(
                              'flex items-center gap-1 rounded-xl border px-2 py-1.5 transition-colors',
                              selected
                                ? 'border-brand-500 bg-brand-500/5'
                                : 'border-line bg-elevated hover:bg-sunken',
                            )}
                          >
                            <button
                              type="button"
                              onClick={() => setSelectedSavedId(entry.id)}
                              className="flex min-w-0 flex-1 cursor-pointer flex-col gap-0.5 rounded-lg px-1.5 py-0.5 text-left"
                            >
                              <span className="flex items-center gap-2">
                                <span className="truncate text-sm font-semibold text-fg">
                                  {specialDrawMachineSummary(entry.machine)}
                                </span>
                                {selected && (
                                  <Check
                                    width={14}
                                    height={14}
                                    className="shrink-0 text-brand-600 dark:text-brand-300"
                                  />
                                )}
                              </span>
                              <span className="text-xs text-fg-subtle">
                                {entry.machine.nodes.length} 个节点 ·{' '}
                                {entry.savedAt > 0
                                  ? formatLocaleDateTime(new Date(entry.savedAt).toISOString())
                                  : '当前启用的状态机'}
                              </span>
                            </button>
                            <div className="flex shrink-0 items-center gap-0.5">
                              <IconAction
                                label="分享状态机"
                                tooltip="复制分享 payload"
                                placement="left"
                                onPress={() => void shareSaved(entry)}
                              >
                                <Share2 width={14} height={14} className="shrink-0" />
                              </IconAction>
                              <IconAction
                                label="编辑状态机"
                                placement="left"
                                onPress={() => editSaved(entry)}
                              >
                                <Pencil width={14} height={14} className="shrink-0" />
                              </IconAction>
                              <IconAction
                                label="删除状态机"
                                placement="left"
                                onPress={() => deleteSaved(entry)}
                              >
                                <Trash2 width={14} height={14} className="shrink-0" />
                              </IconAction>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>

                {selectedSaved && (
                  <div className="flex flex-col gap-3">
                    <SpecialDrawPreview machine={selectedSaved.machine} />
                    <Button className="w-full" variant="primary" onPress={confirmSaved}>
                      确认应用
                    </Button>
                  </div>
                )}
              </Modal.Body>
            </Modal.Dialog>
          </Modal.Container>
        </Modal.Backdrop>
      </Modal>

      <Modal state={importState}>
        <Modal.Backdrop>
          <Modal.Container>
            <Modal.Dialog className="sm:max-w-lg">
              <Modal.CloseTrigger />
              <Modal.Header>
                <Modal.Icon className="bg-brand-500/10 text-brand-600 dark:text-brand-300">
                  <Upload width={18} height={18} className="shrink-0" />
                </Modal.Icon>
                <Modal.Heading>导入状态机</Modal.Heading>
              </Modal.Header>
              <Modal.Body className="flex flex-col gap-3">
                <p className="text-xs text-fg-subtle">
                  如果别人给你提供了一个抽题文件或数组，请将它粘贴到此处。
                </p>
                <TextArea
                  rows={8}
                  value={importText}
                  aria-label="粘贴特殊抽题状态机文件或数组"
                  placeholder="粘贴 payload 或节点数组"
                  className="font-mono text-xs"
                  onChange={(event) => setImportText(event.target.value)}
                />

                <div className="flex flex-col gap-2">
                  <div className="text-xs font-semibold tracking-wider text-fg-subtle">预览</div>
                  {preview === null ? (
                    <p className="rounded-xl border border-dashed border-line py-3 text-center text-xs text-fg-subtle">
                      粘贴后自动预览
                    </p>
                  ) : preview.machine === null ? (
                    <Alert status="danger">
                      <Alert.Indicator />
                      <Alert.Content>
                        <Alert.Description>{preview.error}</Alert.Description>
                      </Alert.Content>
                    </Alert>
                  ) : (
                    <SpecialDrawPreview machine={preview.machine} />
                  )}
                </div>
              </Modal.Body>
              <Modal.Footer>
                <Button slot="close" variant="secondary">
                  取消
                </Button>
                <Button
                  variant="secondary"
                  isPending={saving}
                  onPress={() => void saveImported(false)}
                >
                  保存
                </Button>
                <Button
                  variant="primary"
                  isPending={saving}
                  onPress={() => void saveImported(true)}
                >
                  保存并应用
                </Button>
              </Modal.Footer>
            </Modal.Dialog>
          </Modal.Container>
        </Modal.Backdrop>
      </Modal>
    </>
  )
}
