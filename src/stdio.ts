import { serveStdio } from "@modelcontextprotocol/server/stdio"

import { createMcpServer } from "./lib/mcp.js"

function run(): void {
  serveStdio(() => createMcpServer(), {
    onerror: (error) => {
      console.error("Sosumi MCP stdio transport error:", error)
    },
  })
}

try {
  run()
} catch (error: unknown) {
  console.error("Sosumi MCP failed to start:", error)
  process.exitCode = 1
}
