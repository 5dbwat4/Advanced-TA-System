import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'

import { audit, requireScope, type McpPrincipal } from './principal'

/** 将任意值包装为 MCP 工具文本结果 */
export function jsonResult(value: unknown): CallToolResult {
  return {
    content: [{ type: 'text', text: JSON.stringify(value, null, 2) }],
  }
}

/** 统一的工具执行壳：校验 scope → 执行 → 记录审计 */
export async function runTool(
  principal: McpPrincipal,
  tool: string,
  scope: string,
  fn: () => Promise<CallToolResult>,
): Promise<CallToolResult> {
  try {
    requireScope(principal, scope)
    const result = await fn()
    await audit(principal, tool, true)
    return result
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    await audit(principal, tool, false, message)
    throw error
  }
}
