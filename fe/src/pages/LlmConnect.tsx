import { Accordion, Button, Checkbox, Input, Modal, Spinner, useOverlayState } from '@heroui/react'
import copyToClipboard from 'copy-to-clipboard'
import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'

import BookOpen from '~icons/lucide/book-open'
import ChevronDown from '~icons/lucide/chevron-down'
import Copy from '~icons/lucide/copy'
import KeyRound from '~icons/lucide/key-round'
import Plus from '~icons/lucide/plus'
import ScrollText from '~icons/lucide/scroll-text'
import Sparkles from '~icons/lucide/sparkles'
import Trash2 from '~icons/lucide/trash-2'
import TriangleAlert from '~icons/lucide/triangle-alert'
import { Card, EmptyState } from '@/components/ui/Card'
import { PageHeader } from '@/components/ui/PageHeader'
import { PendingButton } from '@/components/ui/PendingButton'
import {
  createToken,
  listAuditLogs,
  listTokens,
  revokeToken,
  type McpAuditLog,
  type McpScope,
  type PersonalAccessToken,
} from '@/lib/api'
import { getErrorMessage } from '@/lib/error'
import { cn } from '@/lib/utils'

const SCOPE_OPTIONS: { value: McpScope; label: string; desc: string }[] = [
  { value: 'questions:read', label: '读取题目', desc: '搜索、查看题目' },
  { value: 'questions:write', label: '编辑题目', desc: '新建 / 修改 / 删除 / 复制' },
  { value: 'banks:read', label: '读取题目集', desc: '查看题目集与其中题目' },
  { value: 'banks:write', label: '编辑题目集', desc: '新建 / 重命名 / 删除 / 调整' },
  { value: 'experiments:read', label: '读取实验', desc: '列出班级实验与绑定题目集' },
]

const TOOL_LABELS: Record<string, string> = {
  search_questions: '搜索题目',
  get_question: '获取题目',
  create_question: '新建题目',
  update_question: '更新题目',
  duplicate_question: '复制题目',
  delete_question: '删除题目',
  list_banks: '列出题目集',
  get_bank: '获取题目集',
  create_bank: '新建题目集',
  rename_bank: '重命名题目集',
  duplicate_bank: '复制题目集',
  delete_bank: '删除题目集',
  add_bank_questions: '向题目集追加题目',
  remove_bank_questions: '从题目集移除题目',
  set_bank_questions: '设置题目集题目',
  list_experiments: '列出实验',
}

const inputClass =
  'w-full rounded-xl border border-line bg-elevated px-4 py-3 text-sm text-fg placeholder:text-fg-subtle outline-none transition-all focus:border-brand-500 focus:ring-4 focus:ring-brand-500/15'

const EXPIRY_OPTIONS = [
  { value: 30, label: '30 天' },
  { value: 90, label: '90 天' },
  { value: 365, label: '1 年' },
  { value: 0, label: '永不过期' },
]

async function copyText(text: string, label: string) {
  const ok = await copyToClipboard(text)
  if (ok) toast.success(`已复制${label}`)
  else toast.error('复制失败')
}

function formatDate(value: string | null): string {
  return value ? new Date(value).toLocaleString() : '—'
}

