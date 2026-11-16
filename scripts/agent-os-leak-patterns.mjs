/** Patterns that must not appear in Vibueno (agent-os / Luigi identifiers — FAB-190 AC3). */
export const AGENT_OS_LEAK_PATTERNS = [
  { id: 'd1-database-id', pattern: /ec354238-62d6-4414-ba50-0332085f7651/i },
  { id: 'kv-namespace-id', pattern: /e4933668cd3649a8b417bd8c5da49ebf/i },
  { id: 'tablero-luigi', pattern: /tablero-luigi/i },
  { id: 'tablero-posts', pattern: /tablero-posts/i },
  { id: 'luigi-email', pattern: /luigirscanoro@gmail\.com/i },
  { id: 'luigi-x-handle', pattern: /@LuigiMdpDev/i },
];

export const SCAN_SKIP_DIRS = new Set(['.git', 'node_modules', '.wrangler', 'evidence']);