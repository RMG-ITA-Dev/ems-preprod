// OFFLINE reconstruction of the vendored SVAR React Gantt artifacts —
// the normal regeneration path forever after the one-time acquisition
// (Phase 4 plan §1.1).
//
// Committing tarballs beside a registry-resolved lockfile is NOT
// offline-capable (`npm ci --offline` still resolves registry URLs and
// fails ENOTCACHED — verified). The mechanism here is therefore an
// EMS-owned deterministic installer driven by offline-dependencies.json:
// every package — including nested duplicate versions — resolves to a
// repo-relative tarball whose SHA-256 is verified before extraction.
// npm is never invoked; only node + tar are required.
//
// Modes:
//   node rebuild-offline.mjs             rebuild in place (wipes the
//                                        pipeline node_modules, reinstalls
//                                        from tarballs, rebuilds artifacts,
//                                        byte-compares with the manifest)
//   node rebuild-offline.mjs --hermetic  the decisive proof: fresh temp
//                                        dir, new empty HOME/npm cache,
//                                        network blocked (unshare netns),
//                                        committed inputs only → outputs
//                                        must be byte-identical to the
//                                        committed manifest AND the
//                                        committed artifacts.

import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import {
  chmodSync,
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const PIPELINE_DIR = path.dirname(fileURLToPath(import.meta.url));
const MAP_PATH = path.join(PIPELINE_DIR, "offline-dependencies.json");

const sha256File = (p) =>
  createHash("sha256").update(readFileSync(p)).digest("hex");

/**
 * Install the exact node_modules layout from the committed tarball archive.
 * Verifies every tarball hash before extraction; throws on any gap.
 */
export function installOffline(targetDir, sourceDir = PIPELINE_DIR) {
  const map = JSON.parse(
    readFileSync(path.join(sourceDir, "offline-dependencies.json"), "utf8")
  );
  const entries = [...map.packages].sort(
    (a, b) => a.path.split("/").length - b.path.split("/").length ||
      a.path.localeCompare(b.path)
  );

  rmSync(path.join(targetDir, "node_modules"), { recursive: true, force: true });

  for (const e of entries) {
    const tarball = path.join(sourceDir, e.tarball);
    if (!existsSync(tarball)) {
      throw new Error(`Archive gap: missing tarball ${e.tarball} for ${e.name}@${e.version}`);
    }
    const actual = sha256File(tarball);
    if (actual !== e.sha256) {
      throw new Error(
        `Tarball hash mismatch for ${e.name}@${e.version}:\n  recorded ${e.sha256}\n  actual   ${actual}`
      );
    }
    const dest = path.join(targetDir, e.path);
    mkdirSync(dest, { recursive: true });
    const res = spawnSync(
      "tar",
      ["-xzf", tarball, "-C", dest, "--strip-components=1"],
      { stdio: "pipe", encoding: "utf8" }
    );
    if (res.status !== 0) {
      throw new Error(`tar extraction failed for ${e.tarball}: ${res.stderr}`);
    }
  }

  // The esbuild platform binary must be executable; lifecycle scripts never run.
  const esbuildBin = path.join(
    targetDir,
    "node_modules/@esbuild/linux-x64/bin/esbuild"
  );
  if (existsSync(esbuildBin)) chmodSync(esbuildBin, 0o755);

  console.log(`[rebuild] installed ${entries.length} packages from the tarball archive (no registry contact).`);
  return entries.length;
}

async function rebuildInPlace() {
  installOffline(PIPELINE_DIR);
  const { runBuild } = await import(pathToFileURL(path.join(PIPELINE_DIR, "build.mjs")));
  await runBuild({ writeManifest: false });
  console.log("[rebuild] in-place reconstruction complete and manifest-identical.");
}

const HERMETIC_INPUTS = [
  "package.json",
  "entry.js",
  "transform.mjs",
  "build.mjs",
  "offline-dependencies.json",
  "vendor-manifest.json",
  "tarballs",
];

/**
 * Verify (not assume) OS-level network isolation: no non-loopback
 * interface means the process physically cannot route packets off-host —
 * true inside `docker run --network none` OR an unshared net namespace.
 * This is a stronger P2-03 guarantee than trusting `unshare`'s exit code:
 * it proves the running environment is isolated rather than that a command
 * was accepted.
 */
function isNetworkIsolated() {
  for (const addrs of Object.values(os.networkInterfaces())) {
    for (const a of addrs ?? []) {
      if (!a.internal) return false; // a routable external interface exists
    }
  }
  return true;
}

async function rebuildHermetic(bestEffort) {
  let isolated = isNetworkIsolated();
  if (isolated) {
    // Already inside `docker run --network none` (the CI mechanism) or a
    // net namespace (an earlier re-exec) — proceed with the authoritative
    // rebuild.
    console.log("[hermetic] verified network isolation (loopback-only interfaces).");
  } else {
    // Try to OBTAIN isolation via an unprivileged network namespace.
    const probe = spawnSync("unshare", ["-rn", "true"], { stdio: "ignore" });
    if (probe.status === 0) {
      console.log("[hermetic] re-executing inside an unshared network namespace …");
      const res = spawnSync(
        "unshare",
        ["-rn", process.execPath, fileURLToPath(import.meta.url), "--hermetic"],
        { stdio: "inherit" }
      );
      process.exit(res.status ?? 1);
    }
    // No OS-level isolation available. `--hermetic` FAILS CLOSED here
    // (PR #214 adversarial review P2-03): proxy variables cannot stop raw
    // sockets, DNS, or proxy-ignoring code, so a proxy-poisoned run is
    // NOT an authoritative network-isolation proof and must never be
    // reported as one. GitHub-hosted runners (Ubuntu 24.04) restrict
    // unprivileged `unshare`, so CI runs this job inside
    // `docker run --network none` instead. `--best-effort` exists for
    // developer convenience on hosts without either mechanism (e.g. macOS).
    if (!bestEffort) {
      throw new Error(
        "No OS-level network isolation available.\n" +
          "  • CI / Linux runners: run inside `docker run --network none …` (recommended;\n" +
          "    see .github/workflows/scheduler-integrity.yml).\n" +
          "  • Linux with user namespaces: `unshare -rn` is used automatically.\n" +
          "  • Otherwise, `--hermetic --best-effort` gives a NON-authoritative dev run."
      );
    }
    console.warn(
      "[hermetic] BEST-EFFORT MODE: no OS-level isolation; proxy env poisoned only. " +
        "This run is NOT an authoritative network-isolation proof."
    );
    process.env.HTTP_PROXY = "http://127.0.0.1:9";
    process.env.HTTPS_PROXY = "http://127.0.0.1:9";
    process.env.NO_PROXY = "";
  }

  const tmp = mkdtempSync(path.join(os.tmpdir(), "svar-hermetic-"));
  const home = path.join(tmp, "home");
  const cache = path.join(tmp, "npm-cache");
  mkdirSync(home, { recursive: true });
  mkdirSync(cache, { recursive: true });
  // Fresh HOME and a new empty npm cache: a populated developer cache can
  // never mask an archive gap (npm itself is never invoked here anyway).
  process.env.HOME = home;
  process.env.npm_config_cache = cache;

  const work = path.join(tmp, "pipeline");
  mkdirSync(work, { recursive: true });
  for (const input of HERMETIC_INPUTS) {
    cpSync(path.join(PIPELINE_DIR, input), path.join(work, input), {
      recursive: true,
    });
  }
  console.log(`[hermetic] working dir: ${work} (committed inputs only)`);

  installOffline(work, work);

  const outDir = path.join(tmp, "out");
  const { runBuild } = await import(pathToFileURL(path.join(work, "build.mjs")));
  // build.mjs compares against ITS adjacent vendor-manifest.json — the
  // committed copy we just brought along — and throws on any drift.
  const { outputs } = await runBuild({
    pipelineDir: work,
    outDir,
    writeManifest: false,
  });

  // Belt and suspenders: also byte-compare with the committed artifacts.
  const committedDir = path.resolve(
    PIPELINE_DIR,
    "../../../src/components/scheduler/vendor/svar-gantt"
  );
  for (const o of outputs) {
    const committed = path.join(committedDir, o.file);
    if (existsSync(committed) && sha256File(committed) !== o.sha256) {
      throw new Error(
        `Hermetic output ${o.file} differs from the committed artifact — regenerate via build.mjs and review.`
      );
    }
  }

  rmSync(tmp, { recursive: true, force: true });
  if (isolated) {
    console.log(
      "[hermetic] PASS — empty cache, network isolation verified (loopback-only), committed inputs only → byte-identical artifacts."
    );
  } else {
    console.log(
      "[hermetic] best-effort PASS — byte-identical artifacts from committed inputs; network isolation NOT proven in this mode."
    );
  }
}

const invokedDirectly =
  process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (invokedDirectly) {
  const hermetic = process.argv.includes("--hermetic");
  const bestEffort = process.argv.includes("--best-effort");
  (hermetic ? rebuildHermetic(bestEffort) : rebuildInPlace()).catch((err) => {
    console.error("[rebuild] FAILED:", err.message);
    process.exit(1);
  });
}
