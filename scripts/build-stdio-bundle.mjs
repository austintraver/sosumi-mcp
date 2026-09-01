import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { dirname, join, relative, resolve } from "node:path"
import { build } from "esbuild"

const root = resolve(import.meta.dirname, "..")
const dist = resolve(root, "dist")
const entryPoint = resolve(root, "src", "stdio.ts")
const outfile = resolve(dist, "stdio.js")

rmSync(dist, { recursive: true, force: true })
mkdirSync(dist, { recursive: true })

const result = await build({
  entryPoints: [entryPoint],
  outfile,
  bundle: true,
  format: "esm",
  legalComments: "linked",
  metafile: true,
  platform: "node",
  sourcemap: false,
  target: ["node20"],
  treeShaking: true,
})

const packages = new Map()
for (const input of Object.keys(result.metafile.inputs)) {
  const absolute = resolve(root, input)
  const packageRoot = findPackageRoot(absolute)
  if (!packageRoot) continue
  const manifest = JSON.parse(readFileSync(join(packageRoot, "package.json"), "utf8"))
  packages.set(`${manifest.name}@${manifest.version}`, { manifest, packageRoot })
}

const notices = [
  "# Third-Party Notices",
  "",
  "This bundle contains only code reachable from `src/stdio.ts`. The notices below cover the packages included by the compiled bundle.",
]

for (const [identity, { manifest, packageRoot }] of [...packages.entries()].sort(([a], [b]) =>
  a.localeCompare(b),
)) {
  notices.push("", `## ${identity}`, "", `License: ${manifest.license ?? "not declared"}`)
  if (manifest.repository?.url) notices.push(`Source: ${manifest.repository.url}`)
  const licenseFiles = findLicenseFiles(packageRoot)
  if (licenseFiles.length === 0) {
    notices.push(
      "",
      "No standalone license file was included in this package; see the declared license above.",
    )
    continue
  }
  for (const licenseFile of licenseFiles) {
    notices.push(
      "",
      `### ${relative(packageRoot, licenseFile)}`,
      "",
      readFileSync(licenseFile, "utf8").trim(),
    )
  }
}

writeFileSync(resolve(dist, "THIRD_PARTY_NOTICES.md"), `${notices.join("\n")}\n`)
writeFileSync(
  resolve(dist, "bundle-metafile.json"),
  `${JSON.stringify(result.metafile, null, 2)}\n`,
)

function findPackageRoot(file) {
  let candidate = dirname(file)
  while (candidate.startsWith(root)) {
    const manifest = join(candidate, "package.json")
    if (existsSync(manifest) && candidate.includes(join("node_modules", ""))) {
      const packageManifest = JSON.parse(readFileSync(manifest, "utf8"))
      if (packageManifest.name) return candidate
    }
    const parent = dirname(candidate)
    if (parent === candidate) return undefined
    candidate = parent
  }
  return undefined
}

function findLicenseFiles(packageRoot) {
  return readdirSync(packageRoot, { withFileTypes: true })
    .filter((entry) => entry.isFile() && /^(license|copying|notice)(\.|$)/i.test(entry.name))
    .map((entry) => join(packageRoot, entry.name))
    .sort()
}
