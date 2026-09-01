import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const stage = resolve(root, "artifacts", "stage")
const packageManifest = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8"))

rmSync(stage, { recursive: true, force: true })
mkdirSync(stage, { recursive: true })

for (const file of ["manifest.json", "BUNDLE_README.md", "LICENSE.md"])
  cpSync(resolve(root, file), resolve(stage, file))

mkdirSync(resolve(stage, "server"))
for (const file of ["stdio.js", "stdio.js.LEGAL.txt", "THIRD_PARTY_NOTICES.md"]) {
  const source = resolve(root, "dist", file)
  if (existsSync(source)) cpSync(source, resolve(stage, "server", file))
}

writeFileSync(
  resolve(stage, "package.json"),
  `${JSON.stringify(
    {
      name: packageManifest.name,
      version: packageManifest.version,
      private: true,
      type: "module",
      engines: packageManifest.engines,
    },
    null,
    2,
  )}\n`,
)
