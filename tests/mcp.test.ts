import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { fetchExternalDocumentationMarkdown } from "../src/lib/external"

describe("MCP external documentation helper", () => {
  const originalFetch = global.fetch

  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    global.fetch = originalFetch
  })

  it("fetches external DocC JSON directly from the requested documentation URL", async () => {
    global.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ metadata: { title: "Example" } }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    )

    const markdown = await fetchExternalDocumentationMarkdown(
      "https://127.0.0.1/documentation/example#section",
    )

    expect(markdown).toContain("# Example")
    expect(global.fetch).toHaveBeenCalledWith(
      "https://127.0.0.1/data/documentation/example.json",
      expect.objectContaining({ headers: { Accept: "application/json" } }),
    )
  })
})
