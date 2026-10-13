import { Button } from '@heroui/react'
import { useNavigate } from 'react-router-dom'

import ExternalLink from '~icons/lucide/external-link'
import FileText from '~icons/lucide/file-text'
import { Card } from '@/components/ui/Card'
import { PageHeader } from '@/components/ui/PageHeader'
import { thirdPartyLicenses } from '@/lib/third-party'

export default function Licenses() {
  const navigate = useNavigate()

  return (
    <>
      <PageHeader
        title="Third Party Dependencies"
        subtitle={`共 ${thirdPartyLicenses.length} 个构建依赖`}
        actions={
          <Button variant="secondary" onPress={() => navigate('/license/full')}>
            <FileText width={16} height={16} className="shrink-0" />
            查看许可证全文
          </Button>
        }
      />
      <Card index={0} className="flex flex-col gap-2">
        {thirdPartyLicenses.map((item) => (
          <div
            key={`${item.name}@${item.version}`}
            className="flex flex-col gap-2 rounded-xl border border-line bg-sunken px-3 py-2.5 [contain-intrinsic-size:auto_120px] [content-visibility:auto]"
          >
            <div className="flex items-center gap-3">
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold">{item.name}</div>
                <div className="tabular truncate text-xs text-fg-subtle">
                  {item.version || '—'}
                </div>
              </div>
              <span className="shrink-0 rounded-lg bg-brand-500/10 px-2 py-0.5 text-[11px] font-semibold text-brand-600 dark:text-brand-300">
                {item.license}
              </span>
            </div>
            {item.description && (
              <p className="line-clamp-2 text-xs text-fg-muted">{item.description}</p>
            )}
            {(item.author || item.homepage) && (
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-fg-subtle">
                {item.author && <span className="min-w-0 truncate">作者：{item.author}</span>}
                {item.homepage && (
                  <a
                    href={item.homepage}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex min-w-0 items-center gap-1 transition-colors hover:text-fg-muted"
                  >
                    <ExternalLink width={12} height={12} className="shrink-0" />
                    <span className="truncate">{item.homepage}</span>
                  </a>
                )}
              </div>
            )}
          </div>
        ))}
      </Card>
    </>
  )
}
