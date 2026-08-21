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
 * The MCP SDK renders our tool schemas with the zod IT resolves. `.describe()`
 * and `.meta()` write into zod's registry rather than onto the schema, and that
 * registry belongs to a module instance, so two copies of zod means the SDK
 * looks our schemas up somewhere they were never recorded. Every argument
 * description vanishes and the JSON-string arguments lose `type`. Nothing
 * throws, the server runs, and agents get the contract with its guidance gone.
 *
 * Declaring `zod` narrowly (`^4.x`) is what caused it: the SDK accepts
 * `^3.25 || ^4.0`, so a host holding zod 3 satisfied the SDK at the top level
 * while npm nested a second copy for us. Declaring it as a peer did NOT fix
 * that on its own; npm just nested the copy to satisfy the peer. Matching the
 * SDK's range and importing the version-specific `zod/v4` subpath is what lets
 * a single copy serve both, on either major.
 */
describe('zod resolution', () => {
  it('declares the same zod range the MCP SDK does', () => {
    const sdkPkg = JSON.parse(
      readFileSync(resolve(ROOT, 'node_modules/@modelcontextprotocol/sdk/package.json'), 'utf8'),
    ) as { peerDependencies: Record<string, string> };

    // Not a literal string match: the SDK writes `^3.25 || ^4.0`. What has to
    // hold is that both majors it accepts are acceptable to us too, so npm can
    // always dedupe to whatever the host already has.
    for (const major of ['3.25', '4.0']) {
      expect(
        pkg.dependencies.zod,
        `zod range must admit ${major} so a host on that major dedupes instead of nesting a second copy`,
      ).toContain(major);
    }
    expect(sdkPkg.peerDependencies.zod).toContain('3.25');
    expect(sdkPkg.peerDependencies.zod).toContain('4.0');
  });

  it('declares zod as a peer so an embedding host supplies it', () => {
    expect(pkg.peerDependencies?.zod).toBe(pkg.dependencies.zod);
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
      `zod version skew:\n  ours: ${resolution!.ours}\n  sdk:  ${resolution!.sdk}`,
    ).toBe(false);
  });

  it('treats two copies of the same version as healthy', () => {
    // Measured, not assumed: a host pinned below the `zod/v4` floor nests a
    // private copy for each side, and with both on the same release the
    // published contract is complete. Warning there would be a false alarm on
    // a working install, which is worse than no warning at all.
    const sameVersion = resolveZodCopies();
    expect(sameVersion?.skewed).toBe(false);
    expect(zodSplitWarning({ ours: '4.4.3', sdk: '3.25.76', skewed: true })).toContain('4.4.3');
  });

  it('names both versions in the warning', () => {
    const warning = zodSplitWarning({ ours: '4.4.3', sdk: '3.25.76', skewed: true });
    expect(warning).toContain('zod 4.4.3');
    expect(warning).toContain('zod 3.25.76');
    expect(warning).toContain('dedupe');
  });

  it('stays silent when resolution cannot be inspected', () => {
    // Undetectable is not the same as broken: a bundled build should not
    // print a warning about a tree it cannot see.
    expect(resolveZodCopies('file:///nonexistent/deeply/unresolvable.js')).toBeNull();
  });
});
