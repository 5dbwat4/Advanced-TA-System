import { Button, Dropdown, Label, Tabs } from '@heroui/react'
import { useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'
import Ellipsis from '~icons/lucide/ellipsis'
import Tags from '~icons/lucide/tags'

import { PageHeader } from '@/components/ui/PageHeader'
import { getErrorMessage } from '@/lib/error'
import { useTags } from '@/lib/query'

import { QuestionsPanel } from './QuestionsPanel'
import { SetsPanel } from './SetsPanel'

export default function Questions() {
  const [params, setParams] = useSearchParams()
  const navigate = useNavigate()
  const tab = params.get('tab') === 'sets' ? 'sets' : 'questions'
  const { data: tags = [], error: tagError } = useTags()

  useEffect(() => {
    if (tagError) toast.error(getErrorMessage(tagError, '加载标签失败'))
  }, [tagError])

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader title="题库" />

      <Tabs
        selectedKey={tab}
        onSelectionChange={(key) =>
          setParams(key === 'sets' ? { tab: 'sets' } : {}, { replace: true })
        }
      >
        <div className="flex items-center gap-2">
          <Tabs.ListContainer className="flex-1">
            <Tabs.List aria-label="题库视图" className="w-full whitespace-nowrap">
              <Tabs.Tab id="questions">
                题目
                <Tabs.Indicator />
              </Tabs.Tab>
              <Tabs.Tab id="sets">
                题目集
                <Tabs.Indicator />
              </Tabs.Tab>
            </Tabs.List>
          </Tabs.ListContainer>
          <Dropdown>
            <Button isIconOnly size="sm" variant="ghost" aria-label="更多操作">
              <Ellipsis width={16} height={16} className="shrink-0" />
            </Button>
            <Dropdown.Popover>
              <Dropdown.Menu
                onAction={(key) => {
                  if (key === 'tags') navigate('/console/tag')
                }}
              >
                <Dropdown.Item id="tags" textValue="管理tag">
                  <Tags width={15} height={15} className="shrink-0 text-fg-muted" />
                  <Label>管理tag</Label>
                </Dropdown.Item>
              </Dropdown.Menu>
            </Dropdown.Popover>
          </Dropdown>
        </div>
        <Tabs.Panel id="questions" className="pt-4">
          <QuestionsPanel tags={tags} />
        </Tabs.Panel>
        <Tabs.Panel id="sets" className="pt-4">
          <SetsPanel tags={tags} />
        </Tabs.Panel>
      </Tabs>
    </div>
  )
}