export default function LlmConnect() {
  const [tokens, setTokens] = useState<PersonalAccessToken[]>([])
  const [loading, setLoading] = useState(true)
  const [auditLogs, setAuditLogs] = useState<McpAuditLog[]>([])
  const [auditLoading, setAuditLoading] = useState(true)
  const [name, setName] = useState('')
  const [scopes, setScopes] = useState<McpScope[]>(['questions:read', 'banks:read'])
  const [expiry, setExpiry] = useState(90)
  const [saving, setSaving] = useState(false)
  const [newToken, setNewToken] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  const endpoint = `${window.location.origin}/mcp`

  const createState = useOverlayState({
    onOpenChange: (open) => {
      if (!open) {
        setName('')
        setScopes(['questions:read', 'banks:read'])
        setExpiry(90)
        setNewToken(null)
      }
    },
  })

  const token = newToken ?? 'tasaas_xxxxxxxx_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx'

  const agentPrompt = `请把本 MCP 服务器接入你自己的配置，名称为 tasaas（传输方式：Streamable HTTP）：
- URL：${endpoint}
- 请求头：Authorization: Bearer ${token}

配置完成后，列出 tasaas 提供的工具，并告诉我可以调用哪些能力（读写题库、题目集）。`

  const reload = useCallback(async () => {
    try {
      const data = await listTokens()
      setTokens(data.tokens)
    } catch (error) {
      toast.error(getErrorMessage(error, '加载失败'))
    }
  }, [])

  const reloadAudit = useCallback(async () => {
    try {
      const data = await listAuditLogs()
      setAuditLogs(data.logs)
    } catch (error) {
      toast.error(getErrorMessage(error, '加载失败'))
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    const run = async () => {
      try {
        const [tokenData, auditData] = await Promise.all([listTokens(), listAuditLogs()])
        if (cancelled) return
        setTokens(tokenData.tokens)
        setAuditLogs(auditData.logs)
      } catch (error) {
        if (!cancelled) toast.error(getErrorMessage(error, '加载失败'))
      } finally {
        if (!cancelled) {
          setLoading(false)
          setAuditLoading(false)
        }
      }
    }
    run()
    return () => {
      cancelled = true
    }
  }, [])

  const toggleScope = (scope: McpScope) => {
    setScopes((prev) =>
      prev.includes(scope) ? prev.filter((item) => item !== scope) : [...prev, scope],
    )
  }

  const submit = async () => {
    if (!name.trim() || scopes.length === 0) return
    setSaving(true)
    try {
      const data = await createToken({
        name: name.trim(),
        scopes,
        ...(expiry > 0 ? { expiresInDays: expiry } : {}),
      })
      setNewToken(data.token)
      toast.success('已创建令牌')
      await reload()
    } catch (error) {
      toast.error(getErrorMessage(error, '创建失败'))
    } finally {
      setSaving(false)
    }
  }

  const revoke = async (id: string) => {
    setBusyId(id)
    try {
      await revokeToken(id)
      toast.success('已撤销令牌')
      await reload()
      await reloadAudit()
    } catch (error) {
      toast.error(getErrorMessage(error, '撤销失败'))
    } finally {
      setBusyId(null)
    }
  }

  const tokenNames = new Map(tokens.map((item) => [item.id, item.name]))

  const clientGuides: {
    id: string
    name: string
    file: string
    note?: string
    language: 'json' | 'shell'
    code: string
    extra?: string
  }[] = [
    {
      id: 'opencode',
      name: 'opencode',
      file: 'opencode.json（项目）或 ~/.config/opencode/opencode.json',
      note: '本服务用访问令牌而非 OAuth，需设 "oauth": false 才会使用静态请求头。',
      language: 'json',
      code: JSON.stringify(
        {
          $schema: 'https://opencode.ai/config.json',
          mcp: {
            tasaas: {
              type: 'remote',
              url: endpoint,
              enabled: true,
              oauth: false,
              headers: { Authorization: `Bearer ${token}` },
            },
          },
        },
        null,
        2,
      ),
    },
    {
      id: 'cursor',
      name: 'Cursor',
      file: '~/.cursor/mcp.json',
      language: 'json',
      code: JSON.stringify(
        {
          mcpServers: {
            tasaas: { url: endpoint, headers: { Authorization: `Bearer ${token}` } },
          },
        },
        null,
        2,
      ),
    },
    {
      id: 'vscode',
      name: 'VS Code',
      file: '.vscode/mcp.json（用户级：命令面板 → MCP: Open User Configuration）',
      note: 'VS Code 用顶层 servers，远程服务器需显式写 "type": "http"。',
      language: 'json',
      code: JSON.stringify(
        {
          servers: {
            tasaas: { type: 'http', url: endpoint, headers: { Authorization: `Bearer ${token}` } },
          },
        },
        null,
        2,
      ),
    },
    {
      id: 'claude-code',
      name: 'Claude Code',
      file: '.mcp.json（项目）或 ~/.claude.json',
      note: '带 url 的条目必须写 "type": "http"，否则会被当成 stdio。也可直接用命令行：',
      language: 'json',
      code: JSON.stringify(
        {
          mcpServers: {
            tasaas: { type: 'http', url: endpoint, headers: { Authorization: `Bearer ${token}` } },
          },
        },
        null,
        2,
      ),
      extra: `claude mcp add --transport http tasaas ${endpoint} --header "Authorization: Bearer ${token}"`,
    },
    {
      id: 'cline',
      name: 'Cline',
      file: 'cline_mcp_settings.json（IDE 扩展）或 ~/.cline/mcp.json（CLI）',
      note: 'type 必须显式设为 "streamableHttp"（省略会退回旧的 SSE）。',
      language: 'json',
      code: JSON.stringify(
        {
          mcpServers: {
            tasaas: {
              type: 'streamableHttp',
              url: endpoint,
              headers: { Authorization: `Bearer ${token}` },
              disabled: false,
              autoApprove: [],
            },
          },
        },
        null,
        2,
      ),
    },
    {
      id: 'windsurf',
      name: 'Windsurf (Cascade)',
      file: '~/.codeium/windsurf/mcp_config.json',
      language: 'json',
      code: JSON.stringify(
        {
          mcpServers: {
            tasaas: { serverUrl: endpoint, headers: { Authorization: `Bearer ${token}` } },
          },
        },
        null,
        2,
      ),
    },
    {
      id: 'zed',
      name: 'Zed',
      file: 'settings.json（Settings → AI → MCP Servers）',
      language: 'json',
      code: JSON.stringify(
        {
          context_servers: {
            tasaas: { url: endpoint, headers: { Authorization: `Bearer ${token}` } },
          },
        },
        null,
        2,
      ),
    },
    {
      id: 'claude-desktop',
      name: 'Claude Desktop',
      file: 'claude_desktop_config.json',
      note: '需已安装 Node，经 mcp-remote 桥接（Claude Desktop 不支持自定义请求头）。',
      language: 'json',
      code: JSON.stringify(
        {
          mcpServers: {
            tasaas: {
              command: 'npx',
              args: ['mcp-remote', endpoint, '--header', `Authorization: Bearer ${token}`],
            },
          },
        },
        null,
        2,
      ),
    },
  ]

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="连接你的Agent" />

      <div className="space-y-4">
        <Card index={0} className="flex flex-col gap-5">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-sm font-bold">
              <KeyRound width={16} height={16} className="shrink-0 text-brand-600 dark:text-brand-300" />
              访问令牌
            </div>
            <Button size="sm" variant="primary" onPress={createState.open}>
              <Plus width={15} height={15} className="shrink-0" />
              新建令牌
            </Button>
          </div>

          {loading ? (
            <div className="flex items-center gap-2 py-4 text-xs text-fg-subtle">
              <Spinner size="sm" />
              加载中…
            </div>
          ) : tokens.length === 0 ? (
            <EmptyState icon={KeyRound} title="暂无令牌" hint="点击右上角新建一个" />
          ) : (
            <div className="flex flex-col gap-2">
              {tokens.map((item) => {
                const revoked = Boolean(item.revokedAt)
                return (
                  <div
                    key={item.id}
                    className={cn(
                      'flex flex-col gap-2 rounded-xl border border-line px-3 py-2.5',
                      revoked && 'opacity-60',
                    )}
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-semibold text-fg">{item.name}</span>
                      <code className="rounded-lg border border-line bg-sunken px-2 py-0.5 font-mono text-[11px] text-fg-muted">
                        {item.prefix}…
                      </code>
                      <span className="text-[11px] text-fg-subtle">
                        创建 {formatDate(item.createdAt)} · 最近使用 {formatDate(item.lastUsedAt)}
                      </span>
                      {item.expiresAt && (
                        <span className="text-[11px] text-fg-subtle">
                          过期 {formatDate(item.expiresAt)}
                        </span>
                      )}
                      {revoked && (
                        <span className="rounded-lg bg-danger/10 px-2 py-0.5 text-[11px] font-semibold text-danger">
                          已撤销
                        </span>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center justify-end gap-1">
                      <div className="flex flex-wrap gap-1">
                        {item.scopes.map((scope) => (
                          <span
                            key={scope}
                            className="rounded-md bg-brand-500/10 px-1.5 py-0.5 text-[10px] font-medium text-brand-600 dark:text-brand-300"
                          >
                            {scope}
                          </span>
                        ))}
                      </div>
                      {!revoked && (
                        <PendingButton
                          size="sm"
                          variant="ghost"
                          isPending={busyId === item.id}
                          onPress={() => revoke(item.id)}
                          icon={Trash2}
                        >
                          撤销
                        </PendingButton>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </Card>

        <Card index={1} className="flex flex-col gap-4">
          <div className="flex items-center gap-2 text-sm font-bold">
            <ScrollText width={16} height={16} className="shrink-0 text-brand-600 dark:text-brand-300" />
            审计日志
          </div>

          {auditLoading ? (
            <div className="flex items-center gap-2 py-4 text-xs text-fg-subtle">
              <Spinner size="sm" />
              加载中…
            </div>
          ) : auditLogs.length === 0 ? (
            <EmptyState icon={ScrollText} title="暂无调用记录" />
          ) : (
            <div className="flex flex-col gap-2">
              {auditLogs.map((log) => (
                <div
                  key={log.id}
                  className="flex flex-wrap items-center gap-2 rounded-xl border border-line px-3 py-2.5"
                >
                  <span
                    className={cn(
                      'rounded-lg px-2 py-0.5 text-[11px] font-semibold',
                      log.ok ? 'bg-success/10 text-success' : 'bg-danger/10 text-danger',
                    )}
                  >
                    {log.ok ? '成功' : '失败'}
                  </span>
                  <span className="text-sm font-semibold text-fg">
                    {TOOL_LABELS[log.tool] ?? log.tool}
                  </span>
                  {log.tokenId && tokenNames.has(log.tokenId) && (
                    <span className="text-[11px] text-fg-subtle">{tokenNames.get(log.tokenId)}</span>
                  )}
                  {log.message && (
                    <span className="min-w-0 flex-1 truncate text-[11px] text-danger">
                      {log.message}
                    </span>
                  )}
                  <span className="ml-auto text-[11px] text-fg-subtle">
                    {formatDate(log.createdAt)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card index={2} className="flex flex-col gap-4">
          <div className="flex items-center gap-2 text-sm font-bold">
            <BookOpen width={16} height={16} className="shrink-0 text-brand-600 dark:text-brand-300" />
            使用说明
          </div>
        </Card>
      </div>

      <Modal state={createState}>
        <Modal.Backdrop>
          <Modal.Container>
            <Modal.Dialog className="sm:max-w-2xl">
              <Modal.CloseTrigger />
              <Modal.Header>
                <Modal.Icon className="bg-brand-500/10 text-brand-600 dark:text-brand-300">
                  {newToken ? (
                    <Sparkles width={18} height={18} className="shrink-0" />
                  ) : (
                    <KeyRound width={18} height={18} className="shrink-0" />
                  )}
                </Modal.Icon>
                <Modal.Heading>{newToken ? '令牌已创建' : '新建访问令牌'}</Modal.Heading>
              </Modal.Header>
              <Modal.Body className="flex flex-col gap-4">
                {newToken ? (
                  <>
                    <div className="rounded-xl border border-brand-500/40 bg-brand-500/5 p-4">
                      <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-brand-600 dark:text-brand-300">
                        <TriangleAlert width={14} height={14} className="shrink-0" />
                        此令牌只显示一次，请立即复制保存
                      </div>
                      <div className="flex items-center gap-2">
                        <code className="min-w-0 flex-1 break-all rounded-lg border border-line bg-elevated px-3 py-2 font-mono text-xs text-fg">
                          {newToken}
                        </code>
                        <Button
                          isIconOnly
                          size="sm"
                          variant="secondary"
                          aria-label="复制令牌"
                          onPress={() => copyText(newToken, '令牌')}
                        >
                          <Copy width={15} height={15} className="shrink-0" />
                        </Button>
                      </div>
                    </div>

                    <div className="flex flex-col gap-2">
                      <div className="text-xs font-semibold text-fg-muted">让 Agent 自行配置</div>
                      <div className="flex items-start gap-2">
                        <pre className="min-w-0 flex-1 overflow-auto whitespace-pre-wrap rounded-xl border border-line bg-sunken p-3 font-mono text-[11px] text-fg">
                          {agentPrompt}
                        </pre>
                        <Button
                          isIconOnly
                          size="sm"
                          variant="ghost"
                          aria-label="复制提示词"
                          onPress={() => copyText(agentPrompt, '提示词')}
                        >
                                      <Copy width={14} height={14} className="shrink-0" />
                        </Button>
                      </div>
                    </div>

                    <div className="flex flex-col gap-2">
                      <div className="text-xs font-semibold text-fg-muted">或手动配置客户端</div>
                      <Accordion allowsMultipleExpanded variant="surface" className="w-full">
                        {clientGuides.map((guide) => (
                          <Accordion.Item key={guide.id} id={guide.id}>
                            <Accordion.Heading>
                              <Accordion.Trigger>
                                {guide.name}
                                <Accordion.Indicator>
                                   <ChevronDown width={16} height={16} className="shrink-0" />
                                </Accordion.Indicator>
                              </Accordion.Trigger>
                            </Accordion.Heading>
                            <Accordion.Panel>
                              <Accordion.Body className="flex flex-col gap-2">
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className="min-w-0 flex-1 truncate text-[11px] text-fg-subtle">
                                    {guide.file}
                                  </span>
                                  <span className="rounded-md border border-line bg-sunken px-1.5 py-0.5 text-[10px] font-semibold uppercase text-fg-muted">
                                    {guide.language === 'json' ? 'JSON' : 'Shell'}
                                  </span>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    onPress={() => copyText(guide.code, `${guide.name} 配置`)}
                                  >
                                    <Copy width={14} height={14} className="shrink-0" />
                                    复制
                                  </Button>
                                </div>
                                {guide.note && (
                                  <p className="text-[11px] leading-relaxed text-fg-subtle">
                                    {guide.note}
                                  </p>
                                )}
                                <pre className="overflow-auto rounded-xl border border-line bg-sunken p-3 font-mono text-[11px] text-fg">
                                  {guide.code}
                                </pre>
                                {guide.extra && (
                                  <div className="flex items-start gap-2">
                                    <pre className="min-w-0 flex-1 overflow-auto rounded-xl border border-line bg-sunken p-3 font-mono text-[11px] text-fg">
                                      {guide.extra}
                                    </pre>
                                    <Button
                                      isIconOnly
                                      size="sm"
                                      variant="ghost"
                                      aria-label="复制命令"
                                      onPress={() => copyText(guide.extra ?? '', '命令')}
                                    >
                          <Copy width={14} height={14} className="shrink-0" />
                                    </Button>
                                  </div>
                                )}
                              </Accordion.Body>
                            </Accordion.Panel>
                          </Accordion.Item>
                        ))}
                      </Accordion>
                    </div>
                  </>
                ) : (
                  <>
                    <div>
                      <label className="mb-1.5 block text-xs font-semibold text-fg-muted">
                        备注名
                      </label>
                      <Input
                        fullWidth
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="如：我的 Cursor"
                        maxLength={64}
                      />
                    </div>

                    <div>
                      <div className="mb-2 text-xs font-semibold text-fg-muted">授权范围</div>
                      <div className="flex flex-col gap-2">
                        {SCOPE_OPTIONS.map((option) => (
                          <label
                            key={option.value}
                            className={cn(
                              'flex cursor-pointer items-center gap-3 rounded-xl border px-3 py-2 transition-colors',
                              scopes.includes(option.value)
                                ? 'border-brand-500/50 bg-brand-500/10'
                                : 'border-line bg-elevated hover:border-brand-500/40',
                            )}
                          >
                            <Checkbox
                              isSelected={scopes.includes(option.value)}
                              onChange={() => toggleScope(option.value)}
                              aria-label={option.label}
                            >
                              <Checkbox.Content>
                                <Checkbox.Control>
                                  <Checkbox.Indicator />
                                </Checkbox.Control>
                                <span className="text-xs font-semibold text-fg">{option.label}</span>
                              </Checkbox.Content>
                            </Checkbox>
                            <span className="text-[11px] text-fg-subtle">{option.desc}</span>
                          </label>
                        ))}
                      </div>
                    </div>

                    <div>
                      <label className="mb-1.5 block text-xs font-semibold text-fg-muted">
                        有效期
                      </label>
                      <select
                        className={inputClass}
                        value={expiry}
                        onChange={(e) => setExpiry(Number(e.target.value))}
                      >
                        {EXPIRY_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  </>
                )}
              </Modal.Body>
              <Modal.Footer>
                {newToken ? (
                  <Button slot="close">完成</Button>
                ) : (
                  <>
                    <Button slot="close" variant="secondary">
                      取消
                    </Button>
                    <PendingButton
                      isPending={saving}
                      isDisabled={!name.trim() || scopes.length === 0}
                      onPress={submit}
                      icon={KeyRound}
                    >
                      创建令牌
                    </PendingButton>
                  </>
                )}
              </Modal.Footer>
            </Modal.Dialog>
          </Modal.Container>
        </Modal.Backdrop>
      </Modal>
    </div>
  )
}
