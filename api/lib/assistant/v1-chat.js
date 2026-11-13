// POST /api/v1/chat adapter over anisTurn (the one chat pipeline). v1 body → turn args; anisTurn events → v1 SSE types.
// Pure; the route owns sessions/persistence. Deps: none.
export const v1TurnArgs = ({ messages, participant, clientKey, test = false, onEvent, site = null }) => ({
  messages: messages.map((m) => ({ role: m.role, content: m.content })),
  channel: 'site-chat', profile: {}, participant, clientKey, test, onEvent, site,
});
// → v1 event or null (dropped). text/stage/understood/progress/companion_offer pass through; status{text}→{message}; sources→citations; session is the route's own.
export const v1Event = (ev) => {
  if (!ev?.type || ev.type === 'session') return null;
  if (ev.type === 'status') return ev.text ? { type: 'status', message: ev.text } : null;
  if (ev.type === 'sources') return ev.sources?.length ? { type: 'citations', citations: ev.sources } : null;
  return ev;
};
export const v1Done = ({ r, conversation_id, startTime }) => ({
  type: 'done', processingTimeMs: Date.now() - startTime, conversation_id, final_reply: r.reply || '', citations: r.citations || [],
  meta: { user_intent: r.status === 'answered' ? (r.plan?.shape || null) : null, retrieved_count: (r.retrieved || []).length, engine: 'anis', ...(r.format?.id ? { format: r.format.id } : {}) },
});
