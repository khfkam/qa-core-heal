import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

/**
 * Page-object wrappers such as `this.$('css')` must match Playwright's
 * `locator('css')` failures and rewrite in-place when the heal stays CSS.
 */

const repoRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const { parseLocatorCalls, selectorSignature } = await import(
  path.join(repoRoot, 'dist', 'heal.js')
);
const cliJs = path.join(repoRoot, 'dist', 'cli.js');

test('parseLocatorCalls finds this.$ wrappers when configured', () => {
  const src = `
export class MenuPage {
  $ = (selector, options) => this.page.locator(selector, options);
  menu = this.$(
    'bb-user-context-menu [data-role="dropdown-menu-toggle-buton"]'
  ).first();
  item = this.$('[data-role=dropdown-menu] button', { hasText: 'English' });
  native = this.page.locator('#ok');
}
`;
  const without = parseLocatorCalls(src, 'menu.po.ts');
  // Without wrappers configured, only native this.page.locator calls are seen
  // (the helper body + the explicit native field).
  assert.equal(without.length, 2);
  assert.ok(without.every((c) => c.root === 'this.page'));

  const withWrap = parseLocatorCalls(src, 'menu.po.ts', ['$']);
  assert.equal(withWrap.length, 4);
  const wrappers = withWrap.filter((c) => c.wrapper === '$');
  assert.equal(wrappers.length, 2);
  assert.equal(
    wrappers[0].args.css,
    'bb-user-context-menu [data-role="dropdown-menu-toggle-buton"]',
  );
  assert.equal(wrappers[1].args.hasText, 'English');
  assert.equal(
    selectorSignature("locator('bb-user-context-menu [data-role=\"dropdown-menu-toggle-buton\"]')"),
    selectorSignature(
      `locator(${JSON.stringify(wrappers[0].args.css)})`,
    ),
  );
});

test('run-first heal rewrites this.$ typo in place', async () => {
  const server = await new Promise((resolve) => {
    const s = http.createServer((_req, res) => {
      res.writeHead(200, { 'content-type': 'text/html' });
      res.end(`<!doctype html><html><body>
        <button id="menu-toggle">User</button>
      </body></html>`);
    });
    s.listen(0, '127.0.0.1', () => resolve(s));
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  const dir = fs.mkdtempSync(path.join(repoRoot, '.tmp-test-'));
  fs.mkdirSync(path.join(dir, 'tests'));
  fs.mkdirSync(path.join(dir, 'pages'));
  fs.writeFileSync(
    path.join(dir, 'package.json'),
    '{ "name": "wrapper-repro", "private": true, "type": "module" }',
  );
  fs.writeFileSync(
    path.join(dir, 'qa-core.config.json'),
    JSON.stringify({
      pageObjects: { enabled: true, wrappers: ['$'] },
      heal: { verifyAfterApply: false },
    }),
  );
  fs.writeFileSync(
    path.join(dir, 'pages/menu.po.ts'),
    `import { Page } from '@playwright/test';
export class MenuPage {
  constructor(private page: Page) {}
  $ = (selector: string, options?: any) => this.page.locator(selector, options);
  menu = this.$('#menu-toggl');
  async open() { await this.menu.click({ timeout: 2000 }); }
}
`,
  );
  fs.writeFileSync(
    path.join(dir, 'tests/menu.spec.ts'),
    `import { test } from '@playwright/test';
import { MenuPage } from '../pages/menu.po';
test('opens the menu', async ({ page }) => {
  await page.goto(${JSON.stringify(base + '/')});
  await new MenuPage(page).open();
});
`,
  );
  try {
    const { status, stdout, stderr } = await new Promise((resolve) => {
      const child = spawn(
        'node',
        [cliJs, 'tests/menu.spec.ts', '--base-url', base, '--apply', '--yes', '--json', '--no-verify'],
        { cwd: dir },
      );
      let out = '';
      let err = '';
      child.stdout.on('data', (d) => { out += d; });
      child.stderr.on('data', (d) => { err += d; });
      child.on('close', (code) => resolve({ status: code, stdout: out, stderr: err }));
    });
    assert.equal(status, 0, `expected exit 0, got ${status}\nstdout:\n${stdout}\nstderr:\n${stderr}`);
    const report = JSON.parse(stdout.slice(stdout.indexOf('{')));
    assert.equal(report.healed, 1, JSON.stringify(report, null, 2));
    assert.equal(report.unmatchedFailures?.length ?? 0, 0, JSON.stringify(report, null, 2));
    const healedSrc = fs.readFileSync(path.join(dir, 'pages/menu.po.ts'), 'utf8');
    assert.match(healedSrc, /this\.\$\(['"]#menu-toggle['"]\)/);
    assert.doesNotMatch(healedSrc, /#menu-toggl'/);
    assert.doesNotMatch(healedSrc, /#menu-toggl"/);
  } finally {
    server.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
