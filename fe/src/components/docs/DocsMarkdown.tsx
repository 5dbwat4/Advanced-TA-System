import type { ReactNode } from 'react'
import ReactMarkdown from 'react-markdown'
import type { Components } from 'react-markdown'
import { Link } from 'react-router-dom'
import rehypeKatex from 'rehype-katex'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'

import { slugify } from '@/content/docs'

import 'katex/dist/katex.min.css'

function nodeText(node: ReactNode): string {
  if (node === null || node === undefined || typeof node === 'boolean') return ''
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(nodeText).join('')
  if (typeof node === 'object' && 'props' in node) {
    return nodeText((node as { props?: { children?: ReactNode } }).props?.children)
  }
  return ''
}

function heading(level: 1 | 2 | 3 | 4 | 5 | 6) {
  const Tag = `h${level}` as const
  return function Heading({ children }: { children?: ReactNode }) {
    const id = slugify(nodeText(children))
    return (
      <Tag id={id}>
        <a className="vp-heading-anchor" href={`#${id}`} aria-hidden="true" tabIndex={-1}>
          #
        </a>
        {children}
      </Tag>
    )
  }
}

const components: Components = {
  h1: heading(1),
  h2: heading(2),
  h3: heading(3),
  h4: heading(4),
  h5: heading(5),
  h6: heading(6),
  a: ({ href, children }) => {
    if (!href) return <span>{children}</span>
    if (href.startsWith('#') || href.startsWith('/')) {
      return <Link to={href}>{children}</Link>
    }
    return (
      <a href={href} target="_blank" rel="noreferrer">
        {children}
      </a>
    )
  },
  img: ({ src, alt }) => <img src={src} alt={alt ?? ''} loading="lazy" />,
}

export function DocsMarkdown({ source }: { source: string }) {
  return (
    <div className="prose dark:prose-invert vp-doc max-w-none">
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeKatex]}
        components={components}
      >
        {source}
      </ReactMarkdown>
    </div>
  )
}
