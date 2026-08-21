import { createRequire } from 'node:module';
import { dirname } from 'node:path';

/**
 * Whether this package and the MCP SDK resolve the same copy of zod.
 *
 * They must. `.describe()` and `.meta()` do not live on the schema: they write
 * into zod's registry, and that registry belongs to the module instance that
 * created it. The MCP SDK renders our tool schemas with the zod IT resolves, so
 * when a host tree gives the SDK one copy and this package another, the SDK
 * looks our schemas up in a registry that never saw them. Every field
 * description disappears and the JSON-string fields lose `type` entirely.
 *
 * Nothing throws. The server starts, connects, and answers calls; agents just
 * receive a tool contract with the guidance stripped out of it. That silence is
 * why this is checked rather than left to be noticed.
 *
 * The `zod` peer dependency is what prevents the split. This catches an install
 * that overrode it: `--legacy-peer-deps`, a pnpm or yarn resolution, a zod 3
 * pinned above this package, or a vendored tree.
 */
export interface ZodResolution {
  /** Absolute path of the zod this package uses. */
  ours: string;
  /** Absolute path of the zod the MCP SDK uses. */
  sdk: string;
  /** True when the two are different copies, whatever their versions. */
  split: boolean;
}

/**
 * Returns null when resolution cannot be inspected at all (a bundled build, an
 * unusual loader). Undetectable is not the same as broken, so callers stay
 * quiet rather than warning on a tree they cannot see.
 */
export function resolveZodCopies(fromUrl: string = import.meta.url): ZodResolution | null {
  try {
    const require = createRequire(fromUrl);
    const ours = require.resolve('zod/package.json');
    const sdkDir = dirname(require.resolve('@modelcontextprotocol/sdk/package.json'));
    const sdk = require.resolve('zod/package.json', { paths: [sdkDir] });
    return { ours, sdk, split: ours !== sdk };
  } catch {
    return null;
  }
}

/**
 * Warning text for a split tree. Two copies of the same version are still two
 * registries, so this reports paths rather than versions: identical version
 * numbers here would read as a false alarm when they are the actual fault.
 */
export function zodSplitWarning(resolution: ZodResolution): string {
  return (
    'Warning: this host tree resolved two different copies of zod.\n' +
    `  @agledger/mcp-server:      ${resolution.ours}\n` +
    `  @modelcontextprotocol/sdk: ${resolution.sdk}\n` +
    'The SDK renders this server\'s tool schemas against its own copy, so every argument ' +
    'description and the type of every JSON-string argument are dropped from the published ' +
    'contract. The server still answers calls; agents receive it with the guidance removed.\n' +
    'Fix: dedupe zod to a single v4 copy (`npm dedupe`, or remove a zod 3 pinned above this ' +
    'package). This package declares zod as a peer dependency for exactly this reason.\n'
  );
}
