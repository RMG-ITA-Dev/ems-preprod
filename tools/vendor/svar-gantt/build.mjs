// Deterministic build core for the vendored SVAR React Gantt bundle
// (Phase 4 plan §1.1). Invoked by acquire.mjs (online, one-time) and
// rebuild-offline.mjs (the normal path forever after). Can also be run
// directly: `node build.mjs [--write-manifest] [--outdir <dir>]`.
//
// Steps: assert the canonical environment → apply verified transforms
// T1–T3 (fails closed on hash/count drift) → bundle with esbuild
// (explicit exports, React externals, MIT banner) → emit artifacts →
// write or byte-compare the vendor manifest.
//
// The generated artifacts in src/components/scheduler/vendor/svar-gantt/
// are regenerated ONLY through this script — never hand-edited.

import { createHash } from "node:crypto";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { applyTransforms } from "./transform.mjs";

export const PIPELINE_DIR = path.dirname(fileURLToPath(import.meta.url));
export const DEFAULT_OUT_DIR = path.resolve(
  PIPELINE_DIR,
  "../../../src/components/scheduler/vendor/svar-gantt"
);
export const MANIFEST_PATH = path.join(PIPELINE_DIR, "vendor-manifest.json");

// Canonical rebuild platform (plan §1.1). Rebuilds elsewhere are
// unsupported — the deployed app never needs esbuild; platform
// specificity affects regeneration only.
export const CANONICAL_ENV = {
  node: "v20.20.2",
  npm: "10.8.2", // bundled with Node v20.20.2; used by acquire.mjs only
  platform: "linux",
  arch: "x64",
};

export const EXPECTED_EXPORTS = ["Gantt", "Willow", "WillowDark"];

const JS_BANNER = `/*!
 * EMS Scheduler vendored bundle — SVAR React Gantt v2.7.1
 * (@svar-ui/react-gantt plus its bundled @svar-ui/* dependencies).
 * MIT License — Copyright (c) 2025 XB Software Sp. z o.o.
 * Embeds date-fns code shipped inside the SVAR dists
 * (MIT — Copyright (c) 2021 Sasha Koss and Lesha Koss).
 * See LICENSES/svar-react-gantt.txt and LICENSES/THIRD-PARTY-NOTICES.md.
 *
 * GENERATED FILE — DO NOT EDIT BY HAND.
 * Regenerate only via tools/vendor/svar-gantt/build.mjs
 * (transformations T1–T3 applied; see tools/vendor/svar-gantt/README.md).
 */`;

const CSS_BANNER = `/*!
 * EMS Scheduler vendored styles — SVAR React Gantt v2.7.1 (style.css baseline).
 * MIT License — Copyright (c) 2025 XB Software Sp. z o.o.
 * GENERATED FILE — DO NOT EDIT BY HAND.
 * Regenerate only via tools/vendor/svar-gantt/build.mjs.
 */`;

export const sha256File = (p) =>
  createHash("sha256").update(readFileSync(p)).digest("hex");

export function assertEnvironment() {
  if (process.env.EMS_VENDOR_SKIP_ENV_CHECK === "1") {
    console.warn(
      "[build] WARNING: EMS_VENDOR_SKIP_ENV_CHECK=1 — canonical-environment check skipped; outputs are NOT authoritative."
    );
    return;
  }
  const problems = [];
  if (process.version !== CANONICAL_ENV.node)
    problems.push(`node ${process.version} != ${CANONICAL_ENV.node}`);
  if (process.platform !== CANONICAL_ENV.platform)
    problems.push(`platform ${process.platform} != ${CANONICAL_ENV.platform}`);
  if (process.arch !== CANONICAL_ENV.arch)
    problems.push(`arch ${process.arch} != ${CANONICAL_ENV.arch}`);
  if (problems.length) {
    throw new Error(
      `Not the canonical rebuild environment (plan §1.1): ${problems.join("; ")}.\n` +
        `Rebuild on Linux x64 with Node ${CANONICAL_ENV.node} (see README.md).`
    );
  }
}

function findUpstreamLicense(pipelineDir) {
  const pkgRoot = path.join(pipelineDir, "node_modules/@svar-ui/react-gantt");
  const candidate = readdirSync(pkgRoot).find((f) => /^licen[cs]e/i.test(f));
  if (!candidate) {
    throw new Error(
      "Upstream license file not found in @svar-ui/react-gantt — cannot satisfy attribution policy."
    );
  }
  return path.join(pkgRoot, candidate);
}

function verifyBundleExports(jsPath) {
  const src = readFileSync(jsPath, "utf8");
  const m = src.match(/export\s*\{([^}]*)\}\s*;?\s*$/);
  if (!m) throw new Error("Could not locate the export statement in the bundle.");
  const names = m[1]
    .split(",")
    .map((s) => s.trim().split(/\s+as\s+/).pop())
    .filter(Boolean)
    .sort();
  const expected = [...EXPECTED_EXPORTS].sort();
  if (JSON.stringify(names) !== JSON.stringify(expected)) {
    throw new Error(
      `Bundle export surface drifted: expected [${expected}], got [${names}]`
    );
  }
}

