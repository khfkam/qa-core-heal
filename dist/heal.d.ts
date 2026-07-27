import { type CascadeLevel } from './selectors.js';
import { type RouteOverride } from './routes.js';
/**
 * Standalone selector healing for an existing Playwright spec.
 *
 * Given a spec whose selectors no longer match the live page, this:
 *
 *   1. Loads the spec and, if it uses POM, the page-object files it imports
 *      (the locators live there, not in the spec).
 *   2. Opens the live page the spec targets (from a page.goto or the page
 *      object's `url`, or an explicit --base-url).
 *   3. Probes every locator against the live page. One that still resolves is
 *      left untouched.
 *   4. A locator that no longer resolves is re-resolved with the SAME locator
 *      ladder and healResolve logic the Explorer uses (semantic intent, a
 *      different stable locator), NOT an LLM guess.
 *   5. Confirms the re-resolved element is the SAME intended element (its
 *      accessible name / text / label still matches the original intent). A
 *      heal to the wrong element is worse than no heal, so an unconfirmed or
 *      ambiguous match is refused.
 *   6. Writes the repaired files back and reports every heal and every locator
 *      it could not heal. An unhealable selector is reported, never silently
 *      left or wrongly changed.
 *
 * This is fully deterministic: no spec run, no model call. It reuses
 * `healResolve` and the cascade from selectors.ts, and `emitLocatorCall` to
 * write the new locator, so there is one locator ladder in the codebase.
 */
