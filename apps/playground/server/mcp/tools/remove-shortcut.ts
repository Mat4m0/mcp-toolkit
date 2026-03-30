import { z } from 'zod'

export default defineMcpTool({
  name: 'remove_shortcut',
  title: 'Remove Shortcut',
  description: 'Remove a previously created shortcut tool. The tool will disappear from the tool list immediately.',
  inputSchema: {
    name: z.string().describe('Name of the shortcut to remove (e.g. "my_todos")'),
  },
  enabled: event => event.context.role === 'admin',
  handler: async ({ name }) => {
    const mcp = await useMcpServer()
    const removed = mcp.removeTool(name)
    if (removed) {
      return `Shortcut "${name}" removed.`
    }
    return `Shortcut "${name}" not found. It may have already been removed or never created in this session.`
  },
})
