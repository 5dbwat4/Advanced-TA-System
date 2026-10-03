import { Button } from '@heroui/react'
import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'

import CircuitBoard from '~icons/lucide/circuit-board'
import { Card } from '@/components/ui/Card'
import { SectionHeader } from '@/components/ui/SectionHeader'
import { listDevBoards, type DevBoard } from '@/lib/api'
import { getErrorMessage } from '@/lib/error'
import { useCurrentClass } from '@/lib/store'

export function DevBoardsSection({ index = 0 }: { index?: number }) {
  const currentClass = useCurrentClass()
  const classId = currentClass?.id ?? null
  const navigate = useNavigate()

  const [boards, setBoards] = useState<DevBoard[]>([])
  const [loading, setLoading] = useState(false)

  const reload = useCallback(async () => {
    if (!classId) {
      setBoards([])
      return
    }
    setLoading(true)
    try {
      const data = await listDevBoards(classId)
      setBoards(data.devBoards)
    } catch (error) {
      toast.error(getErrorMessage(error, '加载开发板失败'))
    } finally {
      setLoading(false)
    }
  }, [classId])

  useEffect(() => {
    void reload()
  }, [reload])

  const borrowedCount = boards.filter((board) => board.borrowed).length

  return (
    <Card index={index}>
      <SectionHeader icon={CircuitBoard} busy={loading}>
        开发板
      </SectionHeader>

      {!classId ? (
        <p className="mt-3 text-xs text-fg-subtle">请先在右上角选择或绑定一个课程。</p>
      ) : (
        <div className="mt-4 flex flex-col gap-3">
          <div className="flex items-center justify-between gap-4 rounded-xl border border-line px-4 py-3">
            <div className="min-w-0">
              <div className="text-xs font-semibold text-fg-muted">
                共 <span className="tabular">{boards.length}</span> 块 · 已借出{' '}
                <span className="tabular">{borrowedCount}</span>
              </div>
              <div className="text-[11px] text-fg-subtle">
                登记开发板、借出 / 归还、批量导入与扫码
              </div>
            </div>
            <Button size="sm" variant="secondary" onPress={() => navigate('/console/boards')}>
              <CircuitBoard width={15} height={15} className="shrink-0" />
              管理开发板
            </Button>
          </div>
        </div>
      )}
    </Card>
  )
}
