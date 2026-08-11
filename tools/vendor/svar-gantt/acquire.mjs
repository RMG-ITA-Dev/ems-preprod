// ONLINE, one-time acquisition of the SVAR React Gantt vendor closure
// (Phase 4 plan §1.1). This is the ONLY network-dependent moment of the
// vendoring pipeline. It:
//
//   1. installs the exact pins with npm (canonical environment enforced),
//   2. snapshots the registry-resolved graph to package-lock.online.json,
//   3. downloads every resolved tarball of the INSTALLED tree (including
//      nested duplicate versions) into tarballs/, verifying each against
//      the lockfile's SRI integrity,
//   4. generates offline-dependencies.json — the file-resolved map that
//      rebuild-offline.mjs installs from, forever, with no registry,
//   5. runs the deterministic build (transforms T1–T3 + esbuild) and
//      writes vendor-manifest.json,
//   6. generates LICENSES/THIRD-PARTY-NOTICES.md (dual inventory: runtime
//      + archived tooling; entry count must equal tarball count),
//   7. proves the whole thing with the hermetic reconstruction gate
//      (fresh temp dir, empty npm cache, network blocked, byte-identical
//      hashes) before anything is considered committable.
//
// Non-Linux-x64 esbuild platform binaries are intentionally NOT archived:
// the canonical rebuild platform is pinned (see build.mjs CANONICAL_ENV)
// and the deployed app never needs esbuild.

import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  assertEnvironment,
  CANONICAL_ENV,
  runBuild,
  MANIFEST_PATH,
} from "./build.mjs";

const PIPELINE_DIR = path.dirname(fileURLToPath(import.meta.url));
const TARBALLS_DIR = path.join(PIPELINE_DIR, "tarballs");
const MAP_PATH = path.join(PIPELINE_DIR, "offline-dependencies.json");
const LICENSES_DIR = path.resolve(PIPELINE_DIR, "../../../LICENSES");
const NOTICES_PATH = path.join(LICENSES_DIR, "THIRD-PARTY-NOTICES.md");

const sha256 = (buf) => createHash("sha256").update(buf).digest("hex");
const sriSha512 = (buf) =>
  "sha512-" + createHash("sha512").update(buf).digest("base64");

function run(cmd, args, opts = {}) {
  const res = spawnSync(cmd, args, {
    cwd: PIPELINE_DIR,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    ...opts,
  });
  if (res.status !== 0) {
    throw new Error(`${cmd} ${args.join(" ")} failed:\n${res.stderr || res.stdout}`);
  }
  return res.stdout;
}

function nameFromLockPath(lockPath) {
  const idx = lockPath.lastIndexOf("node_modules/");
  return lockPath.slice(idx + "node_modules/".length);
}

function safeTarballName(name, version) {
  return `${name.replace("@", "").replace("/", "-")}-${version}.tgz`;
}

function extractCopyright(pkgDir, pkgJson) {
  const licFile = readdirSync(pkgDir).find((f) => /^licen[cs]e/i.test(f));
  if (licFile) {
    const text = readFileSync(path.join(pkgDir, licFile), "utf8");
    const line = text.split("\n").find((l) => /copyright/i.test(l));
    if (line) return line.trim();
  }
  if (typeof pkgJson.author === "string") return pkgJson.author;
  if (pkgJson.author?.name) return pkgJson.author.name;
  return "(no copyright line in package — see the project repository)";
}

