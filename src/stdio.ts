import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"

import { createMcpServer } from "./lib/mcp.js"

async function run(): Promise<void> {
  const server = createMcpServer()
  const transport = new StdioServerTransport()

  transport.onerror = (error) => {
    console.error("Sosumi MCP stdio transport error:", error)
  }

  await server.connect(transport)
}

run().catch((error: unknown) => {
  console.error("Sosumi MCP failed to start:", error)
  process.exitCode = 1
})
