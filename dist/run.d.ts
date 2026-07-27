export declare function stripAnsi(s: string): string;
export type FailureClass = {
    kind: 'locator';
    selector: string | null;
    /**
     * True when the evidence was a strict mode violation: the locator
     * matched SEVERAL elements. The probe must treat a multi-match as
     * the failure itself, not as an intact locator.
     */
    strict?: boolean;
} | {
    kind: 'other';
    summary: string;
};
/**
 * Classification is EVIDENCE-based, never message-shape-based. Locator
 * failure = anything carrying locator evidence: a strict mode violation, an
 * explicit element(s)-not-found, a `locator.<action>:` / `expect.<matcher>:`
 * prefix, or a call-log "waiting for locator/getBy..." line — regardless of
 * the top-level message (a test timeout, a "Target page, context or browser
 * has been closed" after teardown, anything). A count/existence matcher
 * (toHaveCount, toBeVisible, toBeAttached, toBeInViewport) that failed with
 * ZERO elements found is locator evidence too: nothing matched. The one
 * earlier gate: when the locator RESOLVED to a real element (one or more),
 * the failure is about the element's state or count, not its identity —
 * that stays non-locator even with a call log.
 *
 * Non-locator: found-element assertion mismatches, count mismatches with
 * actual > 0, pointer-interception timeouts (the target resolved; an
 * overlay is eating the input — possibly a real UX defect), navigation/
 * network errors, thrown app errors, and timeouts with no pending locator
 * action.
 */
export declare function classifyFailure(rawMessage: string): FailureClass;
/**
 * The selector call text out of an error message: the first
 * locator(...)/getByX(...) after a known marker, parens balanced so
 * options objects survive ("getByRole('textbox', { name: 'X' })").
 */
export declare function extractSelector(msg: string): string | null;
/** y/Y/yes apply; n/no/empty decline; anything else re-prompts. */
export declare function parseConsent(answer: string): 'yes' | 'no' | 'retry';
/**
 * The page URL at failure time: the last MAIN-frame snapshot URL recorded
 * in the test's trace (the trace ends where the test failed). Child iframe
 * snapshots — a feedback widget, an ad frame — are never the page, and can
 * easily be the LAST snapshot recorded, so isMainFrame is checked
 * explicitly (a missing flag, from older trace formats, counts as main).
 * Non-http URLs (about:blank, chrome-error://...) are skipped. Null when
 * the trace is missing, unreadable, or has no usable main-frame snapshot.
 */
export declare function traceFailureUrl(zipPath: string): string | null;
/**
 * Extract the JSON report object from a Playwright stdout that may carry
 * arbitrary prefix noise — configs print while loading (dotenv's tip line
 * even contains a "{", so a naive indexOf slice lands mid-noise). Tries
 * each "{" position until one parses as an object with the report shape.
 */
export declare function parseJsonReport(stdout: string): {
    suites?: unknown[];
} | null;
export interface TestOutcome {
    /** Spec file path relative to the Playwright rootDir. */
    file: string;
    title: string;
    ok: boolean;
    /** Stripped error message of the last result; '' when passing. */
    message: string;
    /** Path to the trace.zip attachment, when present. */
    tracePath: string | null;
    /**
     * Source locations of the failure, most specific first: the error's own
     * location, then app frames from the stack (node internals and
     * node_modules excluded). The primary signal for matching the failing
     * selector back to a locator call in the source.
     */
    locations: Array<{
        file: string;
        line: number;
    }>;
}
interface ReportError {
    message?: string;
    stack?: string;
    location?: {
        file?: string;
        line?: number;
    };
}
interface ReportSpec {
    title: string;
    ok: boolean;
    file: string;
    tests?: Array<{
        results?: Array<{
            status?: string;
            error?: ReportError;
            errors?: ReportError[];
            attachments?: Array<{
                name?: string;
                path?: string;
            }>;
        }>;
    }>;
}
interface ReportSuite {
    specs?: ReportSpec[];
    suites?: ReportSuite[];
}
/** Flatten every spec in a Playwright JSON report into TestOutcomes. */
export declare function collectTests(report: {
    suites?: ReportSuite[];
}): TestOutcome[];
export {};
