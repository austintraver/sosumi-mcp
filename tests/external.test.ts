import { describe, expect, it } from "vitest"
import {
  buildExternalDocCJsonUrl,
  ExternalDocumentationUrlError,
  extractExternalDocumentationBasePath,
} from "../src/lib/external"

describe("External Swift-DocC paths", () => {
  it("preserves a host base path while locating the corresponding DocC JSON", () => {
    const sourceUrl = new URL(
      "https://apple.github.io/swift-argument-parser/documentation/argumentparser",
    )

    expect(extractExternalDocumentationBasePath(sourceUrl)).toBe("/swift-argument-parser")
    expect(buildExternalDocCJsonUrl(sourceUrl).toString()).toBe(
      "https://apple.github.io/swift-argument-parser/data/documentation/argumentparser.json",
    )
  })

  it("requires a Swift-DocC documentation path to build a JSON URL", () => {
    expect(() => buildExternalDocCJsonUrl(new URL("https://example.com/guides/start"))).toThrow(
      ExternalDocumentationUrlError,
    )
  })
})