/**
 * Run the deterministic build.
 * @param {object} opts
 * @param {string} [opts.pipelineDir]  directory holding package.json/node_modules
 * @param {string} [opts.outDir]       artifact output directory
 * @param {boolean} [opts.writeManifest]  write vendor-manifest.json (acquire);
 *                                        otherwise byte-compare against it
 * @param {object} [opts.manifestExtras]  extra fields merged when writing
 * @returns {{outputs: Array<{file:string, sha256:string, bytes:number}>, transformations: object[], runtimeInputs: object}}
 */
export async function runBuild({
  pipelineDir = PIPELINE_DIR,
  outDir = DEFAULT_OUT_DIR,
  writeManifest = false,
  manifestExtras = {},
} = {}) {
  assertEnvironment();

  // Locate the archived platform binary explicitly so the build does not
  // depend on npm lifecycle scripts having run.
  const binPath = path.join(
    pipelineDir,
    "node_modules/@esbuild/linux-x64/bin/esbuild"
  );
  if (existsSync(binPath)) process.env.ESBUILD_BINARY_PATH = binPath;
  const esbuild = await import(
    path.join(pipelineDir, "node_modules/esbuild/lib/main.js")
  );

  console.log("[build] applying verified transformations T1–T3 …");
  const transformations = applyTransforms(pipelineDir);

  mkdirSync(outDir, { recursive: true });
  const jsOut = path.join(outDir, "svar-gantt.es.js");

  console.log("[build] bundling with esbuild (explicit exports, React externals) …");
  const result = await esbuild.build({
    absWorkingDir: pipelineDir,
    entryPoints: ["entry.js"],
    bundle: true,
    format: "esm",
    platform: "browser",
    target: "es2020",
    minify: false,
    sourcemap: false,
    charset: "utf8",
    legalComments: "inline",
    external: ["react", "react-dom", "react/jsx-runtime"],
    banner: { js: JS_BANNER, css: CSS_BANNER },
    outfile: jsOut,
    metafile: true,
    logLevel: "warning",
  });

  verifyBundleExports(jsOut);
  copyFileSync(findUpstreamLicense(pipelineDir), path.join(outDir, "license.txt"));

  const outputs = ["svar-gantt.es.js", "svar-gantt.es.css", "license.txt"].map(
    (f) => {
      const p = path.join(outDir, f);
      return { file: f, sha256: sha256File(p), bytes: readFileSync(p).length };
    }
  );

  // Per-package byte contributions (runtime classification evidence).
  const runtimeInputs = {};
  for (const [f, v] of Object.entries(result.metafile.inputs)) {
    const m = f.match(/node_modules\/(@[^/]+\/[^/]+|[^/@][^/]*)/);
    const key = m ? m[1] : f;
    runtimeInputs[key] = (runtimeInputs[key] || 0) + v.bytes;
  }

  if (writeManifest) {
    const manifest = {
      schemaVersion: 1,
      description:
        "Vendor manifest for the EMS Scheduler SVAR React Gantt bundle. Generated by tools/vendor/svar-gantt/acquire.mjs; verified by verify.mjs and the hermetic reconstruction gate.",
      environment: { ...CANONICAL_ENV },
      exports: EXPECTED_EXPORTS,
      transformations,
      outputs,
      runtimeInputs,
      ...manifestExtras,
    };
    writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2) + "\n");
    console.log("[build] vendor-manifest.json written.");
  } else {
    const manifest = JSON.parse(readFileSync(MANIFEST_PATH, "utf8"));
    for (const expected of manifest.outputs) {
      const actual = outputs.find((o) => o.file === expected.file);
      if (!actual || actual.sha256 !== expected.sha256) {
        throw new Error(
          `Reconstruction drift on ${expected.file}:\n  manifest ${expected.sha256}\n  rebuilt  ${actual?.sha256 ?? "(missing)"}`
        );
      }
    }
    console.log(
      "[build] rebuilt artifacts are byte-identical to the committed manifest hashes."
    );
  }

  return { outputs, transformations, runtimeInputs };
}

const invokedDirectly =
  process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (invokedDirectly) {
  const args = process.argv.slice(2);
  const outIdx = args.indexOf("--outdir");
  runBuild({
    writeManifest: args.includes("--write-manifest"),
    outDir: outIdx !== -1 ? path.resolve(args[outIdx + 1]) : DEFAULT_OUT_DIR,
  }).then(
    ({ outputs }) => {
      for (const o of outputs) console.log(`  ${o.file}  ${o.bytes} B  ${o.sha256}`);
    },
    (err) => {
      console.error("[build] FAILED:", err.message);
      process.exit(1);
    }
  );
}
