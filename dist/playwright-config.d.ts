/** Path of the Playwright config directly inside `dir`, or null. */
export declare function findPlaywrightConfig(dir: string): string | null;
/** Native TypeScript type stripping exists from Node 22.6. */
export declare function supportsTypeStripping(version?: string): boolean;
/**
 * Between 22.6–22.17 and 23.0–23.5 type stripping exists but sits behind
 * --experimental-strip-types; from 22.18 / 23.6 it is on by default and the
 * flag is unnecessary.
 */
export declare function needsStripFlag(version?: string): boolean;
/** The exact message the CLI exits with when a .ts config needs newer Node. */
export declare function typeStrippingGateMessage(version?: string): string;
export declare const HOOK_URL: string;
export interface PlaywrightConfigResolution {
    configPath: string;
    baseUrl: string | null;
    /** Set when the config EXISTS but could not be evaluated: absence != failure. */
    loadError?: string;
    /** Set when projects define different baseURLs and no --project was given. */
    disagreement?: Array<{
        name: string;
        baseURL: string;
    }>;
    /** use.storageState (top-level, or agreed across projects), absolute. */
    storageState?: string;
}
/**
 * Evaluate the Playwright config found in `dir` (in a warning-suppressed
 * child process). Returns null only when there IS no config file; a config
 * that fails to load reports loadError so callers can warn instead of
 * silently claiming there was no baseURL.
 */
export declare function resolvePlaywrightConfig(dir: string, project?: string): Promise<PlaywrightConfigResolution | null>;
/** Back-compat convenience: just the baseURL, or null. */
export declare function resolvePlaywrightBaseUrl(dir: string): Promise<string | null>;
