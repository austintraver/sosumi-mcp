import { getRandomUserAgent } from "./fetch.js"

export interface SearchResult {
  title: string
  url: string
  description: string
  breadcrumbs: string[]
  tags: string[]
  type: string // 'documentation' | 'general' etc.
}

export interface SearchResponse {
  query: string
  results: SearchResult[]
}

// Apple's search-page script currently posts JSONL requests to this endpoint.
// `quickSearch` events contain a small direct result set; `search` events carry
// incremental edits to a JSON result snapshot.
const APPLE_SEARCH_SERVICE_URL = "https://devintserv.msc.sbz.apple.com/api/v1/query"
const DEFAULT_TARGET_RESULT_LOCALE = "en"
const TARGET_RESULT_LOCALE_BY_BASE_NAME = new Map([
  ["en", "en"],
  ["zh-CN", "zh-CN"],
  ["ja-JP", "ja-JP"],
  ["ko-KR", "ko-KR"],
  ["fr-FR", "fr-FR"],
  ["de-DE", "de-DE"],
  ["pt-BR", "pt-BR"],
  ["es-LA", "es-lamr"],
  ["es-419", "es-lamr"],
  ["it-IT", "it-IT"],
])

type JsonRecord = Record<string, unknown>

export async function searchAppleDeveloperDocs(query: string): Promise<SearchResponse> {
  const results = await searchAppleDeveloperDocsViaService(query)
  return { query, results }
}

async function searchAppleDeveloperDocsViaService(query: string): Promise<SearchResult[]> {
  const response = await fetch(APPLE_SEARCH_SERVICE_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/jsonl",
      Origin: "https://developer.apple.com",
      Referer: "https://developer.apple.com/search/",
      "User-Agent": getRandomUserAgent(),
    },
    body: JSON.stringify({
      text: query,
      targetResultLocale: resolveTargetResultLocale(),
      includedResponses: ["quickSearch", "search"],
    }),
  })

  if (!response.ok) {
    throw new Error(`Search request failed: ${response.status}`)
  }

  return readSearchResponseJsonl(response)
}

async function readSearchResponseJsonl(response: Response): Promise<SearchResult[]> {
  const text = await response.text()
  let quickResults: SearchResult[] = []
  let latestSearchResults: SearchResult[] = []
  let searchBuffer = ""

  for (const line of text.split(/\r?\n/)) {
    const event = parseJsonRecord(line)
    if (!event) {
      continue
    }

    if (event.kind === "quickSearch") {
      quickResults = extractSearchResults(extractEventResults(event.response))
      continue
    }

    if (event.kind !== "search") {
      continue
    }

    const directResults = extractEventResults(event.response)
    if (directResults.length > 0) {
      latestSearchResults = extractSearchResults(directResults)
    }

    const diff = isJsonRecord(event.diff) ? event.diff : null
    if (!diff) {
      continue
    }

    const removeLast = nonNegativeInteger(diff.removeLast)
    if (removeLast !== null) {
      searchBuffer = searchBuffer.slice(0, Math.max(0, searchBuffer.length - removeLast))
    }

    if (typeof diff.append === "string") {
      searchBuffer += diff.append
    }

    const snapshot = parseJsonRecord(searchBuffer)
    if (snapshot) {
      latestSearchResults = extractSearchResults(extractEventResults(snapshot))
    }
  }

  // Apple's full search has the larger result set and its relevance ordering.
  // Keep it first, then retain a quick-search hit only when it is absent there.
  return mergeSearchResults(latestSearchResults, quickResults)
}

function extractEventResults(value: unknown): unknown[] {
  return isJsonRecord(value) && Array.isArray(value.results) ? value.results : []
}

function parseJsonRecord(value: string): JsonRecord | null {
  if (!value.trim()) {
    return null
  }

  try {
    const parsed = JSON.parse(value)
    return isJsonRecord(parsed) ? parsed : null
  } catch {
    return null
  }
}

function nonNegativeInteger(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : null
}

function mergeSearchResults(
  primary: SearchResult[],
  supplementary: SearchResult[],
): SearchResult[] {
  const seenUrls = new Set<string>()
  return [...primary, ...supplementary].filter((result) => {
    if (seenUrls.has(result.url)) {
      return false
    }
    seenUrls.add(result.url)
    return true
  })
}

function extractSearchResults(items: unknown[]): SearchResult[] {
  return items.flatMap((item) => {
    const result = normalizeSearchResult(item)
    return result ? [result] : []
  })
}

