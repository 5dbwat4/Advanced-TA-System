import { Button } from '@heroui/react'
import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'

import ChevronRight from '~icons/lucide/chevron-right'
import GitFork from '~icons/lucide/git-fork'
import Github from '~icons/lucide/github'
import History from '~icons/lucide/history'
import Package from '~icons/lucide/package'
import Sparkles from '~icons/lucide/sparkles'
import Star from '~icons/lucide/star'
import { Card } from '@/components/ui/Card'
import { SectionHeader } from '@/components/ui/SectionHeader'
import { formatDateTime } from '@/lib/format'

const OWNER = '5dbwat4'
const REPO = 'Advanced-TA-System'
const REPO_URL = `https://github.com/${OWNER}/${REPO}`
const STATS_CACHE_KEY = 'ta-console:credits:repo-stats'
const STATS_TTL = 60 * 60 * 1000

type RepoStats = { stars: number; forks: number }

function readCachedStats(): RepoStats | null {
  try {
    const raw = localStorage.getItem(STATS_CACHE_KEY)
    if (!raw) return null
    const cached = JSON.parse(raw) as { at?: unknown; stars?: unknown; forks?: unknown }
    if (
      typeof cached.at !== 'number' ||
      typeof cached.stars !== 'number' ||
      typeof cached.forks !== 'number' ||
      Date.now() - cached.at > STATS_TTL
    ) {
      return null
    }
    return { stars: cached.stars, forks: cached.forks }
  } catch {
    return null
  }
}

export function CreditsSection({ index = 0 }: { index?: number }) {
  const [stats, setStats] = useState<RepoStats | null>(readCachedStats)
  const navigate = useNavigate()

  useEffect(() => {
    if (readCachedStats()) return
    let cancelled = false
    fetch(`https://api.github.com/repos/${OWNER}/${REPO}`)
      .then((response) => (response.ok ? response.json() : null))
      .then((data: { stargazers_count?: number; forks_count?: number } | null) => {
        if (cancelled || !data) return
        const next = { stars: data.stargazers_count ?? 0, forks: data.forks_count ?? 0 }
        setStats(next)
        try {
          localStorage.setItem(STATS_CACHE_KEY, JSON.stringify({ at: Date.now(), ...next }))
        } catch {
          // storage unavailable — keep in-memory only
        }
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <Card index={index} className="flex flex-col gap-4">
      <SectionHeader icon={Sparkles}>Credits</SectionHeader>

      <div className="flex items-center justify-between gap-3 rounded-xl border border-line bg-sunken px-4 py-3">
        <span className="text-sm font-semibold text-fg">A 5dbwat4 Product</span>
        <a
          href={`https://github.com/${OWNER}`}
          target="_blank"
          rel="noreferrer"
          className="flex shrink-0 items-center gap-1.5 text-xs text-fg-muted transition-colors hover:text-fg"
        >
          <Github width={14} height={14} className="shrink-0" />@{OWNER}
        </a>
      </div>

      <div className="flex flex-col gap-3 rounded-xl border border-line bg-sunken px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 flex-col items-start gap-1.5 text-xs text-fg-muted">
          <div className="tabular">
            Current build <span className="font-semibold text-fg">{__BUILD_HASH__}</span>
          </div>
          <div className="tabular">Build time {formatDateTime(__BUILD_TIME__)}</div>
          <Button
            size="sm"
            variant="secondary"
            onPress={() => navigate('/changelog')}
          >
            <History width={14} height={14} className="shrink-0" />
            View changelog
          </Button>
        </div>
        <div className="flex shrink-0 flex-col gap-1.5 sm:items-end">
          <a
            href={REPO_URL}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1.5 text-xs text-fg-muted transition-colors hover:text-fg"
          >
            <Github width={14} height={14} className="shrink-0" />
            {OWNER}/{REPO}
          </a>
          <div className="flex items-center gap-3 text-xs text-fg-subtle">
            <span className="flex items-center gap-1">
              <Star width={12} height={12} className="shrink-0" />
              {stats ? stats.stars : '—'}
            </span>
            <span className="flex items-center gap-1">
              <GitFork width={12} height={12} className="shrink-0" />
              {stats ? stats.forks : '—'}
            </span>
          </div>
        </div>
      </div>

      <Link
        to="/license"
        className="flex w-full items-center justify-between gap-3 rounded-xl border border-line bg-sunken px-4 py-3 text-left transition-colors hover:border-brand-500/40"
      >
        <span className="flex items-center gap-2 text-sm font-semibold text-fg">
          <Package width={16} height={16} className="shrink-0 text-fg-muted" />
          third party licenses
        </span>
        <ChevronRight width={18} height={18} className="shrink-0 text-fg-subtle" />
      </Link>
    </Card>
  )
}
