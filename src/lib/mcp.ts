import { McpServer } from "@modelcontextprotocol/server"
import { z } from "zod"

import { fetchExternalDocumentationMarkdown } from "./external/index.js"
import {
  fetchHIGPageData,
  fetchHIGTableOfContents,
  renderHIGFromJSON,
  renderHIGTableOfContents,
} from "./hig/index.js"
import { fetchJSONData, renderFromJSON } from "./reference/index.js"
import { searchAppleDeveloperDocs } from "./search.js"
import { generateAppleDocUrl, normalizeDocumentationPath } from "./url.js"
import { fetchVideoTranscriptMarkdown } from "./video/index.js"

export const MCP_SERVER_INFO = {
  name: "sosumi",
  version: "1.1.0",
} as const

export interface ToolMeta {
  name: string
  title: string
  description: string
  inputSchema: z.ZodObject
  outputSchema?: z.ZodObject
  annotations: {
    readOnlyHint: boolean
    destructiveHint: boolean
    idempotentHint: boolean
    openWorldHint: boolean
  }
}

const searchResultSchema = z.object({
  title: z.string().describe("Title of the documentation page"),
  url: z.string().describe("Full URL to the documentation page"),
  description: z.string().describe("Brief description of the page content"),
  breadcrumbs: z.array(z.string()).describe("Navigation breadcrumbs showing the page hierarchy"),
  tags: z.array(z.string()).describe("Tags associated with the page (languages, platforms, etc.)"),
  type: z.string().describe("Type of result (documentation, general, etc.)"),
})

const readOnlyAnnotations = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: true,
} as const

export const TOOL_DEFINITIONS = {
  searchAppleDocumentation: {
    name: "searchAppleDocumentation",
    title: "Search Apple Documentation",
    description: "Search Apple Developer documentation and return structured results",
    inputSchema: z.object({
      query: z.string().describe("Search query for Apple documentation"),
    }),
    outputSchema: z.object({
      query: z.string().describe("The search query that was executed"),
      results: z.array(searchResultSchema).describe("Array of search results"),
    }),
    annotations: readOnlyAnnotations,
  },
  fetchAppleDocumentation: {
    name: "fetchAppleDocumentation",
    title: "Fetch Apple Documentation",
    description:
      "Fetch Apple Developer documentation and Human Interface Guidelines by path and return as markdown",
    inputSchema: z.object({
      path: z
        .string()
        .describe(
          "Documentation path (e.g., '/documentation/swift', '/documentation/swiftui/view', '/design/human-interface-guidelines/foundations/color')",
        ),
    }),
    annotations: readOnlyAnnotations,
  },
  fetchExternalDocumentation: {
    name: "fetchExternalDocumentation",
    title: "Fetch External Documentation",
    description:
      "Fetch external Swift-DocC documentation by absolute https URL and return as markdown",
    inputSchema: z.object({
      url: z
        .string()
        .describe(
          "External Swift-DocC URL (e.g., 'https://apple.github.io/swift-argument-parser/documentation/argumentparser')",
        ),
    }),
    annotations: readOnlyAnnotations,
  },
  fetchAppleVideoTranscript: {
    name: "fetchAppleVideoTranscript",
    title: "Fetch Apple Video Transcript",
    description: "Fetch transcript for an Apple Developer video path and return as markdown",
    inputSchema: z.object({
      path: z
        .string()
        .describe(
          "Apple video path (e.g., '/videos/play/wwdc2021/10133' or '/videos/play/meet-with-apple/208')",
        ),
    }),
    annotations: readOnlyAnnotations,
  },
} satisfies Record<string, ToolMeta>

