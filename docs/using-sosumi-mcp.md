# Using Sosumi MCP

Use Sosumi MCP to retrieve public Apple documentation in Markdown when the exact Apple page is
known or when its search tool can identify a narrow page. It is a renderer, not an Apple
authority: cite the original `developer.apple.com` URL returned in the rendered front matter.

Use `fetchAppleDocumentation` for API reference and Human Interface Guidelines paths. Use
`fetchAppleVideoTranscript` for public Apple Developer video pages. Use
`fetchExternalDocumentation` for public Swift-DocC pages from another host when the supplied URL
contains a `/documentation/...` path.
