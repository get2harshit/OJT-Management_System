#!/usr/bin/env node
// Reachability audit — run before calling any journey "done".
//
// This exists because backend-endpoint-works and tsc-is-clean were never
// enough: a page can call a real, correct endpoint and still be unreachable
// from any nav item, and an endpoint can have a working FE client function
// that literally nothing on any page ever calls. Both happened in this repo
// (attendance history, mentor reassignment history, and — before a fix —
// the roster/mentors pages were reachable but not from anywhere obvious).
//
// Two checks:
//   1. Dead endpoints — every exported `api*` function in src/lib/api/*.ts,
//      checked for at least one call site outside its own file. Zero call
//      sites means a backend capability with an FE wrapper nothing invokes.
//   2. Orphan routes — every <Route path="..."> in each role's index.tsx,
//      checked for at least one inbound navigate()/<Link> reference
//      elsewhere (dynamic segments like :cohortId are matched against any
//      interpolated content, not the literal string). Also cross-checked
//      against Sidebar.tsx tab ids for top-level routes, since those are
//      commonly reached via `${BASE_PATH}/${tab.id}` built at runtime
//      rather than a literal path string anywhere in the source.
//
// Known limitation: routes built through a local helper function (e.g. a
// `variantPath(config, page)` closure) won't be traced through — the check
// is textual, not a real control-flow analysis. Treat a flagged route as "go
// look", not as proven-broken; three flagged this way turned out fine on
// inspection. False negatives (a route linked only from a place this script
// doesn't scan) are more likely than false positives, so a clean run is not
// a guarantee — it narrows what to check by hand, it doesn't replace it.
//
// Usage: node scripts/audit-reachability.mjs

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'src');
const API_DIR = join(SRC, 'lib/api');
const SIDEBAR_FILE = join(SRC, 'components/Sidebar.tsx');
const ROLE_FILES = {
  admin: join(SRC, 'pages/admin/index.tsx'),
  mentor: join(SRC, 'pages/mentor/index.tsx'),
  student: join(SRC, 'pages/student/index.tsx'),
};
const BASE_PATHS = { admin: '/admin/dashboard', mentor: '/mentor/dashboard', student: '/student/dashboard' };

function walk(dir, exts, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) walk(full, exts, out);
    else if (exts.some((e) => entry.endsWith(e))) out.push(full);
  }
  return out;
}

function auditDeadEndpoints(allFiles) {
  const apiFiles = readdirSync(API_DIR).filter((f) => f.endsWith('.ts') && f !== 'client.ts' && f !== 'index.ts');
  const funcRe = /^export\s+(?:async\s+)?function\s+(api[A-Za-z0-9_]+)/gm;
  const functions = [];
  for (const f of apiFiles) {
    const text = readFileSync(join(API_DIR, f), 'utf8');
    let m;
    while ((m = funcRe.exec(text))) functions.push({ name: m[1], definedIn: f });
  }

  const otherFiles = allFiles.filter((f) => !f.includes('/lib/api/'));
  const fileTexts = otherFiles.map((f) => readFileSync(f, 'utf8'));

  const dead = [];
  for (const { name, definedIn } of functions) {
    const wordRe = new RegExp(`\\b${name}\\b`);
    const used = fileTexts.some((t) => wordRe.test(t));
    if (!used) dead.push({ name, definedIn });
  }
  return dead;
}

function auditOrphanRoutes(allFiles) {
  const sidebarText = readFileSync(SIDEBAR_FILE, 'utf8');
  const sidebarIds = new Set([...sidebarText.matchAll(/id:\s*'([a-zA-Z0-9_-]+)'/g)].map((m) => m[1]));

  const fileTexts = new Map(allFiles.map((f) => [f, readFileSync(f, 'utf8')]));
  const results = {};

  for (const [role, roleFile] of Object.entries(ROLE_FILES)) {
    const text = readFileSync(roleFile, 'utf8');
    const routeRe = /<Route\s+path="([^"]+)"/g;
    const routes = [...text.matchAll(routeRe)].map((m) => m[1]).filter((p) => p !== '' && p !== '*');
    const base = BASE_PATHS[role];
    const orphans = [];

    for (const path of routes) {
      const isTopLevel = !path.includes('/');
      if (isTopLevel && sidebarIds.has(path)) continue;

      const segments = path.split('/').map((seg) =>
        seg.startsWith(':') ? '[^"\'`/]+' : seg.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      );
      const pattern = new RegExp(base.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '/' + segments.join('/'));

      let found = false;
      for (const [f, t] of fileTexts) {
        if (f === roleFile) continue;
        if (pattern.test(t)) {
          found = true;
          break;
        }
      }
      if (!found) orphans.push(path);
    }
    results[role] = { total: routes.length, orphans };
  }
  return results;
}

function main() {
  const allFiles = walk(SRC, ['.ts', '.tsx']);

  console.log('=== Dead-endpoint audit ===\n');
  const dead = auditDeadEndpoints(allFiles);
  console.log(`Checked exported api* functions across src/lib/api/.`);
  if (dead.length === 0) {
    console.log('No dead endpoints found.\n');
  } else {
    console.log(`${dead.length} with ZERO call sites outside src/lib/api/:\n`);
    for (const { name, definedIn } of dead) console.log(`  ${name}  (${definedIn})`);
    console.log();
  }

  console.log('=== Orphan-route audit ===\n');
  const routeResults = auditOrphanRoutes(allFiles);
  for (const [role, { total, orphans }] of Object.entries(routeResults)) {
    console.log(`${role}: ${total} routes declared`);
    if (orphans.length === 0) {
      console.log('  (none orphaned)\n');
    } else {
      console.log(`  ${orphans.length} with ZERO inbound navigate()/<Link>/Sidebar reference:`);
      for (const p of orphans) console.log(`    ${p}`);
      console.log();
    }
  }
}

main();
