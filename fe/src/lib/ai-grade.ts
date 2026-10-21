import { createOpenAICompatible } from '@ai-sdk/openai-compatible'
import { generateObject } from 'ai'
import { z } from 'zod'

import type { CriterionCard, CriterionExtras, CriterionItem } from '@/components/criteria/types'
import { fetchXzzdSubmissionAttachments } from '@/lib/api'
import type { AiConfig } from '@/lib/ai-config'
import { loadAttachmentBytes } from '@/components/reportgrade/cache'
import { fileExtension } from '@/components/reportgrade/shared'
import { extractPdfText } from '@/lib/pdf-text'

const MAX_PDF_BYTES = 20 * 1024 * 1024
const MAX_TEXT_CHARS = 60_000

const gradingSchema = z.object({
  cards: z.array(
    z.object({
      id: z.string(),
      selected: z.boolean(),
      appendix: z.string(),
    }),
  ),
})

export type AiGradeResult = z.infer<typeof gradingSchema>['cards'][number]

type FlatCard = { card: CriterionCard; section: string }

function collectCards(items: CriterionItem[], extras: CriterionExtras): FlatCard[] {
  const list: FlatCard[] = []
  for (const item of items) {
    if (item.type === 'card') {
      list.push({ card: item, section: '' })
      continue
    }
    for (const card of [...item.children, ...(extras[item.id] ?? [])]) {
      list.push({ card, section: item.title })
    }
  }
  for (const card of extras.root ?? []) list.push({ card, section: '' })
  return list
}

function criteriaPayload(cards: FlatCard[]) {
  return cards.map(({ card, section }) => ({
    id: card.id,
    section,
    mode: card.mode,
    rule: card.rule,
    detail: card.detail,
    score: card.score,
    scoreMax: card.scoreMax,
  }))
}

function demoGrade(cards: FlatCard[], text: string): AiGradeResult[] {
  const normalized = text.toLowerCase()
  return cards.map(({ card }) => {
    const tokens = `${card.rule} ${card.detail}`
      .toLowerCase()
      .split(/[^\p{L}\p{N}]+/u)
      .filter((token) => token.length >= 2)
    const matched = tokens.filter((token) => normalized.includes(token))
    const selected = card.defaultSelected || matched.length > 0
    return {
      id: card.id,
      selected,
      appendix: selected
        ? `演示模式：报告中出现「${matched[0] ?? card.rule}」相关表述`
        : '',
    }
  })
}

async function loadReport(experimentId: string, personId: number) {
  const { attachments } = await fetchXzzdSubmissionAttachments(experimentId, personId)
  const pdfs = attachments.filter((item) => fileExtension(item.name) === 'pdf')
  if (pdfs.length === 0) {
    throw new Error('该学生没有可用的 PDF 提交，无法进行 AI 预评分')
  }

  const files: { name: string; bytes: Uint8Array }[] = []
  let totalBytes = 0
  for (const attachment of pdfs) {
    if (totalBytes >= MAX_PDF_BYTES) break
    if (!attachment.url) continue
    const { bytes } = await loadAttachmentBytes(
      {
        id: attachment.id,
        name: attachment.name,
        size: attachment.size,
        url: attachment.url,
      },
      () => undefined,
    )
    if (totalBytes + bytes.length > MAX_PDF_BYTES) break
    totalBytes += bytes.length
    files.push({ name: attachment.name, bytes })
  }

  if (files.length === 0) {
    throw new Error('PDF 文件过大，无法发送给模型')
  }

  const texts: string[] = []
  for (const file of files) {
    try {
      const text = await extractPdfText(file.bytes)
      if (text) texts.push(`【${file.name}】\n${text}`)
    } catch {
      // 文本提取失败时仍然把 PDF 文件本身发给模型
    }
  }

  return { files, text: texts.join('\n\n').slice(0, MAX_TEXT_CHARS) }
}

function buildMessages(
  cards: FlatCard[],
  files: { name: string; bytes: Uint8Array }[],
  text: string,
  includeFiles: boolean,
) {
  const criteria = JSON.stringify(criteriaPayload(cards), null, 2)
  const content: Array<
    | { type: 'text'; text: string }
    | { type: 'file'; data: Uint8Array; mediaType: string; filename?: string }
  > = [
    {
      type: 'text',
      text: `评分标准（必须逐条判断，id 不可修改或遗漏）：\n${criteria}`,
    },
  ]

  if (includeFiles) {
    for (const file of files) {
      content.push({
        type: 'file',
        data: file.bytes,
        mediaType: 'application/pdf',
        filename: file.name,
      })
    }
  }

  if (text) {
    content.push({
      type: 'text',
      text: `从 PDF 中提取的文本（供参考，可能不完整）：\n${text}`,
    })
  }

  content.push({
    type: 'text',
    text: '请逐条判断每个 id 是否命中，并给出简短中文附言。',
  })

  return [
    {
      role: 'user' as const,
      content,
    },
  ]
}

export async function runAiGrade({
  experimentId,
  personId,
  items,
  extras,
  config,
}: {
  experimentId: string
  personId: number
  items: CriterionItem[]
  extras: CriterionExtras
  config: AiConfig
}): Promise<AiGradeResult[]> {
  const cards = collectCards(items, extras)
  if (cards.length === 0) {
    throw new Error('当前没有可用的评分标准')
  }

  const { files, text } = await loadReport(experimentId, personId)

  if (config.demoMode) {
    return demoGrade(cards, text)
  }

  if (!config.apiKey) {
    throw new Error('请先在「设置 → AI 能力」中填写 API Key，或开启演示模式')
  }

  const provider = createOpenAICompatible({
    name: 'tasaas',
    baseURL: config.baseUrl || 'https://api.openai.com/v1',
    apiKey: config.apiKey,
  })
  const model = provider.chatModel(config.model || 'gpt-4o-mini')
  const system = `你是一名课程助教，正在根据学生提交的报告和评分标准进行预评分。
对输入中的每一个评分标准 id 判断是否命中（selected）。
命中时用一句简短中文说明报告中的依据（appendix）；未命中时 appendix 为空字符串。
必须覆盖所有 id，不得新增、删除或修改 id。`

  try {
    const { object } = await generateObject({
      model,
      schema: gradingSchema,
      system,
      messages: buildMessages(cards, files, text, true),
      temperature: 0,
    })
    return object.cards
  } catch {
    const { object } = await generateObject({
      model,
      schema: gradingSchema,
      system,
      messages: buildMessages(cards, files, text, false),
      temperature: 0,
    })
    return object.cards
  }
}
