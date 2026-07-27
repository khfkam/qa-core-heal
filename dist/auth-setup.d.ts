import type { Page } from 'playwright';
/**
 * --auth-setup: explicit authenticated probing via the user's OWN login
 * code. The user points at a module + export ("utils/common.ts#login");
 * heal loads it and calls `await fn(page)` on a fresh page in the probing
 * context. This deliberately does NOT parse or re-execute beforeAll /
 * beforeEach hooks — setup code can seed data or trigger side effects, and
 * only the user can say what is safe to re-run.
 *
 * Loading uses the same TypeScript machinery as the config loader — a
 * CJS-compatible require shim resolved against the module's own location,
 * and the ESM-forcing retry hook for .ts files in typeless/commonjs
 * packages — but IN-PROCESS, because the function needs our live Page.
 *
 * Security: nothing here reads or logs credentials, cookie values, or
 * storage contents. Only file paths, export names, and pass/fail are ever
 * reported.
 */
export interface AuthSetup {
    fn: (page: Page) => Promise<void>;
    /** "utils/common.ts#login" — for messages; never contains secrets. */
    label: string;
}
/**
 * Family classifier for loader noise. Three families, matched by PATTERN
 * rather than exact strings, so a new Node phrasing of the same family is
 * caught without a code change each time (three phrasings seen so far:
 * the Type Stripping / stripTypeScriptTypes experimental warnings, the
 * "To load an ES module..." hint, and "Failed to load the ES module..."):
 *
 *   1. Module-load / ESM interop hints: the message must have an
 *      "ES module" SUBJECT and a load/parse VERB (or carry the
 *      typeless-package reparse code).
 *   2. Experimental-feature notices about module machinery: the warning
 *      type must be ExperimentalWarning AND the subject must be module
 *      loading / type stripping.
 *   3. Deprecation notices about module machinery: type
 *      DeprecationWarning AND a module-machinery subject (loaders,
 *      --experimental flags, require(esm), import assertions).
 *
 * Conservative by construction: everything else passes through
 * untouched. Families 2 and 3 require BOTH the warning type and the
 * module-machinery subject, so warnings originating from the user's own
 * test code or fixtures — their deprecations ("loginHelper() is
 * deprecated"), their custom warnings, their app's "experimental
 * feature" notices — are never suppressed.
 */
export declare function isLoaderNoise(name: string | undefined, message: string, code?: string): boolean;
/**
 * Resolve "file#exportName" — or "file:exportName", so zsh users need no
 * quotes — into a callable (default export when no separator). Throws with
 * a labeled, actionable message on every failure — a broken auth setup
 * must never degrade into an unauthenticated probe.
 */
export declare function loadAuthSetup(spec: string, baseDir: string): Promise<AuthSetup>;
/** Reject after `ms` so a hanging login can never stall the run forever. */
export declare function withTimeout<T>(p: Promise<T>, ms: number): Promise<T>;
