/**
 * ★ C7 (post-review) — types for the plain-JS O-7 fusion parameter guard.
 *
 * `fusionParamGuard.mjs` is deliberately untyped JavaScript so it can run as a
 * standalone CI script with no build step. Its test imports it, so under the
 * new test typecheck it would otherwise be an implicit `any` — which is
 * exactly how a wrong call signature stays invisible.
 *
 * ⛔ This declaration MIRRORS the JSDoc contract already written on
 * `scanForParameterAssignment` in the .mjs (@param {string[]} rootDirs,
 * @returns {{file, symbol, line, snippet}[]}). If that changes, change this.
 */
export interface FusionParamViolation {
  file: string;
  symbol: string;
  line: number;
  snippet: string;
}

export declare function scanForParameterAssignment(rootDirs: string[]): FusionParamViolation[];
