import {
  AssistantRuntimeProvider,
  ComposerPrimitive,
  MessagePrimitive,
  ThreadPrimitive,
} from '@assistant-ui/react'
import { useChatRuntime } from '@assistant-ui/react-ai-sdk'
import { MarkdownTextPrimitive } from '@assistant-ui/react-markdown'
import { Button } from '@heroui/react'
import { useMemo, useState } from 'react'

import Sparkles from '~icons/lucide/sparkles'
import X from '~icons/lucide/x'
import { useAiConfig } from '@/lib/ai-config'
import { DEMO_SUGGESTIONS } from '@/lib/ai-demo'
import { createAiTransport } from '@/lib/ai-transport'
import { useAuth } from '@/lib/auth'

function MarkdownText() {
  return (
    <MarkdownTextPrimitive className="prose prose-sm max-w-none text-fg dark:prose-invert" />
  )
}

function UserMessage() {
  return (
    <MessagePrimitive.Root className="flex justify-end py-2">
      <div className="max-w-[85%] rounded-2xl bg-brand-500/10 px-3 py-2 text-sm text-fg">
        <MessagePrimitive.Parts components={{ Text: MarkdownText }} />
      </div>
    </MessagePrimitive.Root>
  )
}

function AssistantMessage() {
  return (
    <MessagePrimitive.Root className="py-2">
      <div className="max-w-[92%] rounded-2xl border border-line bg-elevated px-3 py-2 text-sm leading-relaxed text-fg">
        <MessagePrimitive.Parts components={{ Text: MarkdownText }} />
        <MessagePrimitive.Error />
      </div>
    </MessagePrimitive.Root>
  )
}

function ChatPanel({ onClose }: { onClose: () => void }) {
  const { user } = useAuth()
  const ai = useAiConfig(user?.id)
  const usingDemo = ai.demoMode || !ai.apiKey

  const transport = useMemo(() => createAiTransport(ai), [ai])
  const runtime = useChatRuntime({ transport })

  const welcome = usingDemo
    ? '当前为演示模式，我只回答预置问题。试试下面的建议。'
    : '我是站内助手，可以帮你了解实验、题库、验收、报告批改和成绩相关操作。'

  return (
    <aside className="fixed inset-y-0 right-0 z-50 flex w-full max-w-[380px] flex-col border-l border-line bg-bg shadow-2xl">
      <header className="flex shrink-0 items-center gap-2 border-b border-line px-4 py-3">
        <Sparkles width={16} height={16} className="shrink-0 text-brand-600 dark:text-brand-300" />
        <div className="min-w-0 flex-1">
          <div className="text-sm font-bold">AI 助手</div>
          <div className="truncate text-[11px] text-fg-subtle">
            {usingDemo ? '演示模式 · 仅响应预置问题' : ai.model || '自定义模型'}
          </div>
        </div>
        <Button size="sm" variant="ghost" isIconOnly aria-label="关闭 AI 助手" onPress={onClose}>
          <X width={16} height={16} className="shrink-0" />
        </Button>
      </header>

      <div className="min-h-0 flex-1">
        <AssistantRuntimeProvider runtime={runtime}>
          <ThreadPrimitive.Root className="flex h-full flex-col">
            <ThreadPrimitive.Viewport
              autoScroll
              className="flex-1 overflow-y-auto px-4 py-3"
            >
              <ThreadPrimitive.Empty>
                <div className="flex flex-col gap-3 py-6">
                  <p className="text-xs leading-relaxed text-fg-subtle">{welcome}</p>
                  <div className="flex flex-col gap-2">
                    {DEMO_SUGGESTIONS.map((prompt) => (
                      <ThreadPrimitive.Suggestion
                        key={prompt}
                        prompt={prompt}
                        send
                        className="rounded-xl border border-line bg-elevated px-3 py-2 text-left text-xs font-medium text-fg-muted transition-colors hover:border-brand-500/40 hover:text-fg"
                      >
                        {prompt}
                      </ThreadPrimitive.Suggestion>
                    ))}
                  </div>
                </div>
              </ThreadPrimitive.Empty>
              <ThreadPrimitive.Messages components={{ UserMessage, AssistantMessage }} />
            </ThreadPrimitive.Viewport>

            <div className="shrink-0 border-t border-line p-3">
              <ComposerPrimitive.Root className="flex items-end gap-2 rounded-2xl border border-line bg-elevated p-2 focus-within:border-brand-500/50">
                <ComposerPrimitive.Input
                  className="max-h-32 min-h-9 flex-1 resize-none bg-transparent px-2 py-1.5 text-sm text-fg outline-none placeholder:text-fg-subtle"
                  placeholder="输入问题…"
                />
                <ComposerPrimitive.Send className="rounded-xl bg-brand-600 px-3 py-2 text-xs font-semibold text-white transition-opacity disabled:opacity-40">
                  发送
                </ComposerPrimitive.Send>
              </ComposerPrimitive.Root>
            </div>
          </ThreadPrimitive.Root>
        </AssistantRuntimeProvider>
      </div>
    </aside>
  )
}

export function AiAssistant() {
  const [open, setOpen] = useState(false)

  if (open) return <ChatPanel onClose={() => setOpen(false)} />

  return (
    <Button
      variant="primary"
      className="fixed bottom-24 right-4 z-40 rounded-full shadow-lg md:bottom-6 md:right-6"
      onPress={() => setOpen(true)}
      aria-label="打开 AI 助手"
    >
      <Sparkles width={16} height={16} className="shrink-0" />
      AI 助手
    </Button>
  )
}
