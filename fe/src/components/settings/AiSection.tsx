import { Input, Switch } from '@heroui/react'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'

import Check from '~icons/lucide/check'
import Sparkles from '~icons/lucide/sparkles'
import { PreferenceRow } from '@/components/settings/PreferenceRow'
import { Card } from '@/components/ui/Card'
import { PendingButton } from '@/components/ui/PendingButton'
import { SectionHeader } from '@/components/ui/SectionHeader'
import { useAiConfig, useAiConfigStore } from '@/lib/ai-config'
import { useAuth } from '@/lib/auth'

export function AiSection({ index = 0 }: { index?: number }) {
  const { user } = useAuth()
  const saved = useAiConfig(user?.id)
  const saveConfig = useAiConfigStore((state) => state.save)

  const [apiKey, setApiKey] = useState(saved.apiKey)
  const [baseUrl, setBaseUrl] = useState(saved.baseUrl)
  const [model, setModel] = useState(saved.model)
  const [demoMode, setDemoMode] = useState(saved.demoMode)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setApiKey(saved.apiKey)
    setBaseUrl(saved.baseUrl)
    setModel(saved.model)
    setDemoMode(saved.demoMode)
  }, [user?.id, saved.apiKey, saved.baseUrl, saved.model, saved.demoMode])

  const nextConfig = {
    apiKey: apiKey.trim(),
    baseUrl: baseUrl.trim(),
    model: model.trim(),
    demoMode,
  }

  const dirty =
    nextConfig.apiKey !== saved.apiKey ||
    nextConfig.baseUrl !== saved.baseUrl ||
    nextConfig.model !== saved.model ||
    nextConfig.demoMode !== saved.demoMode

  const save = () => {
    setSaving(true)
    try {
      saveConfig(user?.id ?? null, nextConfig)
      toast.success('AI 能力设置已保存')
    } catch {
      toast.error('保存失败')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card index={index} className="flex flex-col gap-5">
      <SectionHeader icon={Sparkles}>AI 能力</SectionHeader>

      <p className="text-xs leading-relaxed text-fg-subtle">
        配置兼容 OpenAI 接口的模型服务后，可使用 AI 辅助功能。三项配置均为可选，配置仅保存在当前浏览器。
      </p>

      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-semibold text-fg-muted">API Key</label>
        <Input
          fullWidth
          type="password"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          placeholder="sk-..."
          autoComplete="off"
          maxLength={512}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-semibold text-fg-muted">Base URL</label>
          <Input
            fullWidth
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
            placeholder="https://api.openai.com/v1"
            autoComplete="off"
            maxLength={2048}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-semibold text-fg-muted">模型名称</label>
          <Input
            fullWidth
            value={model}
            onChange={(e) => setModel(e.target.value)}
            placeholder="gpt-4o-mini"
            autoComplete="off"
            maxLength={128}
          />
        </div>
      </div>

      <PreferenceRow
        title="演示模式"
        hint="开启后 AI 仅使用内置演示数据，不调用真实模型"
      >
        <Switch aria-label="演示模式" isSelected={demoMode} onChange={setDemoMode}>
          <Switch.Content>
            <Switch.Control>
              <Switch.Thumb />
            </Switch.Control>
          </Switch.Content>
        </Switch>
      </PreferenceRow>

      <div className="flex justify-end">
        <PendingButton
          size="sm"
          isDisabled={!dirty}
          isPending={saving}
          onPress={save}
          icon={Check}
        >
          保存设置
        </PendingButton>
      </div>
    </Card>
  )
}
