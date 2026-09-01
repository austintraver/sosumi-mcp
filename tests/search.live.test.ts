import { spawn } from "node:child_process"
import { once } from "node:events"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"
import { searchAppleDeveloperDocs } from "../src/lib/search"

interface JsonRpcResponse {
  jsonrpc: "2.0"
  id?: number
  result?: {
    structuredContent?: {
      query?: string
      results?: Array<{ title: string; url: string }>
    }
  }
}

function waitForResponse(responses: JsonRpcResponse[], id: number): Promise<JsonRpcResponse> {
  return new Promise((resolveResponse, rejectResponse) => {
    const deadline = setTimeout(() => {
      rejectResponse(new Error(`Timed out waiting for JSON-RPC response ${id}`))
    }, 20_000)

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

const describeLive = process.env.SOSUMI_LIVE_SEARCH === "1" ? describe : describe.skip

describeLive("live Apple search smoke", () => {
  it("returns useful Swift and visionOS results directly and through the stdio MCP child process", async () => {
    const queries = ["Swift Array", "RealityKit visionOS"]

    for (const query of queries) {
      const response = await searchAppleDeveloperDocs(query)
      expect(response.query).toBe(query)
      expect(response.results.length).toBeGreaterThan(0)
      expect(
        response.results.some((result) => result.url.startsWith("https://developer.apple.com/")),
      ).toBe(true)
    }

    const child = spawn(
      process.execPath,
      [resolve("node_modules/tsx/dist/cli.mjs"), "src/stdio.ts"],
      {
        cwd: process.cwd(),
        stdio: ["pipe", "pipe", "pipe"],
      },
    )
    const responses: JsonRpcResponse[] = []
    let stdoutBuffer = ""

    child.stdout.setEncoding("utf8")
    child.stdout.on("data", (chunk: string) => {
      stdoutBuffer += chunk
      const lines = stdoutBuffer.split("\n")
      stdoutBuffer = lines.pop() ?? ""

      for (const line of lines) {
        if (line) {
          responses.push(JSON.parse(line) as JsonRpcResponse)
        }
      }
    })

    try {
      child.stdin.write(
        `${JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "initialize",
          params: {
            protocolVersion: "2025-03-26",
            capabilities: {},
            clientInfo: { name: "sosumi-live-search", version: "1.0.0" },
          },
        })}\n`,
      )
      await waitForResponse(responses, 1)

      for (const [index, query] of queries.entries()) {
        const id = index + 2
        child.stdin.write(
          `${JSON.stringify({
            jsonrpc: "2.0",
            id,
            method: "tools/call",
            params: {
              name: "searchAppleDocumentation",
              arguments: { query },
            },
          })}\n`,
        )
        const response = await waitForResponse(responses, id)
        expect(response.result?.structuredContent?.query).toBe(query)
        expect(response.result?.structuredContent?.results?.length).toBeGreaterThan(0)
        expect(
          response.result?.structuredContent?.results?.some((result) =>
            result.url.startsWith("https://developer.apple.com/"),
          ),
        ).toBe(true)
      }
    } finally {
      child.kill("SIGTERM")
      await once(child, "exit")
    }
  }, 60_000)
})
