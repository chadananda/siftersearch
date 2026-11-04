// The cost ladder + the Jev gates per activity (no imports: the theory loop and the activity catalog both read it).
// tier = the rung a step stands on: code → jev → llm-fast (registry cls code|jev|llm). ACTIVITY_GATES = the Jev gates (calls.db task)
// an activity's run asks — where a tested decision theory ships as that step's params.enrich (graph.js → enrich.js).
export const TIERS = ['code', 'jev', 'llm-fast'];
export const tierOf = (cls) => (cls === 'llm' ? 'llm-fast' : cls === 'jev' ? 'jev' : 'code');
export const ACTIVITY_GATES = { 'respond.plan': ['search-plan'] };
/** gate → the activities that ask it. */
export const activitiesForGate = (gate) => Object.entries(ACTIVITY_GATES).filter(([, gs]) => gs.includes(gate)).map(([a]) => a);
