import { useEffect } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'

import ArrowLeft from '~icons/lucide/arrow-left'
import ArrowRight from '~icons/lucide/arrow-right'
import { DocsMarkdown } from '@/components/docs/DocsMarkdown'
import { DocsOutline } from '@/components/docs/DocsOutline'
import { DOC_MAP, DOCS } from '@/content/docs'

export default function DocArticle() {
  const { slug } = useParams()
  const doc = slug ? DOC_MAP.get(slug) : undefined

  useEffect(() => {
    if (!doc) return
    document.title = `${doc.title} · ATASAAS 文档`
    return () => {
      document.title = 'ATASAAS'
    }
  }, [doc])

  useEffect(() => {
    window.scrollTo(0, 0)
  }, [slug])

  if (!doc) return <Navigate to="/docs" replace />

  const index = DOCS.findIndex((item) => item.slug === doc.slug)
  const prev = index > 0 ? DOCS[index - 1] : undefined
  const next = index >= 0 && index < DOCS.length - 1 ? DOCS[index + 1] : undefined

  return (
    <div className="vp-page">
      <article className="vp-content">
        <h1 className="vp-title">{doc.title}</h1>
        <DocsMarkdown source={doc.content} />

        <nav className="vp-prev-next" aria-label="上一页 / 下一页">
          {prev ? (
            <Link to={`/docs/${prev.slug}`} className="vp-prev-next-item is-prev">
              <span className="vp-prev-next-label">
                <ArrowLeft width={13} height={13} className="shrink-0" />
                上一页
              </span>
              <span className="vp-prev-next-title">{prev.title}</span>
            </Link>
          ) : (
            <span />
          )}
          {next ? (
            <Link to={`/docs/${next.slug}`} className="vp-prev-next-item is-next">
              <span className="vp-prev-next-label">
                下一页
                <ArrowRight width={13} height={13} className="shrink-0" />
              </span>
              <span className="vp-prev-next-title">{next.title}</span>
            </Link>
          ) : (
            <span />
          )}
        </nav>
      </article>

      <DocsOutline headings={doc.headings} />
    </div>
  )
}
