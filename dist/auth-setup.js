import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { HOOK_URL } from './playwright-config.js';
function describeError(e) {
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
export function isLoaderNoise(name, message, code) {
    if (code === 'MODULE_TYPELESS_PACKAGE_JSON')
        return true;
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
function suppressLoaderNoise() {
    if (loaderNoiseFilterInstalled)
        return;
    loaderNoiseFilterInstalled = true;
    const original = process.emitWarning.bind(process);
    const filtered = (warning, ...rest) => {
        const message = typeof warning === 'string' ? warning : warning?.message ?? '';
        const opt = rest[0];
        const code = (typeof opt === 'object' && opt ? opt.code : undefined)
            ?? (typeof rest[1] === 'string' ? rest[1] : undefined)
            ?? warning?.code;
        const name = (typeof opt === 'string' ? opt : (typeof opt === 'object' && opt ? opt.type : undefined))
            ?? (warning instanceof Error ? warning.name : undefined);
        if (isLoaderNoise(name, message, code))
            return;
        original(warning, ...rest);
    };
    process.emitWarning = filtered;
    // Rendered warning lines from the hooks thread: parse the
    // "(node:pid) [CODE] Name: message" shape and ask the same classifier.
    // Also dropped: the "(Use `node --trace-warnings ...)" hint DIRECTLY
    // following a dropped line.
    const WARNING_LINE = /^\(node:\d+\) (?:\[([A-Z_0-9]+)\] )?([A-Za-z]+): (.*)$/;
    const lineIsNoise = (line) => {
        const m = line.match(WARNING_LINE);
        return m != null && isLoaderNoise(m[2], m[3] ?? '', m[1]);
    };
    const HINT_LINE = /^\(Use `node --trace-warnings/;
    let lastDropped = false;
    const origWrite = process.stderr.write.bind(process.stderr);
    const filteredWrite = (chunk, ...rest) => {
        const text = typeof chunk === 'string'
            ? chunk
            : Buffer.isBuffer(chunk) ? chunk.toString('utf8') : null;
        if (text == null)
            return origWrite(chunk, ...rest);
        const kept = text.split('\n').filter((line) => {
            if (lineIsNoise(line)) {
                lastDropped = true;
                return false;
            }
            if (lastDropped && HINT_LINE.test(line))
                return false;
            if (line.trim().length > 0)
                lastDropped = false;
            return true;
        }).join('\n');
        if (kept === text)
            return origWrite(chunk, ...rest);
        if (kept.replace(/\n/g, '').length === 0) {
            const cb = rest.find((r) => typeof r === 'function');
            cb?.();
            return true;
        }
        // Some lines dropped: write the remainder, dropping any encoding arg
        // (kept is a plain string now).
        return origWrite(kept, ...rest.filter((r) => typeof r !== 'string'));
    };
    process.stderr.write = filteredWrite;
}
/**
 * Resolve "file#exportName" — or "file:exportName", so zsh users need no
 * quotes — into a callable (default export when no separator). Throws with
 * a labeled, actionable message on every failure — a broken auth setup
 * must never degrade into an unauthenticated probe.
 */
export async function loadAuthSetup(spec, baseDir) {
    const hash = spec.lastIndexOf('#');
    let filePart = spec;
    let exportName = 'default';
    if (hash > 0) {
        filePart = spec.slice(0, hash);
        exportName = spec.slice(hash + 1);
    }
    else {
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
    globalThis.require = createRequire(abs);
    let mod;
    suppressLoaderNoise();
    try {
        mod = (await import(pathToFileURL(abs).href));
    }
    catch (e1) {
        if (!abs.endsWith('.ts')) {
            throw new Error(`auth setup ${label} failed to load: ${describeError(e1)}`);
        }
        try {
            const { register } = await import('node:module');
            register(HOOK_URL);
            mod = (await import(pathToFileURL(abs).href + '?qa-auth-esm-retry'));
        }
        catch (e2) {
            throw new Error(`auth setup ${label} failed to load: import failed (${describeError(e1)}); ESM retry failed (${describeError(e2)})`);
        }
    }
    const candidate = mod[exportName] ?? (exportName === 'default' ? mod.default : undefined);
    if (typeof candidate !== 'function') {
        throw new Error(`auth setup ${label}: export "${exportName}" is not a function`);
    }
    return { fn: candidate, label };
}
/** Reject after `ms` so a hanging login can never stall the run forever. */
export function withTimeout(p, ms) {
    return Promise.race([
        p,
        new Promise((_, reject) => {
            const t = setTimeout(() => reject(new Error(`timed out after ${ms}ms`)), ms);
            t.unref?.();
        }),
    ]);
}