export function createMcpServer() {
  const server = new McpServer(MCP_SERVER_INFO)

  const search = TOOL_DEFINITIONS.searchAppleDocumentation
  server.registerTool(
    search.name,
    {
      title: search.title,
      description: search.description,
      inputSchema: search.inputSchema,
      outputSchema: search.outputSchema,
      annotations: search.annotations,
    },
    async ({ query }) => {
      try {
        const searchResponse = await searchAppleDeveloperDocs(query)

        const structuredContent = {
          query: searchResponse.query,
          results: searchResponse.results.map((result) => ({
            title: result.title,
            url: result.url,
            description: result.description,
            breadcrumbs: result.breadcrumbs,
            tags: result.tags,
            type: result.type,
          })),
        }

        if (searchResponse.results.length === 0) {
          return {
            content: [
              {
                type: "text" as const,
                text: `No results found for "${query}"`,
              },
            ],
            structuredContent,
          }
        }

        const resultText =
          `Found ${searchResponse.results.length} result(s) for "${query}":\n\n` +
          searchResponse.results
            .map(
              (result, index) =>
                `${index + 1}. ${result.title}\n   ${result.url}\n   ${result.description || "No description"}`,
            )
            .join("\n\n")

        return {
          content: [
            {
              type: "text" as const,
              text: resultText,
            },
          ],
          structuredContent,
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error"

        const structuredContent = {
          query,
          results: [],
        }

        return {
          isError: true,
          content: [
            {
              type: "text" as const,
              text: `Error searching Apple Developer documentation: ${errorMessage}`,
            },
          ],
          structuredContent,
        }
      }
    },
  )

  const fetchDocs = TOOL_DEFINITIONS.fetchAppleDocumentation
  server.registerTool(
    fetchDocs.name,
    {
      title: fetchDocs.title,
      description: fetchDocs.description,
      inputSchema: fetchDocs.inputSchema,
      annotations: fetchDocs.annotations,
    },
    async ({ path }) => {
      try {
        if (isHumanInterfaceGuidelinesPath(path)) {
          const markdown = await fetchHumanInterfaceGuidelines(path)

          if (!markdown || markdown.trim().length < 100) {
            throw new Error("Insufficient content in HIG page")
          }

          return {
            content: [
              {
                type: "text" as const,
                text: markdown,
              },
            ],
          }
        }

        const normalizedPath = normalizeDocumentationPath(path)
        const appleUrl = generateAppleDocUrl(normalizedPath)

        const jsonData = await fetchJSONData(normalizedPath)
        const markdown = await renderFromJSON(jsonData, appleUrl)

        if (!markdown || markdown.trim().length < 100) {
          throw new Error("Insufficient content in documentation")
        }

        return {
          content: [
            {
              type: "text" as const,
              text: markdown,
            },
          ],
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error"

        return {
          isError: true,
          content: [
            {
              type: "text" as const,
              text: `Error fetching content for "${path}": ${errorMessage}`,
            },
          ],
        }
      }
    },
  )

  const fetchExternal = TOOL_DEFINITIONS.fetchExternalDocumentation
  server.registerTool(
    fetchExternal.name,
    {
      title: fetchExternal.title,
      description: fetchExternal.description,
      inputSchema: fetchExternal.inputSchema,
      annotations: fetchExternal.annotations,
    },
    async ({ url }) => {
      try {
        const markdown = await fetchExternalDocumentationMarkdown(url)

        if (!markdown || markdown.trim().length < 100) {
          throw new Error("Insufficient content in external documentation")
        }

        return {
          content: [
            {
              type: "text" as const,
              text: markdown,
            },
          ],
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error"

        return {
          isError: true,
          content: [
            {
              type: "text" as const,
              text: `Error fetching external content for "${url}": ${errorMessage}`,
            },
          ],
        }
      }
    },
  )

  const fetchVideo = TOOL_DEFINITIONS.fetchAppleVideoTranscript
  server.registerTool(
    fetchVideo.name,
    {
      title: fetchVideo.title,
      description: fetchVideo.description,
      inputSchema: fetchVideo.inputSchema,
      annotations: fetchVideo.annotations,
    },
    async ({ path }) => {
      try {
        const normalizedPath = path.startsWith("/") ? path : `/${path}`
        const match = normalizedPath.match(/^\/videos\/play\/([a-z0-9-]+)\/(\d+)\/?$/i)
        if (!match) {
          throw new Error(
            "Invalid Apple video path. Expected format: /videos/play/COLLECTION/VIDEO_ID",
          )
        }

        const collection = match[1]
        const videoId = match[2]
        const sourceUrl = `https://developer.apple.com/videos/play/${collection}/${videoId}/`
        const markdown = await fetchVideoTranscriptMarkdown(sourceUrl, collection, videoId)

        if (!markdown || markdown.trim().length < 100) {
          throw new Error("Insufficient content in video transcript")
        }

        return {
          content: [
            {
              type: "text" as const,
              text: markdown,
            },
          ],
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error"
        return {
          isError: true,
          content: [
            {
              type: "text" as const,
              text: `Error fetching Apple video transcript for "${path}": ${errorMessage}`,
            },
          ],
        }
      }
    },
  )

  return server
}

const HIG_PATH_PREFIX = "design/human-interface-guidelines"
const HIG_SOURCE_URL = "https://developer.apple.com/design/human-interface-guidelines"

function isHumanInterfaceGuidelinesPath(path: string): boolean {
  const normalizedPath = path.replace(/^\/+|\/+$/g, "")
  return normalizedPath === HIG_PATH_PREFIX || normalizedPath.startsWith(`${HIG_PATH_PREFIX}/`)
}

async function fetchHumanInterfaceGuidelines(path: string): Promise<string> {
  const normalizedPath = path.replace(/^\/+|\/+$/g, "")
  const higPath = normalizedPath.slice(HIG_PATH_PREFIX.length).replace(/^\//, "")

  if (!higPath) {
    const tableOfContents = await fetchHIGTableOfContents()
    return renderHIGTableOfContents(tableOfContents)
  }

  const jsonData = await fetchHIGPageData(higPath)
  return renderHIGFromJSON(jsonData, `${HIG_SOURCE_URL}/${higPath}`)
}
