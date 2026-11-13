// Build-time snapshot for the Anís edge Worker: the agent's LLM tool schemas + the remote impl function names → worker/anis/agent-tools.json. Run: node scripts/anis-edge/snapshot-tools.mjs
import { writeFileSync } from 'node:fs';
import { AGENT_TOOLS, agentTools } from '../../api/lib/assistant/agent.js';
import { edgeExtras } from '../../api/routes/anis-impl-tools.js';

const LOCAL = ['researchLookup', 'researchCapture'];   // the Worker answers these from D1/Vectorize
export const snapshot = () => ({ tools: AGENT_TOOLS, impl: [...Object.entries(agentTools()).filter(([k, v]) => typeof v === 'function' && !LOCAL.includes(k)).map(([k]) => k), ...Object.keys(edgeExtras)].sort() });
if (import.meta.url === `file://${process.argv[1]}`) { writeFileSync(new URL('../../worker/anis/agent-tools.json', import.meta.url), JSON.stringify(snapshot(), null, 1) + '\n'); process.exit(0); }
