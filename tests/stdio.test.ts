import { spawn } from "node:child_process"
import { once } from "node:events"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"

interface JsonRpcResponse {
  jsonrpc: "2.0"
  id?: number
  result?: {
    tools?: Array<{ name: string }>
  }
}

function waitForResponse(responses: JsonRpcResponse[], id: number): Promise<JsonRpcResponse> {
  return new Promise((resolveResponse, rejectResponse) => {
    const deadline = setTimeout(() => {
      rejectResponse(new Error(`Timed out waiting for JSON-RPC response ${id}`))
    }, 5_000)

    const interval = setInterval(() => {
      const response = responses.find((candidate) => candidate.id === id)
      if (!response) {
        return
      }

      clearTimeout(deadline)
      clearInterval(interval)
      resolveResponse(response)
    }, 10)
  })
}

describe("stdio MCP server", () => {
  it("initializes and lists exactly the four Sosumi MCP tools over protocol-clean stdout", async () => {
    const child = spawn(
      process.execPath,
      [resolve("node_modules/tsx/dist/cli.mjs"), "src/stdio.ts"],
      {
        cwd: process.cwd(),
        stdio: ["pipe", "pipe", "pipe"],
      },
    )
    const stdoutLines: string[] = []
    const stderrChunks: string[] = []
    const responses: JsonRpcResponse[] = []
    let stdoutBuffer = ""

    child.stdout.setEncoding("utf8")
    child.stdout.on("data", (chunk: string) => {
      stdoutBuffer += chunk
      const lines = stdoutBuffer.split("\n")
      stdoutBuffer = lines.pop() ?? ""

      for (const line of lines) {
        if (!line) {
          continue
        }
        stdoutLines.push(line)
        responses.push(JSON.parse(line) as JsonRpcResponse)
      }
    })
    child.stderr.setEncoding("utf8")
    child.stderr.on("data", (chunk: string) => stderrChunks.push(chunk))

    try {
      child.stdin.write(
        `${JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "initialize",
          params: {
            protocolVersion: "2025-03-26",
            capabilities: {},
            clientInfo: { name: "stdio-baseline-test", version: "1.0.0" },
          },
        })}\n`,
      )
      await waitForResponse(responses, 1)

      child.stdin.write(
        `${JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} })}\n`,
      )
      const listResponse = await waitForResponse(responses, 2)

      expect(listResponse.result?.tools?.map((tool) => tool.name)).toEqual([
        "searchAppleDocumentation",
        "fetchAppleDocumentation",
        "fetchExternalDocumentation",
        "fetchAppleVideoTranscript",
      ])
      expect(stdoutLines).not.toHaveLength(0)
      expect(responses.every((response) => response.jsonrpc === "2.0")).toBe(true)
      expect(stdoutBuffer).toBe("")
      expect(stderrChunks.join("")).not.toContain("Sosumi MCP")
    } finally {
      child.kill("SIGTERM")
      await once(child, "exit")
    }
  })
})
