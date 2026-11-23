import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveZodCopies, zodSplitWarning } from '../src/zod-integrity.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(readFileSync(resolve(ROOT, 'package.json'), 'utf8')) as {
  dependencies: Record<string, string>;
  peerDependencies?: Record<string, string>;
};

/**
 * A packaging contract, not a code one, so it is asserted on package.json.
 *
 * The MCP library renders our tool schemas with the zod IT resolves. `.describe()`
 * and `.meta()` write into zod's registry rather than onto the schema, and that
 * registry belongs to a module instance, so two copies of zod means the library
 * looks our schemas up somewhere they were never recorded. Every argument
 * description vanishes and the JSON-string arguments lose `type`. Nothing
 * throws, the server runs, and agents get the contract with its guidance gone.
 *
 * Declaring a range different from the library's is what caused it: npm nested
 * a second copy to satisfy ours. Declaring exactly the library's range lets a
 * single copy serve both.
 */
describe('zod resolution', () => {
  it('declares exactly the zod range @modelcontextprotocol/server does', () => {
    const mcpPkg = JSON.parse(
      readFileSync(resolve(ROOT, 'node_modules/@modelcontextprotocol/server/package.json'), 'utf8'),
    ) as { dependencies: Record<string, string> };
    expect(pkg.dependencies.zod).toBe(mcpPkg.dependencies.zod);
  });

  it('does not declare zod as a peer, so only one range can drift', () => {
    expect(pkg.peerDependencies?.zod).toBeUndefined();
  });

  it('imports the version-specific subpath, never bare zod', () => {
    // Bare `zod` resolves to whichever major is installed, and our source uses
    // the v4 API. `zod/v4` is present on both majors (3.25 ships v4 under it),
    // which is what makes one import work against either.
    const src = readFileSync(resolve(ROOT, 'src/server.ts'), 'utf8');
    expect(src).toMatch(/from 'zod\/v4'/);
    expect(src).not.toMatch(/from 'zod'/);
  });

  it('resolves one zod version for both sides in this tree', () => {
    const resolution = resolveZodCopies();
    expect(resolution, 'zod resolution could not be inspected').not.toBeNull();
    expect(
      resolution!.skewed,
      `zod version skew:\n  ours: ${resolution!.ours}\n  mcp:  ${resolution!.mcp}`,
    ).toBe(false);
  });

  it('treats two copies of the same version as healthy', () => {
    // Measured, not assumed: a host that nests a private copy for each side
    // on the same release still publishes a complete contract. Warning there would be a false alarm on
    // a working install, which is worse than no warning at all.
    const sameVersion = resolveZodCopies();
    expect(sameVersion?.skewed).toBe(false);
    expect(zodSplitWarning({ ours: '4.4.3', mcp: '4.2.0', skewed: true })).toContain('4.4.3');
  });

  it('names both versions in the warning', () => {
    const warning = zodSplitWarning({ ours: '4.4.3', mcp: '4.2.0', skewed: true });
    expect(warning).toContain('zod 4.4.3');
    expect(warning).toContain('zod 4.2.0');
    expect(warning).toContain('dedupe');
  });

  it('stays silent when resolution cannot be inspected', () => {
    // Undetectable is not the same as broken: a bundled build should not
    // print a warning about a tree it cannot see.
    expect(resolveZodCopies('file:///nonexistent/deeply/unresolvable.js')).toBeNull();
  });
});
