import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { searchAppleDeveloperDocs } from "../src/lib/search"

const SEARCH_URL = "https://devintserv.msc.sbz.apple.com/api/v1/query"

const arrayMetadata = {
  title: "Array",
  permalink: "https://developer.apple.com/documentation/swift/array",
  description: "An ordered, random-access collection.",
  hierarchy: "Swift > Array",
  kind: "symbol",
  metadataKind: "documentation",
}

function jsonl(...events: unknown[]): string {
  return events
    .map((event) => (typeof event === "string" ? event : JSON.stringify(event)))
    .join("\n")
}

function jsonlResponse(events: string): Response {
  return new Response(events, {
    status: 200,
    headers: { "Content-Type": "application/jsonl" },
  })
}

describe("searchAppleDeveloperDocs", () => {
  const originalFetch = global.fetch

  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    global.fetch = originalFetch
  })

  it("parses current JSONL events, retains the full result order, and normalizes every supported result shape", async () => {
    const incompleteSnapshot = JSON.stringify({
      results: [{ value: { metadata: arrayMetadata, origin: "documentation" } }],
    })
    const fullSnapshot = JSON.stringify({
      results: [
        { value: { metadata: arrayMetadata, origin: "documentation" } },
        {
          documentation: {
            metadata: {
              title: "SchemaMigrationPlan",
              permalink: "https://developer.apple.com/documentation/swiftdata/schemamigrationplan",
              description: "Describe schema evolution and migration.",
              hierarchy: "SwiftData > SchemaMigrationPlan",
              kind: "symbol",
            },
          },
        },
        {
          developer: {
            metadata: {
              titles: ["Model your schema with SwiftData"],
              permalinks: ["https://developer.apple.com/videos/play/wwdc2023/10195"],
              descriptions: ["Learn schema macros and migration plans."],
              projectNames: ["WWDC23"],
              itemTypes: ["Video"],
              deliveryLanguageCodes: ["eng"],
            },
          },
        },
        {
          devsite: {
            metadata: {
              title: "Get Started - SwiftUI",
              sourceURL: "https://developer.apple.com/swiftui/get-started/",
              description: "Start designing with SwiftUI.",
            },
          },
        },
        {
          swiftdocs: {
            metadata: {
              title: "The Swift Programming Language",
              sourceURL: "https://www.swift.org/documentation/",
              description: "Swift language documentation.",
            },
          },
        },
      ],
    })

    global.fetch = vi.fn().mockResolvedValue(
      jsonlResponse(
        jsonl(
          "",
          {
            kind: "quickSearch",
            response: { results: [{ metadata: arrayMetadata, origin: "documentation" }] },
          },
          { kind: "quickSearchFinished" },
          "this is not JSON",
          { kind: "unrelated", response: { results: [] } },
          { kind: "search", diff: { append: incompleteSnapshot, removeLast: 0 } },
          {
            kind: "search",
            diff: { append: fullSnapshot, removeLast: incompleteSnapshot.length },
          },
          { kind: "searchFinished" },
        ),
      ),
    )

    const result = await searchAppleDeveloperDocs("Swift Array")

    expect(global.fetch).toHaveBeenCalledTimes(1)
    const [requestUrl, requestInit] = vi.mocked(global.fetch).mock.calls[0] ?? []
    expect(requestUrl).toBe(SEARCH_URL)
    expect(requestInit).toEqual(
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "Content-Type": "application/json",
          Accept: "application/jsonl",
          Origin: "https://developer.apple.com",
          Referer: "https://developer.apple.com/search/",
          "User-Agent": expect.stringMatching(/AppleWebKit/),
        }),
      }),
    )
    expect(JSON.parse(String(requestInit?.body))).toEqual({
      text: "Swift Array",
      targetResultLocale: expect.any(String),
      includedResponses: ["quickSearch", "search"],
    })

    expect(result).toEqual({
      query: "Swift Array",
      results: [
        {
          title: "Array",
          url: "https://developer.apple.com/documentation/swift/array",
          description: "An ordered, random-access collection.",
          breadcrumbs: ["Swift", "Array"],
          tags: ["symbol"],
          type: "documentation",
        },
        {
          title: "SchemaMigrationPlan",
          url: "https://developer.apple.com/documentation/swiftdata/schemamigrationplan",
          description: "Describe schema evolution and migration.",
          breadcrumbs: ["SwiftData", "SchemaMigrationPlan"],
          tags: ["symbol"],
          type: "documentation",
        },
        {
          title: "Model your schema with SwiftData",
          url: "https://developer.apple.com/videos/play/wwdc2023/10195",
          description: "Learn schema macros and migration plans.",
          breadcrumbs: ["WWDC23"],
          tags: ["Video", "eng"],
          type: "video",
        },
        {
          title: "Get Started - SwiftUI",
          url: "https://developer.apple.com/swiftui/get-started/",
          description: "Start designing with SwiftUI.",
          breadcrumbs: [],
          tags: [],
          type: "general",
        },
        {
          title: "The Swift Programming Language",
          url: "https://www.swift.org/documentation/",
          description: "Swift language documentation.",
          breadcrumbs: [],
          tags: [],
          type: "general",
        },
      ],
    })
  })

  it("keeps valid quick-search results when JSONL lines or full-search snapshots are malformed", async () => {
    global.fetch = vi.fn().mockResolvedValue(
      jsonlResponse(
        jsonl(
          {
            kind: "quickSearch",
            response: { results: [{ metadata: arrayMetadata, origin: "documentation" }] },
          },
          "",
          "{ malformed",
          { kind: "search", diff: { append: "{bad snapshot", removeLast: 0 } },
          { kind: "error", response: "searchFailed" },
        ),
      ),
    )

    await expect(searchAppleDeveloperDocs("Swift Array")).resolves.toEqual({
      query: "Swift Array",
      results: [
        {
          title: "Array",
          url: "https://developer.apple.com/documentation/swift/array",
          description: "An ordered, random-access collection.",
          breadcrumbs: ["Swift", "Array"],
          tags: ["symbol"],
          type: "documentation",
        },
      ],
    })
  })

  it("uses quick search when full search has no valid result", async () => {
    global.fetch = vi.fn().mockResolvedValue(
      jsonlResponse(
        jsonl(
          {
            kind: "quickSearch",
            response: { results: [{ metadata: arrayMetadata, origin: "documentation" }] },
          },
          { kind: "search", response: { results: [{ ignored: true }] } },
        ),
      ),
    )

    await expect(searchAppleDeveloperDocs("Swift Array")).resolves.toMatchObject({
      results: [{ title: "Array" }],
    })
  })

  it("collapses 'en-*' locales to bare 'en' to match Apple's accepted target locales", async () => {
    vi.spyOn(Intl, "DateTimeFormat").mockImplementation(
      () =>
        ({
          resolvedOptions: () => ({ locale: "en-US-u-hc-h23" }),
        }) as Intl.DateTimeFormat,
    )
    global.fetch = vi.fn().mockResolvedValue(jsonlResponse(""))

    await searchAppleDeveloperDocs("SchemaMigrationPlan")

    const [, requestInit] = vi.mocked(global.fetch).mock.calls[0] ?? []
    expect(JSON.parse(String(requestInit?.body))).toEqual({
      text: "SchemaMigrationPlan",
      targetResultLocale: "en",
      includedResponses: ["quickSearch", "search"],
    })
  })

  it("preserves language-region subtags for non-English locales", async () => {
    vi.spyOn(Intl, "DateTimeFormat").mockImplementation(
      () =>
        ({
          resolvedOptions: () => ({ locale: "ja-JP" }),
        }) as Intl.DateTimeFormat,
    )
    global.fetch = vi.fn().mockResolvedValue(jsonlResponse(""))

    await searchAppleDeveloperDocs("Foundation")

    const [, requestInit] = vi.mocked(global.fetch).mock.calls[0] ?? []
    expect(JSON.parse(String(requestInit?.body))).toEqual({
      text: "Foundation",
      targetResultLocale: "ja-JP",
      includedResponses: ["quickSearch", "search"],
    })
  })

  it("maps Latin American Spanish to Apple's search locale token", async () => {
    vi.spyOn(Intl, "DateTimeFormat").mockImplementation(
      () =>
        ({
          resolvedOptions: () => ({ locale: "es-419" }),
        }) as Intl.DateTimeFormat,
    )
    global.fetch = vi.fn().mockResolvedValue(jsonlResponse(""))

    await searchAppleDeveloperDocs("Foundation")

    const [, requestInit] = vi.mocked(global.fetch).mock.calls[0] ?? []
    expect(JSON.parse(String(requestInit?.body))).toEqual({
      text: "Foundation",
      targetResultLocale: "es-lamr",
      includedResponses: ["quickSearch", "search"],
    })
  })

  it("returns an empty result set for an otherwise valid JSONL response with no result events", async () => {
    global.fetch = vi.fn().mockResolvedValue(jsonlResponse(jsonl({ kind: "searchFinished" })))

    await expect(searchAppleDeveloperDocs("no-such-symbol")).resolves.toEqual({
      query: "no-such-symbol",
      results: [],
    })
  })

  it("throws a clear error when Apple's backend returns a non-2xx status", async () => {
    global.fetch = vi.fn().mockResolvedValue(
      new Response("", {
        status: 500,
        headers: { "Content-Type": "text/plain" },
      }),
    )

    await expect(searchAppleDeveloperDocs("anything")).rejects.toThrow("Search request failed: 500")
  })
})