export interface HealOptions {
    /** Single spec path; kept for back-compat. Use specPaths for a whole run. */
    specPath?: string;
    /**
     * All spec files of the run, healed jointly: a page object imported by
     * several specs is scanned once and probed on every importing spec's route.
     */
    specPaths?: string[];
    /** Per-file route overrides (--route <file>=<route>). */
    routeOverrides?: RouteOverride[];
    /**
     * Run-first mode: probe ONLY locator calls matching these selectors (as
     * Playwright prints them, e.g. "locator('#x')"), each on its failure-time
     * URL when known. Calls not matching any target are skipped entirely.
     */
    targets?: HealTarget[];
    /** Base URL override. When absent, resolved from the project's playwright config, then the specs. */
    baseUrl?: string;
    /** Playwright project name, for configs whose projects disagree on baseURL. */
    project?: string;
    /** Write repaired files to disk. Default true; false previews without writing. */
    write?: boolean;
    /** Accepted for back-compat with older callers; unused (healing is model-free). */
    model?: string;
    onEvent?: (event: HealEvent) => void;
    /** Cap on heals recorded per run; heals beyond the cap are refused. */
    maxHeals?: number;
    /** When set, a heal landing on a cascade level not in this list is refused. */
    allowedLevels?: CascadeLevel[];
    /** Follow relative imports to page objects. Default true. */
    followImports?: boolean;
    /** Extra directories whose .ts/.js files are also scanned for locators. */
    pageObjectDirs?: string[];
    /**
     * Page-object helpers that wrap `page.locator`, e.g. `["$"]` for
     * `this.$('css')`. Empty/undefined keeps stock page/this.page parsing.
     */
    wrappers?: string[];
    /** Playwright storage state file for authenticated pages. */
    storageState?: string;
    /**
     * "file#exportName" of the user's own login function, called with a page
     * in the probing context before probing. Takes precedence over
     * storageState. Failures are loud, never a silent unauthenticated probe.
     */
    authSetup?: string;
    /** Milliseconds before a hanging auth setup fails the run. Default 60000. */
    authSetupTimeout?: number;
    /**
     * Cap (ms) on the mutation-quiet settle before fuzzy candidate
     * collection on SPA pages. Default 2000; 0 disables the wait.
     */
    settleMs?: number;
    /**
     * Detailed progress on stderr: per-route probe outcomes and fuzzy
     * candidate scoring. Adds lines only — never alters verdicts, reasons,
     * or the report.
     */
    verbose?: boolean;
}
export type HealEvent = {
    type: 'scanned';
    total: number;
    files: number;
} | {
    type: 'opened_page';
    url: string;
} | {
    type: 'intact';
    selector: string;
} | {
    type: 'healing';
    selector: string;
    file: string;
} | {
    type: 'healed';
    old: string;
    new: string;
    level: CascadeLevel;
    file: string;
} | {
    type: 'unhealed';
    selector: string;
    reason: string;
    file: string;
} | {
    type: 'done';
    healed: number;
    unhealed: number;
    intact: number;
    total: number;
    files: string[];
};
export interface HealTarget {
    /** Selector call text, root stripped: "locator('#x')", "getByRole(...)". */
    selector: string;
    /** Page URL at failure time; absent falls back to route inference. */
    url?: string;
    /** Title of the failing test, for reporting. */
    test?: string;
    /** Failure stack frames (most specific first), the PRIMARY match signal. */
    locations?: Array<{
        file: string;
        line: number;
    }>;
    /**
     * The failure was a strict mode violation: the locator matched SEVERAL
     * elements. A probe finding a multi-match must treat that as the failure
     * itself (positional intent was deleted), never as an intact locator.
     */
    strict?: boolean;
}
export interface HealDetail {
    file: string;
    line: number;
    old: string;
    new: string;
    level: CascadeLevel;
}
export interface UnhealDetail {
    file: string;
    selector: string;
    reason: string;
}
/** One entry per scanned locator, in scan order. Powers the machine-readable report. */
export interface LocatorReport {
    /** Relative to the working directory, forward slashes. */
    file: string;
    /** 1-indexed source line. */
    line: number;
    old: string;
    /** The proposed replacement call; null unless healed. */
    new: string | null;
    /** Healed: the new locator's cascade level. Otherwise the original locator's. */
    level: CascadeLevel;
    ambiguous: boolean;
    status: 'healed' | 'intact' | 'refused';
    /** Present only when status is refused. */
    reason?: string;
}
export interface HealResult {
    /** The spec path when it (or a POM file) was written; null when nothing changed. */
    healedPath: string | null;
    filesWritten: string[];
    scanned: number;
    intact: number;
    healed: HealDetail[];
    unhealable: UnhealDetail[];
    /** Total locators scanned. Kept for back-compat with `${healed}/${total}` callers. */
    total: number;
    /** One entry per scanned locator, in scan order. */
    locators: LocatorReport[];
    /** Spec path -> every file gathered for it (itself + page objects). */
    specFiles: Record<string, string[]>;
    /** Targets that matched NO locator call in the gathered sources. */
    unmatchedTargets: HealTarget[];
    /** Files that could not be read while gathering; their locators were skipped. */
    fileErrors: FileError[];
    /**
     * The EXACT write plan behind this result's healed verdicts: per file,
     * the source as scanned plus the edits computed against it. Applying
     * this plan (applyHealPlan) writes precisely the previewed diff — no
     * re-probe, no re-scoring, no chance for the page to change the verdict
     * between preview and consent. Present in preview runs too.
     */
    plan: HealPlanEntry[];
}
export interface HealPlanEntry {
    file: string;
    /** The file content the edits were computed against. */
    src: string;
    edits: Edit[];
}
/**
 * Write a previously computed heal plan to disk, exactly as previewed.
 * Consent (--yes or the prompt) must only ever gate THIS — never a second
 * probe whose verdicts could differ from what the user approved.
 */
export declare function applyHealPlan(plan: HealPlanEntry[]): string[];
/**
 * Re-write planned files KEEPING only the edits not excluded: the revert
 * path for heals whose verify re-run still failed. A file whose every
 * edit is excluded is restored byte-identical to the scanned source.
 */
