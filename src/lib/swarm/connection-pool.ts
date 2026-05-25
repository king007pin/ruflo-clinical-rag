import { Agent } from "undici";

/**
 * W87 — connection-pool.ts.
 * Configure a custom Undici connection pool agent for optimized CDSS swarm networking.
 * Helps avoid socket exhaustion during dense concurrent debate/synthesis rounds.
 */
export const undiciAgent = new Agent({
  keepAliveTimeout: 10_000,
  keepAliveMaxTimeout: 30_000,
  connections: 50,
  pipelining: 1,
});

/**
 * Returns the Undici dispatcher Agent for Nvidia API requests.
 */
export function getNvidiaDispatcher(): Agent {
  return undiciAgent;
}
