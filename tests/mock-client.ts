import { vi } from 'vitest';
import type { AgledgerClient } from '@agledger/sdk';

/**
 * Create a stub resource where every property is a vi.fn() that rejects by default.
 * Callers override specific methods with mockResolvedValue/mockRejectedValue as needed.
 */
function stubResource(name: string): Record<string, ReturnType<typeof vi.fn>> {
  return new Proxy({} as Record<string, ReturnType<typeof vi.fn>>, {
    get(target, prop: string) {
      if (!(prop in target)) {
        target[prop] = vi.fn().mockRejectedValue(
          new Error(`${name}.${prop}() not mocked`),
        );
      }
      return target[prop];
    },
  });
}

export interface MockOverrides {
  mandates?: Record<string, unknown>;
  receipts?: Record<string, unknown>;
  verification?: Record<string, unknown>;
  disputes?: Record<string, unknown>;
  webhooks?: Record<string, unknown>;
  reputation?: Record<string, unknown>;
  events?: Record<string, unknown>;
  schemas?: Record<string, unknown>;
  dashboard?: Record<string, unknown>;
  compliance?: Record<string, unknown>;
  registration?: Record<string, unknown>;
  health?: Record<string, unknown>;
  proxy?: Record<string, unknown>;
  admin?: Record<string, unknown>;
  a2a?: Record<string, unknown>;
  capabilities?: Record<string, unknown>;
  notarize?: Record<string, unknown>;
  enterprises?: Record<string, unknown>;
  projects?: Record<string, unknown>;
  federation?: Record<string, unknown>;
  federationAdmin?: Record<string, unknown>;
  agents?: Record<string, unknown>;
  references?: Record<string, unknown>;
  verificationKeys?: Record<string, unknown>;
}

const RESOURCE_NAMES = [
  'mandates', 'receipts', 'verification', 'disputes', 'webhooks',
  'reputation', 'events', 'schemas', 'dashboard', 'compliance',
  'registration', 'health', 'proxy', 'admin', 'a2a', 'capabilities',
  'notarize', 'enterprises', 'projects', 'federation', 'federationAdmin',
  'agents', 'references', 'verificationKeys',
] as const;

/**
 * Create a mock AgledgerClient with all 24 resource stubs.
 * Every method rejects by default; pass overrides to configure specific methods.
 */
export function createMockClient(overrides?: MockOverrides): AgledgerClient {
  const client: Record<string, unknown> = {};
  for (const name of RESOURCE_NAMES) {
    const resource = stubResource(name);
    const resourceOverrides = overrides?.[name];
    if (resourceOverrides) {
      Object.assign(resource, resourceOverrides);
    }
    client[name] = resource;
  }
  return client as unknown as AgledgerClient;
}
