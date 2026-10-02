import { Button, Input, Modal, useOverlayState } from '@heroui/react'
import copyToClipboard from 'copy-to-clipboard'
import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { toast } from 'sonner'

import ArrowLeft from '~icons/lucide/arrow-left'
import FileDown from '~icons/lucide/file-down'
import Save from '~icons/lucide/save'
import Share2 from '~icons/lucide/share-2'
import { CriteriaEditor } from '@/components/criteria/CriteriaEditor'
import type { CriterionItem } from '@/components/criteria/types'
import { PendingButton } from '@/components/ui/PendingButton'
import { fetchCriteria, saveCriteria } from '@/lib/api'
import { getErrorMessage } from '@/lib/error'

const SHARE_CODE_PATTERN = /^[0-9a-f]{48}$/i

export default function ReportCriteria() {
  const { id } = useParams<{ id: string }>()
  const importState = useOverlayState()

  const [items, setItems] = useState<CriterionItem[]>([])
  const [shareKey, setShareKey] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [importCode, setImportCode] = useState('')
  const [importing, setImporting] = useState(false)

  const save = async (): Promise<string | null> => {
    setSaving(true)
    try {
      const res = await saveCriteria({ version: 1, items })
      setShareKey(res.key)
      toast.success('已保存评分标准')
      return res.key
    } catch (err) {
      toast.error(getErrorMessage(err, '保存失败'))
      return null
    } finally {
      setSaving(false)
    }
  }

  const share = async () => {
    const key = shareKey ?? (await save())
    if (!key) return
    if (await copyToClipboard(key)) toast.success('分享码已复制')
    else toast.error('复制失败，请手动复制')
  }

  const doImport = async () => {
    const code = importCode.trim().toLowerCase()
    if (!SHARE_CODE_PATTERN.test(code)) {
      toast.error('分享码格式不正确')
      return
    }
    setImporting(true)
    try {
      const res = await fetchCriteria(code)
      const payload = res.payload as { items?: CriterionItem[] } | null
      if (!payload || !Array.isArray(payload.items)) {
        toast.error('评分标准内容无效')
        return
      }
      setItems(payload.items)
      setShareKey(code)
      importState.close()
      setImportCode('')
      toast.success('已导入评分标准')
    } catch (err) {
      toast.error(getErrorMessage(err, '导入失败'))
    } finally {
      setImporting(false)
    }
  }

  return (
    <div className="flex h-dvh flex-col overflow-hidden">
      <header className="flex h-14 shrink-0 items-center gap-3 border-b border-line bg-elevated/60 px-4 backdrop-blur-xl">
        <Link
          to={id ? `/console/reports/${id}` : '/console/reports'}
          className="inline-flex items-center gap-1 text-xs font-semibold text-fg-subtle transition-colors hover:text-fg"
        >
          <ArrowLeft width={14} height={14} className="shrink-0" />
          返回
        </Link>
        <div className="h-5 w-px bg-line" />
        <div className="min-w-0 flex-1 truncate text-sm font-bold">创建评分标准</div>
        <div className="flex shrink-0 items-center gap-2">
          <Button size="sm" variant="secondary" onPress={importState.open}>
            <FileDown width={15} height={15} className="shrink-0" />
            导入
          </Button>
          <Button size="sm" variant="secondary" onPress={() => void share()}>
            <Share2 width={15} height={15} className="shrink-0" />
            分享
          </Button>
          <PendingButton size="sm" isPending={saving} icon={Save} onPress={() => void save()}>
            保存
          </PendingButton>
        </div>
      </header>
      <div className="min-h-0 flex-1 overflow-auto">
        <div className="mx-auto w-full max-w-3xl p-4">
          <CriteriaEditor items={items} onChange={setItems} />
        </div>
      </div>

      <Modal state={importState}>
        <Modal.Backdrop>
          <Modal.Container>
            <Modal.Dialog className="sm:max-w-md">
              <Modal.CloseTrigger />
              <Modal.Header>
                <Modal.Icon className="bg-brand-500/10 text-brand-600 dark:text-brand-300">
                  <FileDown width={18} height={18} className="shrink-0" />
                </Modal.Icon>
                <Modal.Heading>导入评分标准</Modal.Heading>
              </Modal.Header>
              <Modal.Body>
                <Input
                  placeholder="输入 48 位分享码"
                  value={importCode}
                  onChange={(event) => setImportCode(event.target.value)}
                  aria-label="评分标准分享码"
                />
              </Modal.Body>
              <Modal.Footer>
                <Button variant="secondary" onPress={importState.close}>
                  取消
                </Button>
                <PendingButton
                  isPending={importing}
                  icon={FileDown}
                  isDisabled={importCode.trim() === ''}
                  onPress={() => void doImport()}
                >
                  导入
                </PendingButton>
              </Modal.Footer>
            </Modal.Dialog>
          </Modal.Container>
        </Modal.Backdrop>
      </Modal>
    </div>
  )
}
