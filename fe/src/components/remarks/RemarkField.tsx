import { TextArea } from '@heroui/react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'

import { fetchRemark, saveRemark } from '@/lib/api'
import { getErrorMessage } from '@/lib/error'

/**
 * 每 (学生, 实验) 一条附言，供评语模板的 {@REMARK} 使用。
 * 切换学生时加载，停止输入后自动保存。
 */
export function RemarkField({
  stuId,
  experimentId,
  type,
  sync,
}: {
  stuId: string | null
  experimentId: string
  /** 附言类型：0=验收，1=实验报告 */
  type: number
  /** 「同步」时用他人保存的附言覆盖当前内容（nonce 变化触发一次） */
  sync?: { nonce: number; text: string }
}) {
  const [text, setText] = useState('')
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const savedRef = useRef('')

  useEffect(() => {
    if (!sync) return
    setText(sync.text)
  }, [sync])

  useEffect(() => {
    if (!stuId) {
      setText('')
      savedRef.current = ''
      return
    }
    let cancelled = false
    setLoading(true)
    fetchRemark(stuId, experimentId, type)
      .then((remark) => {
        if (cancelled) return
        const value = remark?.text ?? ''
        setText(value)
        savedRef.current = value
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [stuId, experimentId, type])

  const persist = useCallback(
    async (value: string) => {
      if (!stuId || value === savedRef.current) return
      setSaving(true)
      try {
        await saveRemark({ stuId, experimentId, type, text: value })
        savedRef.current = value
      } catch (error) {
        toast.error(getErrorMessage(error, '附言保存失败'))
      } finally {
        setSaving(false)
      }
    },
    [stuId, experimentId, type],
  )

  useEffect(() => {
    if (loading || !stuId || text === savedRef.current) return
    const timer = window.setTimeout(() => void persist(text), 800)
    return () => window.clearTimeout(timer)
  }, [text, loading, stuId, persist])

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-semibold text-fg-muted">附言</span>
        {saving ? <span className="text-[11px] text-fg-subtle">保存中…</span> : null}
      </div>
      <TextArea
        rows={3}
        value={text}
        disabled={loading || !stuId}
        placeholder={stuId ? '可以是评价、说明、鼓励等等' : '请先选择学生'}
        aria-label="附言"
        style={{ resize: 'vertical' }}
        onChange={(event) => setText(event.target.value)}
      />
    </div>
  )
}
