import { spawn, spawnSync } from "node:child_process"
import { once } from "node:events"
import { mkdtempSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"

const expectedTools = [
  "searchAppleDocumentation",
  "fetchAppleDocumentation",
  "fetchExternalDocumentation",
  "fetchAppleVideoTranscript",
]

const artifact = resolve(process.argv[2] ?? "")
if (!artifact) throw new Error("Pass the MCPB artifact path")

const root = resolve(import.meta.dirname, "..")
const mcpb = resolve(root, "node_modules/.bin/mcpb")
const unpacked = mkdtempSync(join(tmpdir(), "sosumi-mcpb-clean-room-"))

function unpack() {
  const result = spawnSync(mcpb, ["unpack", artifact, unpacked], { encoding: "utf8" })
  if (result.status !== 0) throw new Error(`mcpb unpack failed: ${result.stderr || result.stdout}`)
}

function waitForResponse(responses, id) {
  return new Promise((resolveResponse, rejectResponse) => {
    const timer = setTimeout(
      () => rejectResponse(new Error(`Timed out waiting for response ${id}`)),
      45_000,
    )
    const poll = setInterval(() => {
      const response = responses.find((candidate) => candidate.id === id)
      if (!response) return
      clearTimeout(timer)
      clearInterval(poll)
      resolveResponse(response)
    }, 10)
  })
}

async function verify() {
  unpack()
  const manifest = JSON.parse(readFileSync(join(unpacked, "manifest.json"), "utf8"))
  const entryPoint = manifest.server.mcp_config.args[0].replace(`\${__dirname}`, unpacked)
  const child = spawn(manifest.server.mcp_config.command, [entryPoint], {
    cwd: unpacked,
    env: { PATH: process.env.PATH ?? "" },
    stdio: ["pipe", "pipe", "pipe"],
  })
  const responses = []
  const stderr = []
  let stdoutBuffer = ""
  let protocolError

  child.stdout.setEncoding("utf8")
  child.stdout.on("data", (chunk) => {
    stdoutBuffer += chunk
    const lines = stdoutBuffer.split("\n")
    stdoutBuffer = lines.pop() ?? ""
    for (const line of lines) {
      if (!line) continue
      try {
        const message = JSON.parse(line)
        if (message.jsonrpc !== "2.0") throw new Error(`Non-protocol stdout: ${line}`)
        responses.push(message)
      } catch (error) {
        protocolError = error
      }
    }
  })
  child.stderr.setEncoding("utf8")
  child.stderr.on("data", (chunk) => stderr.push(chunk))

  let id = 1
  const request = async (method, params) => {
    if (protocolError) throw protocolError
    const requestId = id++
    child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id: requestId, method, params })}\n`)
    const response = await waitForResponse(responses, requestId)
    if (protocolError || stdoutBuffer)
      throw protocolError ?? new Error(`Incomplete stdout: ${stdoutBuffer}`)
    if (response.error) throw new Error(`MCP ${method} failed: ${JSON.stringify(response.error)}`)
    if (response.result?.isError) throw new Error(`MCP ${method} returned an error result`)
    return response.result
  }

  try {
    const initialized = await request("initialize", {
      protocolVersion: "2025-03-26",
      capabilities: {},
      clientInfo: { name: "sosumi-mcpb-clean-room", version: "1.0.0" },
    })
    if (
      initialized.serverInfo?.name !== "sosumi" ||
      initialized.serverInfo?.version !== manifest.version
    )
      throw new Error(`Unexpected server identity: ${JSON.stringify(initialized.serverInfo)}`)
    child.stdin.write(
      `${JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" })}\n`,
    )
    const tools = await request("tools/list", {})
    const names = tools.tools.map((tool) => tool.name)
    if (JSON.stringify(names) !== JSON.stringify(expectedTools))
      throw new Error(`Unexpected tool list: ${JSON.stringify(names)}`)

    const calls = [
      ["searchAppleDocumentation", { query: "Swift Array" }],
      ["fetchAppleDocumentation", { path: "/documentation/swift/array" }],
      ["fetchAppleDocumentation", { path: "/design/human-interface-guidelines" }],
      [
        "fetchAppleDocumentation",
        { path: "/design/human-interface-guidelines/immersive-experiences" },
      ],
      ["fetchAppleVideoTranscript", { path: "/videos/play/wwdc2021/10133" }],
      [
        "fetchExternalDocumentation",
        { url: "https://apple.github.io/swift-argument-parser/documentation/argumentparser" },
      ],
    ]
    for (const [name, arguments_] of calls) {
      const result = await request("tools/call", { name, arguments: arguments_ })
      const text = result.content?.find((item) => item.type === "text")?.text
      if (typeof text !== "string" || text.length < 100)
        throw new Error(`MCP ${name} returned insufficient content`)
    }
    if (stderr.join("").includes("Sosumi MCP failed to start"))
      throw new Error(`Server stderr: ${stderr.join("")}`)
  } finally {
    child.kill("SIGTERM")
    await once(child, "exit")
  }
}

try {
  await verify()
  console.log("Clean-room MCPB verification passed")
} finally {
  rmSync(unpacked, { recursive: true, force: true })
}
