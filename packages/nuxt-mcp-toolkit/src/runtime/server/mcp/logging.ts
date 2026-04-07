import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { useEvent } from 'nitropack/runtime'

type LoggingLevel = 'debug' | 'info' | 'notice' | 'warning' | 'error' | 'critical' | 'alert' | 'emergency'

/**
 * Access the MCP server's logging facility.
 * Messages are sent to the connected MCP client via `notifications/message`.
 *
 * Requires `nitro.experimental.asyncContext` to be enabled.
 *
 * @see https://modelcontextprotocol.io/specification/2025-11-25/server/utilities/logging
 */
export function useMcpLogger() {
  const event = useEvent()
  const server = event.context._mcpServer as McpServer | undefined
  if (!server) {
    throw new Error(
      'No active MCP server. useMcpLogger() must be called within an MCP request handler.',
    )
  }

  const send = (level: LoggingLevel, data: unknown) => {
    server.server.sendLoggingMessage({ level, data })
  }

  return {
    debug: (data: unknown) => send('debug', data),
    info: (data: unknown) => send('info', data),
    notice: (data: unknown) => send('notice', data),
    warn: (data: unknown) => send('warning', data),
    error: (data: unknown) => send('error', data),
    critical: (data: unknown) => send('critical', data),
    alert: (data: unknown) => send('alert', data),
    emergency: (data: unknown) => send('emergency', data),
  }
}
