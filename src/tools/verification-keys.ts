import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { AgledgerClient } from '@agledger/sdk';
import { apiErrorResult, toStructuredContent } from '../errors.js';
import { toolMeta } from '../tool-scopes.js';

export function registerVerificationKeysTools(mcp: McpServer, client: AgledgerClient): void {
  mcp.registerTool(
    'list_verification_keys',
    {
      title: 'List Verification Keys',
      description:
        'List all vault signing public keys (active and retired) for independent audit chain verification. ' +
        'No authentication required. Use these keys to verify Ed25519 signatures on audit chain exports. ' +
        'Next step: fetch an audit export with `export_mandate_audit` and verify signatures locally.',
      inputSchema: {},
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
      _meta: toolMeta('list_verification_keys'),
    },
    async () => {
      try {
        const result = await client.verificationKeys.list();
        return { content: [], structuredContent: toStructuredContent(result) };
      } catch (err) {
        return apiErrorResult(err);
      }
    },
  );
}
