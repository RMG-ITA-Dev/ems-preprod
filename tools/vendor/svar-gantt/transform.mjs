// Verified build-time transformations for the vendored SVAR React Gantt
// bundle (Phase 4 plan §1.1). Each transformation pins the SHA-256 of its
// pristine input file and an exact expected match count, and FAILS CLOSED
// on any mismatch. This is a deterministic, documented build step — never
// hand-editing. If an upstream version bump changes these files, the
// pinned hashes/counts must be re-derived and re-reviewed (see README.md).
//
//  T1 remove-svar-font-cdn-injection
//     The Willow / WillowDark / Material theme components in
//     @svar-ui/react-core destructure `{ fonts = true }` and, when true,
//     inject <link rel="preconnect" href="https://cdn.svar.dev"> and
//     <link rel="stylesheet" href="https://cdn.svar.dev/fonts/wxi/wx-icons.css">
//     into the DOM. Patching only the default would leave the branch and
//     its URL strings re-activatable via fonts={true}; the ENTIRE branch
//     is removed instead (replaced with `!1`).
//
//  T2 disable-xlsx-worker-export
//     @svar-ui/grid-store's DataStore.getXlsxWorker builds a Blob of
//     `importScripts(...)` and spawns `new Worker(...)`. The method lives
//     on a retained store class, so tree shaking cannot drop it (verified:
//     the tokens survive an explicit-export bundle). The method body is
//     replaced with a local rejecting stub; zero importScripts / Worker
//     tokens may remain afterwards.
//
//  T3 set-theme-fonts-default-false
//     Defense in depth on top of T1: flip the `fonts = true` destructure
//     defaults to false in the same theme components.

import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const sha256 = (buf) => createHash("sha256").update(buf).digest("hex");

// The full injected branch inside each theme component, e.g.:
//   t && /* @__PURE__ */ L(Q, { children: [
//     /* @__PURE__ */ r("link", { rel: "preconnect", href: "https://cdn.svar.dev", crossOrigin: "true" }),
//     /* @__PURE__ */ r(Qe, {}),
//     /* @__PURE__ */ r("link", { rel: "stylesheet", href: "https://cdn.svar.dev/fonts/wxi/wx-icons.css" })
//   ] })
// Identifiers are minifier-assigned, so they are matched generically; the
// two literal cdn.svar.dev URLs anchor the match.
const T1_BRANCH_RE =
  /[\w$]+ && \/\* @__PURE__ \*\/ [\w$]+\([\w$]+, \{ children: \[\s*\/\* @__PURE__ \*\/ [\w$]+\(\s*"link",\s*\{\s*rel: "preconnect",\s*href: "https:\/\/cdn\.svar\.dev",\s*crossOrigin: "true"\s*\}\s*\),\s*\/\* @__PURE__ \*\/ [\w$]+\([\w$]+, \{\}\),\s*\/\* @__PURE__ \*\/ [\w$]+\(\s*"link",\s*\{\s*rel: "stylesheet",\s*href: "https:\/\/cdn\.svar\.dev\/fonts\/wxi\/wx-icons\.css"\s*\}\s*\)\s*\] \}\)/g;

const T3_FONTS_DEFAULT_RE = /\{ fonts: ([\w$]+) = !0, children: ([\w$]+) \}/g;

const T2_WORKER_RE =
  /getXlsxWorker\([\w$]+\)\{if\(!this\._xlsxWorker\)\{[\s\S]*?\}return this\._xlsxWorker\}/;

const T2_STUB =
  'getXlsxWorker(){return Promise.reject(new Error("XLSX export is not included in the EMS Scheduler build"))}';

/**
 * @typedef {Object} TransformSpec
 * @property {string} id
 * @property {string} file        repo-relative path inside the pipeline dir
 * @property {string} inputSha256 pinned pristine-input hash
 * @property {(src: string) => string} apply  throws on any count mismatch
 */

/** @type {TransformSpec[]} */
export const TRANSFORMS = [
  {
    id: "remove-svar-font-cdn-injection",
    file: "node_modules/@svar-ui/react-core/dist/index.es.js",
    inputSha256:
      "338f572a29ad3bc9f1bc3d56670310166f434f26af11091b25348009fcaccfc1",
    expectedMatches: 3,
    apply(src) {
      const matches = src.match(T1_BRANCH_RE) ?? [];
      if (matches.length !== 3) {
        throw new Error(
          `T1: expected exactly 3 CDN-injection branches, found ${matches.length}`
        );
      }
      const out = src.replace(T1_BRANCH_RE, "!1");
      const residual = (out.match(/cdn\.svar\.dev/g) ?? []).length;
      if (residual !== 0) {
        throw new Error(
          `T1: ${residual} cdn.svar.dev reference(s) survived branch removal`
        );
      }
      return out;
    },
  },
  {
    id: "disable-xlsx-worker-export",
    file: "node_modules/@svar-ui/grid-store/dist/index.js",
    inputSha256:
      "0486791641e6c24b9adda0ec84439cc18d411761d7a2cf4e8587ab4ac5c23b12",
    expectedMatches: 1,
    apply(src) {
      const matches = src.match(T2_WORKER_RE) ?? [];
      if (matches.length !== 1) {
        throw new Error(
          `T2: expected exactly 1 getXlsxWorker method, found ${matches.length}`
        );
      }
      const out = src.replace(T2_WORKER_RE, T2_STUB);
      for (const token of ["importScripts", "new Worker", "SharedWorker"]) {
        const residual = out.split(token).length - 1;
        if (residual !== 0) {
          throw new Error(`T2: ${residual} "${token}" token(s) survived stubbing`);
        }
      }
      return out;
    },
  },
  {
    id: "set-theme-fonts-default-false",
    file: "node_modules/@svar-ui/react-core/dist/index.es.js",
    inputSha256: null, // runs on T1's output of the same file; T1 pins the pristine input
    expectedMatches: 3,
    apply(src) {
      const matches = src.match(T3_FONTS_DEFAULT_RE) ?? [];
      if (matches.length !== 3) {
        throw new Error(
          `T3: expected exactly 3 \`fonts = true\` defaults, found ${matches.length}`
        );
      }
      return src.replace(T3_FONTS_DEFAULT_RE, "{ fonts: $1 = !1, children: $2 }");
    },
  },
];

/**
 * Apply all transformations in order against `rootDir` (the pipeline
 * directory containing node_modules). Returns the transformation records
 * for the vendor manifest. Throws — fails closed — on any hash or count
 * mismatch, or if a target file has already been transformed.
 */
export function applyTransforms(rootDir) {
  const records = [];
  const seen = new Map(); // file -> current content (chains T1 -> T3)

  for (const t of TRANSFORMS) {
    const abs = path.join(rootDir, t.file);
    const before = seen.get(t.file) ?? readFileSync(abs, "utf8");
    const beforeHash = sha256(before);
    if (t.inputSha256 && beforeHash !== t.inputSha256) {
      throw new Error(
        `${t.id}: input hash mismatch for ${t.file}\n  expected ${t.inputSha256}\n  actual   ${beforeHash}\n` +
          `The upstream dist changed (or node_modules is dirty) — re-derive the transform against a fresh install.`
      );
    }
    const after = t.apply(before);
    seen.set(t.file, after);
    records.push({
      id: t.id,
      file: t.file,
      inputSha256: beforeHash,
      outputSha256: sha256(after),
      expectedMatches: t.expectedMatches,
    });
  }

  for (const [file, content] of seen) {
    writeFileSync(path.join(rootDir, file), content);
  }
  return records;
}
