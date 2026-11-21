import { Button, Label, ListBox, Select, Spinner } from '@heroui/react'
import { Link } from 'react-router-dom'
import BookOpenCheck from '~icons/lucide/book-open-check'
import RefreshCw from '~icons/lucide/refresh-cw'

import { Card } from '@/components/ui/Card'
import { SectionHeader } from '@/components/ui/SectionHeader'
import type { ZjuamHomework } from '@/lib/api'
import { formatDateTime } from '@/lib/format'

type HomeworkSelectCardProps = {
  experimentId: string
  homeworks: ZjuamHomework[]
  loading: boolean
  activityId: string
  selectedHomework: ZjuamHomework | null
  onActivityChange: (id: string) => void
  onRefresh: () => void
}

export function HomeworkSelectCard({
  experimentId,
  homeworks,
  loading,
  activityId,
  selectedHomework,
  onActivityChange,
  onRefresh,
}: HomeworkSelectCardProps) {
  return (
    <Card index={1}>
      <SectionHeader icon={BookOpenCheck}>2. 选择学在浙大作业</SectionHeader>
      {!experimentId ? (
        <p className="mt-4 text-xs text-fg-subtle">请先选择本地实验。</p>
      ) : loading ? (
        <div className="mt-4 flex items-center gap-2 text-xs text-fg-subtle">
          <Spinner size="sm" />
          正在获取学在浙大作业…
        </div>
      ) : homeworks.length === 0 ? (
        <p className="mt-4 text-xs text-fg-subtle">
          该课程在学在浙大中没有可用的作业。
        </p>
      ) : (
        <div className="mt-4 flex flex-col gap-2">
          <div className="flex items-end gap-2">
            <div className="min-w-0 flex-1">
              <Label className="mb-1.5 block text-xs font-semibold text-fg-muted">
                旧作业
              </Label>
              <Select
                className="w-full"
                aria-label="选择学在浙大作业"
                value={activityId || null}
                placeholder="选择要同步的作业"
                onChange={(key) => onActivityChange(key == null ? '' : String(key))}
              >
                <Select.Trigger>
                  <Select.Value />
                  <Select.Indicator />
                </Select.Trigger>
                <Select.Popover>
                  <ListBox>
                    {homeworks.map((homework) => (
                      <ListBox.Item
                        key={homework.id}
                        id={String(homework.id)}
                        textValue={homework.title}
                      >
                        {homework.title}
                        <ListBox.ItemIndicator />
                      </ListBox.Item>
                    ))}
                  </ListBox>
                </Select.Popover>
              </Select>
            </div>
            <Button variant="secondary" isDisabled={loading} onPress={onRefresh}>
              <RefreshCw width={15} height={15} className="shrink-0" />
              重新获取
            </Button>
          </div>
          {selectedHomework && (
            <p className="text-[11px] text-fg-subtle">
              截止 {formatDateTime(selectedHomework.endTime, '未设置')} ·{' '}
              {selectedHomework.isClosed ? '已关闭' : '进行中'} · 已有成绩{' '}
              {selectedHomework.hasScoreCount} 人
            </p>
          )}
          <p className="text-[11px] text-fg-subtle">
            如果提示未保存统一身份认证密码，请先前往{' '}
            <Link
              to="/console/settings#zjuam"
              className="font-semibold text-brand-600 hover:underline dark:text-brand-300"
            >
              设置
            </Link>{' '}
            保存账号密码。
          </p>
        </div>
      )}
    </Card>
  )
}
