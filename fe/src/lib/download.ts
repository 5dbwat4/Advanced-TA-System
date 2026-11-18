import { saveAs } from 'file-saver'
import filenamify from 'filenamify/browser'

/** 触发浏览器下载一个 Markdown 文件 */
export function downloadMarkdown(filename: string, content: string) {
  saveAs(new Blob([content], { type: 'text/markdown;charset=utf-8' }), filename)
}

/** 将题目集题目序列化为 Markdown（标题 + 每题题目/答案） */
export function bankQuestionsToMarkdown(
  name: string,
  questions: { question: string; answer: string }[],
): string {
  const body = questions
    .map(
      (item, index) =>
        `## ${index + 1}\n\n${item.question.trim()}\n\n**答案**\n\n${item.answer.trim()}`,
    )
    .join('\n\n---\n\n')
  return `# ${name}\n\n${body}\n`
}

/** 将题目集名称转为安全的文件名 */
export function bankFilename(name: string): string {
  return `${filenamify(name, { replacement: '_' })}.md`
}
