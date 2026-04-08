/**
 * RESOURCE_MANIFEST drift test
 *
 * Verifies that the RESOURCE_MANIFEST in code-mode.ts stays in sync with the
 * actual AgledgerClient resource properties. If a resource is added to or
 * removed from the SDK client, this test will fail until the manifest is updated.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------------------
// Extract resource names from the SDK client source
// ---------------------------------------------------------------------------

function getClientResourceNames(): string[] {
  const clientPath = resolve(__dirname, '../../../agledger-sdk/src/client.ts');
  const source = readFileSync(clientPath, 'utf8');

  // Match "readonly <name>: <Type>Resource" property declarations
  const pattern = /^\s+readonly\s+(\w+)\s*:\s+\w+Resource/gm;
  const names: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(source)) !== null) {
    names.push(match[1]);
  }
  return names.sort();
}

// ---------------------------------------------------------------------------
// Extract resource names from the RESOURCE_MANIFEST in code-mode.ts
// ---------------------------------------------------------------------------

function getManifestResourceNames(): string[] {
  const codePath = resolve(__dirname, '../src/tools/code-mode.ts');
  const source = readFileSync(codePath, 'utf8');

  // The manifest is defined as: const RESOURCE_MANIFEST: Record<string, string> = { key: `...`, ... };
  // Extract the keys by finding the block between the opening { and closing };
  const startMarker = 'const RESOURCE_MANIFEST: Record<string, string> = {';
  const startIdx = source.indexOf(startMarker);
  if (startIdx === -1) {
    throw new Error('Could not find RESOURCE_MANIFEST in code-mode.ts');
  }

  // Find matching closing brace by counting depth
  let depth = 0;
  let inString = false;
  let stringChar = '';
  let endIdx = -1;

  for (let i = startIdx + startMarker.length - 1; i < source.length; i++) {
    const ch = source[i];
    const prev = i > 0 ? source[i - 1] : '';

    if (inString) {
      if (ch === stringChar && prev !== '\\') {
        inString = false;
      }
      continue;
    }

    if (ch === '`' || ch === '"' || ch === "'") {
      inString = true;
      stringChar = ch;
      continue;
    }

    if (ch === '{') depth++;
    if (ch === '}') {
      depth--;
      if (depth === 0) {
        endIdx = i;
        break;
      }
    }
  }

  if (endIdx === -1) {
    throw new Error('Could not parse RESOURCE_MANIFEST block');
  }

  const block = source.slice(startIdx + startMarker.length, endIdx);

  // Extract top-level keys: lines matching "  <key>: `" at the start
  const keyPattern = /^\s+(\w+)\s*:\s*`/gm;
  const names: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = keyPattern.exec(block)) !== null) {
    names.push(m[1]);
  }
  return names.sort();
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('RESOURCE_MANIFEST ↔ SDK Client drift', () => {
  const clientResources = getClientResourceNames();
  const manifestResources = getManifestResourceNames();

  it('SDK client has at least one resource', () => {
    expect(clientResources.length).toBeGreaterThan(0);
  });

  it('RESOURCE_MANIFEST has at least one resource', () => {
    expect(manifestResources.length).toBeGreaterThan(0);
  });

  it('every SDK resource is present in RESOURCE_MANIFEST', () => {
    const missing = clientResources.filter((r) => !manifestResources.includes(r));
    if (missing.length > 0) {
      expect.fail(
        `${missing.length} SDK resource(s) missing from RESOURCE_MANIFEST in code-mode.ts:\n` +
        missing.map((r) => `  - ${r}`).join('\n') +
        '\n\nFix: add entries to RESOURCE_MANIFEST for these resources.',
      );
    }
  });

  it('every RESOURCE_MANIFEST entry corresponds to an SDK resource', () => {
    const extra = manifestResources.filter((r) => !clientResources.includes(r));
    if (extra.length > 0) {
      expect.fail(
        `${extra.length} RESOURCE_MANIFEST entry/entries have no corresponding SDK resource:\n` +
        extra.map((r) => `  - ${r}`).join('\n') +
        '\n\nFix: remove stale entries from RESOURCE_MANIFEST, or add missing resources to the SDK client.',
      );
    }
  });

  it('resource counts match exactly', () => {
    expect(manifestResources.length).toBe(clientResources.length);
  });

  it('resource names match exactly (sorted)', () => {
    expect(manifestResources).toEqual(clientResources);
  });
});
