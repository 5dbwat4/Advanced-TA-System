import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'

import type { McpPrincipal } from './principal'
import { registerBankTools } from './tools/banks'
import { registerExperimentTools } from './tools/experiments'
import { registerQuestionTools } from './tools/questions'

/** 为单次请求构建 MCP 服务器（无状态：每次请求独立，工具闭包持有调用主体） */
export function buildMcpServer(principal: McpPrincipal): McpServer {
  const server = new McpServer({ name: 'tasaas', version: '1.0.0' })
  registerQuestionTools(server, principal)
  registerBankTools(server, principal)
  registerExperimentTools(server, principal)
  return server
}
