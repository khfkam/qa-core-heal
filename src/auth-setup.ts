import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import type { Page } from 'playwright';
import { HOOK_URL } from './playwright-config.js';

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

function describeError(e: unknown): string {
  return e instanceof Error && e.name && e.message
    ? `${e.name}: ${e.message.split('\n')[0]}`
    : String(e);
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
export function isLoaderNoise(name: string | undefined, message: string, code?: string): boolean {
  if (code === 'MODULE_TYPELESS_PACKAGE_JSON') return true;
  // Family 1: an ES-module subject plus a load/parse verb, any phrasing.
  if (/\bES modules?\b/i.test(message)
    && /\b(?:load(?:ed|ing)?|parsed?|reparsed|module syntax|"type"\s*:\s*"module")\b/i.test(message)) {
    return true;
  }
  // Family 2: experimental notices about module machinery only.
  if (name === 'ExperimentalWarning'
    && /type stripping|striptypescripttypes|\bmodules?\b|\bloaders?\b|\bimports?\b|\brequire\b|\btypescript\b/i.test(message)) {
    return true;
  }
  // Family 3: deprecation notices about module machinery only.
  if (name === 'DeprecationWarning'
    && /\bloaders?\b|--experimental|module\s+customization|require\s*\(\s*esm\s*\)|\bimport\s+assertions?\b/i.test(message)) {
    return true;
  }
  return false;
}

/**
 * The config loader suppresses Node's TypeScript-loading noise by running
 * in a child process with --no-warnings; this loader is in-process (the
 * login function needs our live page), so the same warnings must be
 * filtered here, via the family classifier above.
 *
 * Two layers, both installed ONCE and left in place for the life of the
 * process — a restore-after-load window provably leaked on real repos:
 *   - process.emitWarning wrapper: main-thread warnings, including ones
 *     emitted lazily when the login function first RUNS (its imports
 *     resolve at call time, after any load window has closed).
 *   - process.stderr line filter: the ESM-retry hooks (module.register)
 *     run on a worker thread whose warnings never pass through the main
 *     thread's emitWarning at all — they arrive as fully-rendered
 *     "(node:pid) ExperimentalWarning: ..." stderr lines.
 */
let loaderNoiseFilterInstalled = false;
function suppressLoaderNoise(): void {
  if (loaderNoiseFilterInstalled) return;
  loaderNoiseFilterInstalled = true;
  const original = process.emitWarning.bind(process);
  const filtered: typeof process.emitWarning = (warning, ...rest) => {
    const message = typeof warning === 'string' ? warning : (warning as Error)?.message ?? '';
    const opt = rest[0] as { code?: string; type?: string } | string | undefined;
    const code = (typeof opt === 'object' && opt ? opt.code : undefined)
      ?? (typeof rest[1] === 'string' ? rest[1] : undefined)
      ?? (warning as { code?: string })?.code;
    const name = (typeof opt === 'string' ? opt : (typeof opt === 'object' && opt ? opt.type : undefined))
      ?? (warning instanceof Error ? warning.name : undefined);
    if (isLoaderNoise(name, message, code)) return;
    (original as (...args: unknown[]) => void)(warning, ...rest);
  };
  process.emitWarning = filtered;
  // Rendered warning lines from the hooks thread: parse the
  // "(node:pid) [CODE] Name: message" shape and ask the same classifier.
  // Also dropped: the "(Use `node --trace-warnings ...)" hint DIRECTLY
  // following a dropped line.
  const WARNING_LINE = /^\(node:\d+\) (?:\[([A-Z_0-9]+)\] )?([A-Za-z]+): (.*)$/;
  const lineIsNoise = (line: string): boolean => {
    const m = line.match(WARNING_LINE);
    return m != null && isLoaderNoise(m[2], m[3] ?? '', m[1]);
  };
  const HINT_LINE = /^\(Use `node --trace-warnings/;
  let lastDropped = false;
  const origWrite = process.stderr.write.bind(process.stderr);
  const filteredWrite = (chunk: unknown, ...rest: unknown[]): boolean => {
    const text = typeof chunk === 'string'
      ? chunk
      : Buffer.isBuffer(chunk) ? chunk.toString('utf8') : null;
    if (text == null) return (origWrite as (...a: unknown[]) => boolean)(chunk, ...rest);
    const kept = text.split('\n').filter((line) => {
      if (lineIsNoise(line)) { lastDropped = true; return false; }
      if (lastDropped && HINT_LINE.test(line)) return false;
      if (line.trim().length > 0) lastDropped = false;
      return true;
    }).join('\n');
    if (kept === text) return (origWrite as (...a: unknown[]) => boolean)(chunk, ...rest);
    if (kept.replace(/\n/g, '').length === 0) {
      const cb = rest.find((r) => typeof r === 'function') as (() => void) | undefined;
      cb?.();
      return true;
    }
    // Some lines dropped: write the remainder, dropping any encoding arg
    // (kept is a plain string now).
    return (origWrite as (...a: unknown[]) => boolean)(kept, ...rest.filter((r) => typeof r !== 'string'));
  };
  process.stderr.write = filteredWrite as typeof process.stderr.write;
}

/**
 * Resolve "file#exportName" — or "file:exportName", so zsh users need no
 * quotes — into a callable (default export when no separator). Throws with
 * a labeled, actionable message on every failure — a broken auth setup
 * must never degrade into an unauthenticated probe.
 */
export async function loadAuthSetup(spec: string, baseDir: string): Promise<AuthSetup> {
  const hash = spec.lastIndexOf('#');
  let filePart = spec;
  let exportName = 'default';
  if (hash > 0) {
    filePart = spec.slice(0, hash);
    exportName = spec.slice(hash + 1);
  } else {
    // ':' alternative: the suffix must look like an export identifier, and
    // the colon must not be a Windows drive separator (C:\...).
    const colon = spec.lastIndexOf(':');
    if (colon > 1 && /^[A-Za-z_$][\w$]*$/.test(spec.slice(colon + 1))) {
      filePart = spec.slice(0, colon);
      exportName = spec.slice(colon + 1);
    }
  }
  const label = `${filePart}#${exportName}`;
  const abs = path.resolve(baseDir, filePart);
  if (!fs.existsSync(abs)) {
    // A '#' value pointing nowhere is often a shell-mangled path: some
    // shells treat unquoted '#' as a comment start.
    const hint = spec.includes('#')
      ? " (values containing '#' need quotes in some shells: --auth-setup 'file#export', or use the ':' separator: file:export)"
      : '';
    throw new Error(`auth setup module not found: ${abs}${hint}`);
  }
  // CJS interop for ESM-parsed modules that call require(...), resolved
  // against the user's module so their node_modules win.
  (globalThis as { require?: NodeJS.Require }).require = createRequire(abs);
  let mod: Record<string, unknown>;
  suppressLoaderNoise();
  try {
    mod = (await import(pathToFileURL(abs).href)) as Record<string, unknown>;
  } catch (e1) {
    if (!abs.endsWith('.ts')) {
      throw new Error(`auth setup ${label} failed to load: ${describeError(e1)}`);
    }
    try {
      const { register } = await import('node:module');
      register(HOOK_URL);
      mod = (await import(pathToFileURL(abs).href + '?qa-auth-esm-retry')) as Record<string, unknown>;
    } catch (e2) {
      throw new Error(
        `auth setup ${label} failed to load: import failed (${describeError(e1)}); ESM retry failed (${describeError(e2)})`,
      );
    }
  }
  const candidate = mod[exportName] ?? (exportName === 'default' ? mod.default : undefined);
  if (typeof candidate !== 'function') {
    throw new Error(`auth setup ${label}: export "${exportName}" is not a function`);
  }
  return { fn: candidate as AuthSetup['fn'], label };
}

/** Reject after `ms` so a hanging login can never stall the run forever. */
export function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    p,
    new Promise<never>((_, reject) => {
      const t = setTimeout(() => reject(new Error(`timed out after ${ms}ms`)), ms);
      t.unref?.();
    }),
  ]);
}
