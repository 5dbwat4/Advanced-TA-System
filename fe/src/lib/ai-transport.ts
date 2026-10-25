import { createOpenAICompatible } from '@ai-sdk/openai-compatible'
import { DirectChatTransport, ToolLoopAgent } from 'ai'
import { MockLanguageModelV3, simulateReadableStream } from 'ai/test'

import type { AiConfig } from '@/lib/ai-config'
import { demoReply } from '@/lib/ai-demo'
import { AI_ENABLED } from '@/lib/ai-feature'

const SYSTEM_PROMPT = `你是 ATASAAS 课程助教系统的站内助手。
只回答与课程助教系统使用、页面导航、实验、题库、验收、报告批改、成绩相关的问题。
使用简体中文，回答简洁、分步骤，必要时使用 Markdown 列表。
不要编造系统中不存在的功能；不确定时明确说明。`

function splitText(text: string): string[] {
  const chunks: string[] = []
  for (let index = 0; index < text.length; index += 18) {
    chunks.push(text.slice(index, index + 18))
  }
  return chunks
}

function lastUserText(prompt: unknown): string {
  if (!Array.isArray(prompt)) return ''
  for (let index = prompt.length - 1; index >= 0; index -= 1) {
    const message = prompt[index] as {
      role?: unknown
      content?: unknown
    }
    if (message?.role !== 'user') continue
    if (typeof message.content === 'string') return message.content
    if (Array.isArray(message.content)) {
      return message.content
        .map((part) => {
          if (!part || typeof part !== 'object') return ''
          const value = part as { type?: unknown; text?: unknown }
          return value.type === 'text' && typeof value.text === 'string' ? value.text : ''
        })
        .join(' ')
    }
  }
  return ''
}

function demoStream(text: string) {
  const id = 'demo-text'
  return {
    stream: simulateReadableStream({
      chunks: [
        { type: 'text-start' as const, id },
        ...splitText(text).map((delta) => ({ type: 'text-delta' as const, id, delta })),
        { type: 'text-end' as const, id },
        {
          type: 'finish' as const,
          finishReason: { unified: 'stop' as const, raw: 'stop' },
          usage: {
            inputTokens: { total: 0, noCache: 0, cacheRead: 0, cacheWrite: 0 },
            outputTokens: { total: 0, text: 0, reasoning: 0 },
          },
        },
      ],
      chunkDelayInMs: 12,
    }),
  }
}

function createDemoModel() {
  return new MockLanguageModelV3({
    provider: 'tasaas-demo',
    modelId: 'demo',
    doStream: async ({ prompt }) => demoStream(demoReply(lastUserText(prompt))),
  })
}

function createRemoteModel(config: AiConfig) {
  const provider = createOpenAICompatible({
    name: 'tasaas',
    baseURL: config.baseUrl || 'https://api.openai.com/v1',
    apiKey: config.apiKey || 'missing-api-key',
  })
  return provider.chatModel(config.model || 'gpt-4o-mini')
}

export function createAiTransport(config: AiConfig) {
  if (!AI_ENABLED) throw new Error('AI 功能未启用')

  const model =
    config.demoMode || !config.apiKey ? createDemoModel() : createRemoteModel(config)
  const agent = new ToolLoopAgent({
    model,
    instructions: SYSTEM_PROMPT,
    temperature: 0.2,
  })
  return new DirectChatTransport({ agent })
}
