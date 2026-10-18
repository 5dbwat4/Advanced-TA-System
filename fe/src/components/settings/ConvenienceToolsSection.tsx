import { Button, Tooltip } from '@heroui/react'
import { useNavigate } from 'react-router-dom'

import RefreshCw from '~icons/lucide/refresh-cw'
import Wrench from '~icons/lucide/wrench'
import { Card } from '@/components/ui/Card'
import { SectionHeader } from '@/components/ui/SectionHeader'

export function ConvenienceToolsSection({ index }: { index: number }) {
  const navigate = useNavigate()

  return (
    <Card index={index}>
      <SectionHeader icon={Wrench}>便捷工具</SectionHeader>

      <div className="mt-4">
        <Tooltip delay={150}>
          <Tooltip.Trigger className="block w-full">
            <Button
              fullWidth
              variant="secondary"
              className="justify-start"
              onPress={() => navigate('/console/courses/sync-scores')}
            >
              <RefreshCw width={16} height={16} className="shrink-0" />
              从学在浙大同步成绩
            </Button>
          </Tooltip.Trigger>
          <Tooltip.Content placement="bottom" showArrow className="max-w-xs">
            适用于先前已在使用学在浙大管理成绩的情况，快捷同步已存在于学在浙大的旧数据。
          </Tooltip.Content>
        </Tooltip>
      </div>
    </Card>
  )
}
