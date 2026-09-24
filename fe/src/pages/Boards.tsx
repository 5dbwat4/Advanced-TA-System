import CircuitBoard from '~icons/lucide/circuit-board'
import { EmptyState } from '@/components/ui/Card'
import { PageHeader } from '@/components/ui/PageHeader'

export default function Boards() {
  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader title="开发板管理" />
      <EmptyState icon={CircuitBoard} title="暂无开发板" hint="点击新建开发板开始登记" />
    </div>
  )
}
