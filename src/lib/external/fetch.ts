import { renderFromJSON } from "../reference/index.js"
import type { AppleDocJSON } from "../types.js"

export class ExternalDocumentationUrlError extends Error {}

export function extractExternalDocumentationBasePath(sourceUrl: URL): string {
  const normalizedPath = sourceUrl.pathname.replace(/\/+$/, "")
  const match = normalizedPath.match(/^(.*?)(\/documentation(?:\/.*)?)$/)
  if (!match) {
    throw new ExternalDocumentationUrlError(
      "External URL must point to a Swift-DocC documentation path.",
    )
  }

  return match[1]
}

export function buildExternalDocCJsonUrl(sourceUrl: URL): URL {
  const hostBasePath = extractExternalDocumentationBasePath(sourceUrl)
  const documentationPath = sourceUrl.pathname.replace(/\/+$/, "").slice(hostBasePath.length)
  const jsonPath = documentationPath.endsWith(".json")
    ? documentationPath
    : `${documentationPath}.json`
  return new URL(`${hostBasePath}/data${jsonPath}`, sourceUrl.origin)
}

export async function fetchExternalDocCJSON(sourceUrl: URL): Promise<AppleDocJSON> {
  const jsonUrl = buildExternalDocCJsonUrl(sourceUrl)
  const response = await fetch(jsonUrl.toString(), {
    headers: { Accept: "application/json" },
  })

  if (!response.ok) {
    if (response.status === 404) {
      throw new Error(`External documentation page not found at ${jsonUrl.toString()}`)
    }

    throw new Error(`Failed to fetch external DocC JSON: ${response.status} ${response.statusText}`)
  }

  return (await response.json()) as AppleDocJSON
}

export async function fetchExternalDocumentationMarkdown(url: string): Promise<string> {
  let targetUrl: URL
  try {
    targetUrl = new URL(url)
  } catch {
    throw new ExternalDocumentationUrlError("Invalid external URL.")
  }

  const jsonData = await fetchExternalDocCJSON(targetUrl)
  const externalBasePath = extractExternalDocumentationBasePath(targetUrl)
  return renderFromJSON(jsonData, targetUrl.toString(), {
    externalOrigin: `${targetUrl.origin}${externalBasePath}`,
  })
}
