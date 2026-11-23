import { createRequire } from 'node:module';
import { dirname } from 'node:path';

/**
 * Which zod this package and the MCP library each resolve.
 *
 * They have to agree on the VERSION. The MCP library renders our tool schemas with the
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
 * Declaring the same `^4.2.0` range `@modelcontextprotocol/server` declares is what
 * lets npm dedupe to one copy. This catches the trees where it cannot: a host
 * pinned to another zod 4 release, `--legacy-peer-deps`, a pnpm or yarn resolution.
 */
export interface ZodResolution {
  /** Version of the zod this package uses. */
  ours: string;
  /** Version of the zod `@modelcontextprotocol/server` uses. */
  mcp: string;
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
    // `package.json` is not in the library's `exports` map, so locate it from
    // the resolved entry point instead of requiring it.
    const mcpDir = dirname(require.resolve('@modelcontextprotocol/server'));
    const mcpRequire = createRequire(`${mcpDir}/`);
    const mcp = mcpRequire('zod/package.json') as { version: string };
    return { ours: ours.version, mcp: mcp.version, skewed: ours.version !== mcp.version };
  } catch {
    return null;
  }
}

/** Warning text for a version-skewed tree. */
export function zodSplitWarning(resolution: ZodResolution): string {
  return (
    'Warning: this host tree resolved two different versions of zod.\n' +
    `  @agledger/mcp-server:         zod ${resolution.ours}\n` +
    `  @modelcontextprotocol/server: zod ${resolution.mcp}\n` +
    "The MCP library renders this server's tool schemas with its own copy, and a renderer from a " +
    'different zod release cannot read these schemas: every argument description and the ' +
    'type of every JSON-string argument are dropped from the published contract. The server ' +
    'still answers calls; agents receive it with the guidance removed.\n' +
    'Fix: dedupe zod to one version (`npm dedupe`, or align a pinned zod with ^4.2.0). ' +
    'This package declares the same range the MCP library does so a single copy can ' +
    'serve both.\n'
  );
}
