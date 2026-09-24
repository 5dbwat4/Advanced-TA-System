import { EmptyState } from '@/components/ui/Card'
import { PageHeader } from '@/components/ui/PageHeader'

export default function Reports() {
  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader title="实验报告" />
      <EmptyState icon="lucide:construction" title="建设中" hint="该功能正在开发中，敬请期待" />
    </div>
  )
}
