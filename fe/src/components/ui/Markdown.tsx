import ReactMarkdown from 'react-markdown'
import rehypeKatex from 'rehype-katex'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'

import 'github-markdown-css/github-markdown.css'
import 'katex/dist/katex.min.css'

import { useAuth } from '@/lib/auth'
import type { MarkdownStyleId } from '@/lib/api'

const remarkPlugins = [remarkGfm, remarkMath]
const rehypePlugins = [rehypeKatex]

export function Markdown({ source, style }: { source: string; style?: MarkdownStyleId }) {
  const { user } = useAuth()
  const resolvedStyle = style ?? user?.preferences?.markdownStyle ?? 'github'

  if (resolvedStyle === 'prose') {
    return (
      <div className="prose dark:prose-invert max-w-none">
        <ReactMarkdown remarkPlugins={remarkPlugins} rehypePlugins={rehypePlugins}>
          {source}
        </ReactMarkdown>
      </div>
    )
  }

  return (
    <div className="markdown-body">
      <ReactMarkdown remarkPlugins={remarkPlugins} rehypePlugins={rehypePlugins}>
        {source}
      </ReactMarkdown>
    </div>
  )
}