async function main() {
  assertEnvironment();
  const npmVersion = run("npm", ["--version"]).trim();
  if (npmVersion !== CANONICAL_ENV.npm) {
    throw new Error(
      `npm ${npmVersion} != canonical ${CANONICAL_ENV.npm} (bundled with Node ${CANONICAL_ENV.node}).`
    );
  }

  console.log("[acquire] fresh online install of the pinned graph …");
  rmSync(path.join(PIPELINE_DIR, "node_modules"), { recursive: true, force: true });
  rmSync(path.join(PIPELINE_DIR, "package-lock.json"), { force: true });
  run("npm", ["install", "--no-audit", "--no-fund"]);
  copyFileSync(
    path.join(PIPELINE_DIR, "package-lock.json"),
    path.join(PIPELINE_DIR, "package-lock.online.json")
  );

  const lock = JSON.parse(
    readFileSync(path.join(PIPELINE_DIR, "package-lock.json"), "utf8")
  );

  console.log("[acquire] archiving the installed closure …");
  rmSync(TARBALLS_DIR, { recursive: true, force: true });
  mkdirSync(TARBALLS_DIR, { recursive: true });

  const packages = [];
  for (const [lockPath, entry] of Object.entries(lock.packages)) {
    if (!lockPath || !entry.resolved || !entry.integrity) continue;
    // Only the INSTALLED tree: skips other platforms' esbuild binaries.
    if (!existsSync(path.join(PIPELINE_DIR, lockPath))) continue;

    const name = nameFromLockPath(lockPath);
    const version = entry.version;
    const tarballFile = safeTarballName(name, version);
    const dest = path.join(TARBALLS_DIR, tarballFile);

    if (!existsSync(dest)) {
      run("curl", ["-sS", "--fail", "--retry", "3", "-o", dest, entry.resolved]);
    }
    const buf = readFileSync(dest);
    if (entry.integrity.startsWith("sha512-") && sriSha512(buf) !== entry.integrity) {
      throw new Error(
        `Integrity mismatch for ${name}@${version} (${entry.resolved}) — refusing to archive.`
      );
    }
    packages.push({
      path: lockPath,
      name,
      version,
      tarball: `tarballs/${tarballFile}`,
      integrity: entry.integrity,
      sha256: sha256(buf),
      bytes: buf.length,
    });
  }
  packages.sort((a, b) => a.path.localeCompare(b.path));
  const archiveBytes = packages.reduce((s, p) => s + p.bytes, 0);
  writeFileSync(
    MAP_PATH,
    JSON.stringify(
      {
        description:
          "Offline reconstruction map: every installed package resolves to a repo-relative tarball. Generated by acquire.mjs — never hand-edited. Consumed by rebuild-offline.mjs.",
        packages,
      },
      null,
      2
    ) + "\n"
  );
  console.log(
    `[acquire] ${packages.length} tarballs archived (${(archiveBytes / 1024 / 1024).toFixed(1)} MB).`
  );

  console.log("[acquire] deterministic build (T1–T3 + esbuild) …");
  const pins = JSON.parse(
    readFileSync(path.join(PIPELINE_DIR, "package.json"), "utf8")
  );
  const { runtimeInputs } = await runBuild({
    writeManifest: true,
    manifestExtras: {
      pins: { ...pins.dependencies, ...pins.devDependencies },
      acquiredAt: new Date().toISOString(),
      acquiredWithNpm: npmVersion,
      // Terminology (PR #214 review P2-06): installed package ENTRIES vs
      // unique tarball FILES — nested duplicate versions reuse a file.
      closureEntryCount: packages.length,
      uniqueTarballFileCount: new Set(packages.map((p) => p.tarball)).size,
      archiveBytes,
      inputs: packages,
    },
  });

  console.log("[acquire] generating LICENSES/THIRD-PARTY-NOTICES.md …");
  const PEER_CHAIN = new Set([
    "react",
    "react-dom",
    "scheduler",
    "js-tokens",
    "loose-envify",
  ]);
  const classify = (p) => {
    if ((runtimeInputs[p.name] ?? 0) > 0) return "runtime";
    if (PEER_CHAIN.has(p.name))
      return "peer chain (external at runtime; EMS app provides React)";
    if (p.name === "esbuild" || p.name.startsWith("@esbuild/")) return "build-only";
    return "installed, no bytes in bundle";
  };
  const rows = packages.map((p) => {
    const pkgDir = path.join(PIPELINE_DIR, p.path);
    const pkgJson = JSON.parse(readFileSync(path.join(pkgDir, "package.json"), "utf8"));
    const license = pkgJson.license ?? "(unspecified — see project)";
    return { ...p, license, copyright: extractCopyright(pkgDir, pkgJson), kind: classify(p) };
  });
  const runtimeRows = rows.filter((r) => r.kind === "runtime");
  const otherRows = rows.filter((r) => r.kind !== "runtime");
  const table = (rs) =>
    [
      "| Package | Version | License | Copyright | Tarball | npm integrity | SHA-256 | Classification |",
      "|---|---|---|---|---|---|---|---|",
      ...rs.map(
        (r) =>
          `| ${r.name} | ${r.version} | ${r.license} | ${r.copyright.replace(/\|/g, "\\|")} | ${r.tarball} | \`${r.integrity}\` | \`${r.sha256}\` | ${r.kind} |`
      ),
    ].join("\n");
  mkdirSync(LICENSES_DIR, { recursive: true });
  writeFileSync(
    NOTICES_PATH,
    `# Third-Party Notices — EMS Scheduler SVAR Gantt vendor archive

> GENERATED by \`tools/vendor/svar-gantt/acquire.mjs\` — do not edit by hand.
> Covers the COMPLETE archived install closure in \`tools/vendor/svar-gantt/tarballs/\`
> (runtime bundle contributors AND build-only tooling), per the Phase 4 plan §1.6.
> Full license texts for the principal components live beside this file
> (\`svar-react-gantt.txt\`, \`date-fns.txt\`, \`ibm-plex-sans.txt\`, \`lucide.txt\`).

Total archived install-closure entries: **${rows.length}**, backed by **${new Set(rows.map((r) => r.tarball)).size}** unique tarball files (nested duplicate versions intentionally reuse a tarball). Entry count below equals the closure count; \`verify.mjs\` also rejects orphan tarball files.

## 1. Runtime artifact inventory
Packages contributing bytes to \`svar-gantt.es.js\` / \`svar-gantt.es.css\`:

${table(runtimeRows)}

## 2. Archived tooling inventory
Build-only and externally-provided packages archived for offline reconstruction:

${table(otherRows)}
`
  );
  if (rows.length !== packages.length) {
    throw new Error("License inventory count != archived tarball count.");
  }
  // Record the final counts in the manifest.
  const manifest = JSON.parse(readFileSync(MANIFEST_PATH, "utf8"));
  manifest.licenseInventoryCount = rows.length;
  writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2) + "\n");

  console.log("[acquire] hermetic reconstruction gate (the decisive proof) …");
  const res = spawnSync(
    process.execPath,
    [path.join(PIPELINE_DIR, "rebuild-offline.mjs"), "--hermetic"],
    { stdio: "inherit" }
  );
  if (res.status !== 0) {
    throw new Error("Hermetic reconstruction FAILED — do not commit this acquisition.");
  }

  console.log(
    "[acquire] COMPLETE. Commit: tarballs/, offline-dependencies.json, package-lock.online.json, vendor-manifest.json, the generated artifacts, and LICENSES/THIRD-PARTY-NOTICES.md."
  );
}

main().catch((err) => {
  console.error("[acquire] FAILED:", err.message);
  process.exit(1);
});
