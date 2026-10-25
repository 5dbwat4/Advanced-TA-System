import { createOpenAICompatible } from '@ai-sdk/openai-compatible'
import { generateObject } from 'ai'
import { z } from 'zod'

import type { CheckoffQuestion } from '@/lib/api'
import type { AiConfig } from '@/lib/ai-config'
import { AI_ENABLED } from '@/lib/ai-feature'

const audioGradeSchema = z.object({
  score: z.number().min(0).max(100),
  comment: z.string(),
})

export type AiAudioGradeResult = z.infer<typeof audioGradeSchema>

export async function runAiAudioGrade({
  audio,
  mediaType,
  questions,
  config,
}: {
  audio: Uint8Array
  mediaType: string
  questions: Pick<CheckoffQuestion, 'question' | 'answer'>[]
  config: AiConfig
}): Promise<AiAudioGradeResult> {
  if (!AI_ENABLED) throw new Error('AI 功能未启用')

  if (config.demoMode) {
    return {
      score: 85,
      comment: '已生成听答评分，请根据实际表现人工调整分数与评语。',
    }
  }

  if (!config.apiKey) {
    throw new Error('请先在「设置 → AI 能力」中填写 API Key')
  }

  const provider = createOpenAICompatible({
    name: 'tasaas',
    baseURL: config.baseUrl || 'https://api.openai.com/v1',
    apiKey: config.apiKey,
  })
  const model = provider.chatModel(config.model || 'gpt-4o-mini')

  const questionText = questions
    .map(
      (question, index) =>
        `第 ${index + 1} 题：${question.question}\n参考答案：${question.answer}`,
    )
    .join('\n\n')

  const { object } = await generateObject({
    model,
    schema: audioGradeSchema,
    system: `你是课程助教，正在验收学生对本课程实验内容的口头回答。
请听音频并根据题目与参考答案评分：
- score 为 0-100 的整数，重点看概念是否准确、思路是否完整；
- comment 用 2-3 句简体中文写出主要优点和需要改进之处；
- 忽略与题目无关的闲聊，不要因为录音质量差而过度扣分。`,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: `本次验收题目：\n${questionText}\n\n请根据录音给出评分和评语。`,
          },
          {
            type: 'file',
            data: audio,
            mediaType,
            filename: 'answer.wav',
          },
        ],
      },
    ],
    temperature: 0,
  })

  return object
}
