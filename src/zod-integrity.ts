import { createRequire } from 'node:module';
import { dirname } from 'node:path';

/**
 * Which zod this package and the MCP SDK each resolve.
 *
 * They have to agree on the VERSION. The SDK renders our tool schemas with the
 * zod it resolves, and a renderer from a different zod release does not
 * understand the schema internals this one produces: a 4.4.3 schema rendered by
 * 3.25.76 comes out as `{}`, losing every argument description and the `type`
 * of every JSON-string argument. Nothing throws. The server starts, connects
 * and answers calls; agents just receive the tool contract with the guidance
 * stripped out of it.
 *
 * Two SEPARATE COPIES of the same version are fine, which is why this compares
 * versions rather than paths. That distinction is measured, not assumed: a tree
 * pinning zod below the `zod/v4` floor nests a private copy for each side, and
 * with both on 4.4.3 the published contract is complete. Warning on that tree
 * would be a false alarm on a working install.
 *
 * Matching the SDK's `^3.25 || ^4.0` range and importing `zod/v4` is what lets
 * npm dedupe to one copy. This catches the trees where it cannot: a host pinned
 * below 3.25, `--legacy-peer-deps`, a pnpm or yarn resolution.
 */
export interface ZodResolution {
  /** Version of the zod this package uses. */
  ours: string;
  /** Version of the zod the MCP SDK uses. */
  sdk: string;
  /** True when the two are different releases, whether or not they are separate copies. */
  skewed: boolean;
}

/**
 * Returns null when resolution cannot be inspected at all (a bundled build, an
 * unusual loader). Undetectable is not the same as broken, so callers stay
 * quiet rather than warning about a tree they cannot see.
 */
export function resolveZodCopies(fromUrl: string = import.meta.url): ZodResolution | null {
  try {
    const require = createRequire(fromUrl);
    const ours = require('zod/package.json') as { version: string };
    const sdkDir = dirname(require.resolve('@modelcontextprotocol/sdk/package.json'));
    const sdkRequire = createRequire(`${sdkDir}/`);
    const sdk = sdkRequire('zod/package.json') as { version: string };
    return { ours: ours.version, sdk: sdk.version, skewed: ours.version !== sdk.version };
  } catch {
    return null;
  }
}

/** Warning text for a version-skewed tree. */
export function zodSplitWarning(resolution: ZodResolution): string {
  return (
    'Warning: this host tree resolved two different versions of zod.\n' +
    `  @agledger/mcp-server:      zod ${resolution.ours}\n` +
    `  @modelcontextprotocol/sdk: zod ${resolution.sdk}\n` +
    "The SDK renders this server's tool schemas with its own copy, and a renderer from a " +
    'different zod release cannot read these schemas: every argument description and the ' +
    'type of every JSON-string argument are dropped from the published contract. The server ' +
    'still answers calls; agents receive it with the guidance removed.\n' +
    'Fix: dedupe zod to one version (`npm dedupe`, or raise a zod pinned below 3.25 above ' +
    'this package). This package accepts the same range the SDK does so a single copy can ' +
    'serve both.\n'
  );
}
