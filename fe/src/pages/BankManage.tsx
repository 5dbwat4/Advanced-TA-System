import { Skeleton } from '@heroui/react'
import { useNavigate, useParams } from 'react-router-dom'

import NotebookText from '~icons/lucide/notebook-text'
import { SetQuestionsEditor } from '@/components/questions/SetQuestionsEditor'
import { BackLink } from '@/components/ui/BackLink'
import { EmptyState } from '@/components/ui/Card'
import { PageHeader } from '@/components/ui/PageHeader'
import { listBanks } from '@/lib/api'
import { useAsyncData } from '@/lib/request'

export default function BankManage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()

  const { data: bank, loading } = useAsyncData(async () => {
    if (!id) return null
    const { banks } = await listBanks()
    return banks.find((item) => item.id === id) ?? null
  }, [id])

  return (
    <div className="w-full">
      <BackLink to={id ? `/console/questions/banks/${id}` : '/console/questions?tab=sets'}>
        返回题目集
      </BackLink>

      <PageHeader title={bank ? `管理题目 · ${bank.name}` : '管理题目'} />

      {loading ? (
        <Skeleton className="h-64 rounded-2xl" />
      ) : !bank ? (
        <EmptyState icon={NotebookText} title="题目集不存在" hint="它可能已被删除" />
      ) : (
        <div className="rounded-2xl border border-line bg-elevated p-6">
          <SetQuestionsEditor
            bank={bank}
            onSaved={() => navigate(`/console/questions/banks/${bank.id}`)}
          />
        </div>
      )}
    </div>
  )
}