export declare function applyHealPlanExcluding(plan: HealPlanEntry[], excluded: (file: string, edit: Edit) => boolean): void;
declare const LOCATOR_METHODS: readonly ["getByRole", "getByLabel", "getByPlaceholder", "getByText", "getByAltText", "getByTitle", "getByTestId", "locator"];
type LocatorMethod = (typeof LOCATOR_METHODS)[number];
interface LocatorArgs {
    role?: string;
    name?: string;
    exact?: boolean;
    label?: string;
    placeholder?: string;
    text?: string;
    alt?: string;
    title?: string;
    testid?: string;
    css?: string;
    xpath?: string;
    /** The { hasText: "..." } filter on a locator() call, when present. */
    hasText?: string;
    /**
     * Every getByRole option beyond name/exact, parsed to canonical values
     * (checked/disabled/expanded/includeHidden/pressed/selected as booleans,
     * level as a number). Part of the call's identity: checked:false means
     * an UNCHECKED checkbox, not an unset option.
     */
    roleOpts?: Record<string, boolean | number>;
}
interface LocatorCall {
    file: string;
    line: number;
    startCol: number;
    /** Line the call's closing paren sits on: > line for a wrapped call. */
    endLine: number;
    endCol: number;
    /** The `page...getByX(...)` text, newlines collapsed for display; no trailing .first()/.click(). */
    raw: string;
    root: string;
    /**
     * When set, the call was `this.<wrapper>(...)` rather than
     * `page.locator(...)` / `this.page.locator(...)`.
     */
    wrapper?: string;
    method: LocatorMethod;
    level: CascadeLevel;
    frameChain: string[];
    args: LocatorArgs;
    /** Rest of the END line after the call: the API chained on it (".fill(...)"). */
    trailing: string;
}
/**
 * Extract every locator chain in a file: page[.frameLocator(...)].getByX(...)
 * / .locator(...), plus optional page-object wrappers like this.$('css').
 * Scans the WHOLE source, not lines: a prettier-wrapped call whose options
 * object spans several lines (the real-world shape for any getByRole with a
 * long name + exact:true) is one call, parsed whole. Missing those made run
 * mode report a failing locator that exists verbatim in the POM as "could
 * not be matched to source".
 */
export declare function parseLocatorCalls(src: string, file: string, wrappers?: string[]): LocatorCall[];
/** A file error met while gathering sources: reported, never fatal. */
export interface FileError {
    /** The fs operation that failed ("read", "walk"). */
    operation: string;
    /** The exact path it failed on. */
    path: string;
    /** The spec being processed when it happened. */
    spec: string;
    message: string;
}
/**
 * Every spec file under a directory, recursive. Only REGULAR files are
 * read anywhere downstream; directories are walked — including a
 * directory whose NAME looks like a spec file (a real-world tree had
 * one, and reading it was an EISDIR crash). Symlinks are skipped (cycle
 * safety) and non-spec files ignored, both noted via `note` (--verbose).
 */
export declare function collectSpecFiles(root: string, note?: (line: string) => void): string[];
export interface Edit {
    line: number;
    startCol: number;
    endLine: number;
    endCol: number;
    newRaw: string;
}
/** Signature of a selector call TEXT (e.g. from an error message), or null. */
export declare function selectorSignature(text: string): string | null;
/**
 * Corrected full selectors for a compound CSS selector whose LEADING tag
 * token is not a valid element name, one per known tag a single edit away
 * ("buttons.btn.btn-primary" → ["button.btn.btn-primary"]). Empty when the
 * selector does not start with a tag token followed by more selector text
 * (so bare tags, .class/#id starts, and dashed custom elements are never
 * touched), when the tag is valid, or when nothing is one edit away. Which
 * correction (if any) may HEAL is decided by the caller's unique-match
 * probe; this only says what is worth probing.
 */
export declare function tagTypoCorrections(css: string): string[];
/**
 * The known tag closest to `token` within `maxDist` edits, alphabetical on
 * ties, null when nothing is close enough. Hint-only: dashed tag names are
 * spec-legal custom elements and are NEVER auto-corrected.
 */
export declare function closestKnownTag(token: string, maxDist: number): string | null;
export declare function heal(opts: HealOptions): Promise<HealResult>;
export {};
