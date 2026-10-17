import { Button, Spinner } from '@heroui/react'
import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'

import ArrowLeft from '~icons/lucide/arrow-left'
import { fetchStudentExperiment, type StudentPreviewData } from '@/lib/api'
import { getErrorMessage } from '@/lib/error'
import { StudentPreviewContent } from '@/pages/StudentPreviewView'

export default function StudentExperiment() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const [data, setData] = useState<StudentPreviewData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    fetchStudentExperiment(id)
      .then((result) => {
        if (!cancelled) setData(result)
      })
      .catch((err) => {
        if (!cancelled) setError(getErrorMessage(err, '加载失败'))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [id])

  return (
    <div className="mx-auto max-w-3xl">
      <Button
        variant="ghost"
        size="sm"
        className="mb-3"
        onPress={() => navigate('/student-console')}
      >
        <ArrowLeft width={15} height={15} className="shrink-0" />
        返回概览
      </Button>

      {loading ? (
        <div className="flex justify-center py-20">
          <Spinner size="lg" />
        </div>
      ) : error ? (
        <div className="rounded-3xl border border-line bg-elevated/80 p-8 text-center text-sm text-danger">
          {error}
        </div>
      ) : data ? (
        <StudentPreviewContent data={data} />
      ) : null}
    </div>
  )
}
