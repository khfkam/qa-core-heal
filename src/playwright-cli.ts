import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';

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

/** The fallback note prints once per process. */
let npxFallbackNoted = false;

export function runPlaywrightCli(
  root: string,
  args: string[],
  maxBuffer: number,
  env?: NodeJS.ProcessEnv,
): PlaywrightRunResult {
  const opts = {
    cwd: root,
    encoding: 'utf8' as const,
    maxBuffer,
    ...(env ? { env } : {}),
  };
  let cliJs: string | null = null;
  try {
    cliJs = createRequire(path.join(root, 'package.json')).resolve(
      '@playwright/test/cli',
    );
  } catch {
    /* not installed under this root; npx may still find it */
  }
  if (cliJs) {
    const r = spawnSync(process.execPath, [cliJs, ...args], opts);
    return {
      status: r.status,
      stdout: r.stdout ?? '',
      stderr: r.stderr ?? '',
      command: [process.execPath, cliJs, ...args].join(' '),
      error: r.error,
    };
  }
  if (!npxFallbackNoted) {
    npxFallbackNoted = true;
    console.error('using npx fallback: local Playwright CLI not resolved');
  }
  const r = spawnSync('npx', ['playwright', ...args], {
    ...opts,
    shell: process.platform === 'win32',
  });
  return {
    status: r.status,
    stdout: r.stdout ?? '',
    stderr: r.stderr ?? '',
    command: ['npx', 'playwright', ...args].join(' '),
    error: r.error,
  };
}

/**
 * The full story of a failed child run: the exact command, the spawn
 * error code or exit status, and the stderr tail.
 */
export function describeFailedRun(run: PlaywrightRunResult): string {
  const cause = run.error
    ? `spawn failed: ${(run.error as NodeJS.ErrnoException).code ?? run.error.message}`
    : `exit status ${run.status}`;
  const tail = (run.stderr ?? '')
    .trim()
    .split('\n')
    .slice(-5)
    .join('\n')
    .trim();
  return `command: ${run.command}; ${cause}${tail ? `; stderr tail:\n${tail}` : ''}`;
}
