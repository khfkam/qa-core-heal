import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
/** The fallback note prints once per process. */
let npxFallbackNoted = false;
export function runPlaywrightCli(root, args, maxBuffer, env) {
    const opts = {
        cwd: root,
        encoding: 'utf8',
        maxBuffer,
        ...(env ? { env } : {}),
    };
    let cliJs = null;
    try {
        cliJs = createRequire(path.join(root, 'package.json')).resolve('@playwright/test/cli');
    }
    catch {
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
export function describeFailedRun(run) {
    const cause = run.error
        ? `spawn failed: ${run.error.code ?? run.error.message}`
        : `exit status ${run.status}`;
    const tail = (run.stderr ?? '')
        .trim()
        .split('\n')
        .slice(-5)
        .join('\n')
        .trim();
    return `command: ${run.command}; ${cause}${tail ? `; stderr tail:\n${tail}` : ''}`;
}