function normalizeSearchResult(item: unknown): SearchResult | null {
  if (!isJsonRecord(item)) {
    return null
  }

  const candidate = isJsonRecord(item.value) ? item.value : item
  const currentMetadata = isJsonRecord(candidate.metadata) ? candidate.metadata : null
  if (currentMetadata) {
    return normalizeCurrentSearchResult(currentMetadata, stringValue(candidate.origin))
  }

  const documentation = extractMetadataRecord(candidate.documentation)
  if (documentation) {
    return normalizeDocumentationResult(documentation)
  }

  const developer = extractMetadataRecord(candidate.developer)
  if (developer) {
    return normalizeDeveloperResult(developer)
  }

  const devsite = extractMetadataRecord(candidate.devsite)
  if (devsite) {
    return normalizeGeneralResult(devsite)
  }

  const swiftdocs = extractMetadataRecord(candidate.swiftdocs)
  if (swiftdocs) {
    return normalizeGeneralResult(swiftdocs)
  }

  return null
}

function normalizeCurrentSearchResult(
  metadata: JsonRecord,
  origin: string | null,
): SearchResult | null {
  const title = stringValue(metadata.title)
  const url = stringValue(metadata.permalink) ?? stringValue(metadata.sourceURL)
  if (!title || !url) {
    return null
  }

  const kind = stringValue(metadata.kind)
  const metadataKind = stringValue(metadata.metadataKind)
  const type =
    metadataKind === "documentation" || origin === "documentation"
      ? "documentation"
      : (kind ?? origin ?? "general").toLowerCase()

  return {
    title,
    url,
    description: stringValue(metadata.description) ?? "",
    breadcrumbs: splitHierarchy(stringValue(metadata.hierarchy)),
    tags: compactStrings([kind]),
    type,
  }
}

function normalizeDocumentationResult(metadata: JsonRecord): SearchResult | null {
  const title = stringValue(metadata.title)
  const url = stringValue(metadata.permalink)
  if (!title || !url) {
    return null
  }

  return {
    title,
    url,
    description: stringValue(metadata.description) ?? "",
    breadcrumbs: splitHierarchy(stringValue(metadata.hierarchy)),
    tags: compactStrings([stringValue(metadata.kind)]),
    type: "documentation",
  }
}

function normalizeDeveloperResult(metadata: JsonRecord): SearchResult | null {
  const title = firstString(metadata.titles)
  const url = firstString(metadata.permalinks)
  if (!title || !url) {
    return null
  }

  return {
    title,
    url,
    description: firstString(metadata.descriptions) ?? "",
    breadcrumbs: compactStrings([firstString(metadata.projectNames)]),
    tags: compactStrings([
      firstString(metadata.itemTypes),
      firstString(metadata.deliveryLanguageCodes),
    ]),
    type: (firstString(metadata.itemTypes) ?? "developer").toLowerCase(),
  }
}

function normalizeGeneralResult(metadata: JsonRecord): SearchResult | null {
  const title = stringValue(metadata.title)
  const url = stringValue(metadata.sourceURL)
  if (!title || !url) {
    return null
  }

  return {
    title,
    url,
    description: stringValue(metadata.description) ?? "",
    breadcrumbs: [],
    tags: [],
    type: "general",
  }
}

function extractMetadataRecord(container: unknown): JsonRecord | null {
  if (!isJsonRecord(container)) {
    return null
  }

  const metadata = container.metadata
  return isJsonRecord(metadata) ? metadata : null
}

function isJsonRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null
}

function firstString(value: unknown): string | null {
  if (!Array.isArray(value)) {
    return null
  }

  const first = value.find((item) => typeof item === "string" && item.length > 0)
  return typeof first === "string" ? first : null
}

function splitHierarchy(hierarchy: string | null): string[] {
  if (!hierarchy) {
    return []
  }

  return hierarchy
    .split(" > ")
    .map((segment) => segment.trim())
    .filter(Boolean)
}

function compactStrings(values: Array<string | null>): string[] {
  return values.filter((value): value is string => Boolean(value))
}

// Apple's MSC backend uses BCP-47 language tags ("en", "ja-JP", "zh-CN", etc.)
// instead of POSIX locale codes ("en_US").
// Mirror the mapping from
// https://developer.apple.com/search/scripts/helpers.js
function resolveTargetResultLocale(): string {
  const locale = Intl.DateTimeFormat().resolvedOptions().locale
  if (!locale) {
    return DEFAULT_TARGET_RESULT_LOCALE
  }

  try {
    const normalized = new Intl.Locale(locale)
    const lang = normalized.language
    const region = normalized.region
    const languageRegion = region ? `${lang}-${region}` : lang

    return (
      TARGET_RESULT_LOCALE_BY_BASE_NAME.get(normalized.baseName) ??
      TARGET_RESULT_LOCALE_BY_BASE_NAME.get(languageRegion) ??
      TARGET_RESULT_LOCALE_BY_BASE_NAME.get(lang) ??
      DEFAULT_TARGET_RESULT_LOCALE
    )
  } catch {
    return DEFAULT_TARGET_RESULT_LOCALE
  }
}
