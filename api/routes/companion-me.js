// Seeker Companion — user self-service transparency & consent (§1 PROMISE, §7.1–7.2, §14 Deletion).
// "Your questions are remembered when you permit it. You can inspect, correct, pause, and delete."
// Mounted under /api/v1/companion. Works for authed users AND anonymous sessions (they manage their
// own session data); consent is never presumed — memory persists only after an explicit opt-in here.
import { optionalAuthenticate } from '../lib/auth.js';
import { getAnonymousUserId } from '../lib/anonymous.js';
import { companionStore, relationshipStage } from '../lib/companion/index.js';

const participantOf = (req) => (req.user?.sub?.toString() || getAnonymousUserId(req) || null);

export default async function companionMeRoutes(fastify) {
  const auth = { preHandler: optionalAuthenticate };

  // My inquiry map — everything the companion remembers about me (§7.4 transparency).
  fastify.get('/', auth, async (req, reply) => {
    const pid = participantOf(req);
    if (!pid) return { participant: null, memory: [], premises: [], enrollments: [], recent_exposures: [] };
    return companionStore.inquiryMap(pid);
  });

  // Opt into / out of remembered memory + proactive contact (§2.2, §7.3). Return is NOT consent —
  // this endpoint is the ONLY thing that authorizes durable memory or contact.
  fastify.post('/consent', auth, async (req) => {
    const pid = participantOf(req);
    if (!pid) { const e = new Error('no participant'); e.statusCode = 400; throw e; }
    const { memory, contact } = req.body || {};
    await companionStore.setConsent(pid, { memory, contact });
    const rel = await companionStore.getRelationship(pid);
    const stage = relationshipStage({ authed: !!req.user?.sub, consentMemory: !!rel?.consent_memory, consentContact: !!rel?.consent_contact });
    await companionStore.setStage(pid, stage);
    return { ok: true, stage, consent_memory: !!rel?.consent_memory, consent_contact: !!rel?.consent_contact };
  });

  // Accept the "remember this thread?" offer — opt into memory in one step (§2.2 R1→R2 invariant).
  fastify.post('/remember', auth, async (req) => {
    const pid = participantOf(req);
    if (!pid) { const e = new Error('no participant'); e.statusCode = 400; throw e; }
    await companionStore.setConsent(pid, { memory: true });
    await companionStore.setStage(pid, 'R2_COMPANION');
    return { ok: true, stage: 'R2_COMPANION' };
  });

  // Explicit correction (§7.2) — invalidate remembered items / premise hypotheses that are wrong.
  fastify.post('/correction', auth, async (req) => {
    const pid = participantOf(req);
    if (!pid) { const e = new Error('no participant'); e.statusCode = 400; throw e; }
    const { memoryIds = [], premiseIds = [] } = req.body || {};
    await companionStore.applyCorrection(pid, { memoryIds, premiseIds });
    return { ok: true };
  });

  // Delete everything the companion holds about me (§14 Deletion — removes future influence too).
  fastify.delete('/', auth, async (req) => {
    const pid = participantOf(req);
    if (!pid) { const e = new Error('no participant'); e.statusCode = 400; throw e; }
    await companionStore.deleteParticipant(pid);
    return { ok: true, deleted: pid };
  });
}
