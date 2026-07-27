/**
 * Cross-platform Playwright child runs.
 *
 * Recovered from the published qa-core-heal@0.3.0 package — the source file
 * is missing from the upstream GitHub tree but present in the npm tarball.
 */
export interface PlaywrightRunResult {
    status: number | null;
    stdout: string;
    stderr: string;
    /** The exact command attempted, for error reporting. */
    command: string;
    /** The spawn-level error (ENOENT and friends), when the child never ran. */
    error?: Error;
}
export declare function runPlaywrightCli(root: string, args: string[], maxBuffer: number, env?: NodeJS.ProcessEnv): PlaywrightRunResult;
/**
 * The full story of a failed child run: the exact command, the spawn
 * error code or exit status, and the stderr tail.
 */
export declare function describeFailedRun(run: PlaywrightRunResult): string;
