// Seeker Companion admin controls (§10 dials, §11 metrics, §7.4 transparency) + a preview so an admin
// can SEE the resolved personality/decision for any message. Mounted under /api/admin. Admin-gated.
import { requireTier } from '../lib/auth.js';
import { userQueryAll } from '../lib/db.js';
import { SEED_DIALS, resolveDials, validateDial, POLICY_VERSION } from '../lib/companion/dials.js';
import { TRACKS } from '../lib/companion/courses.js';
import { buildConstitution, buildCompanionPlan, companionStore } from '../lib/companion/index.js';

export default async function companionRoutes(fastify) {
  const admin = { preHandler: requireTier('admin') };

  // Dial contract + current global values (the admin control surface).
  fastify.get('/companion/config', admin, async () => {
    const global = await companionStore.getGlobalDials();
    const { values, provenance } = resolveDials({ global });
    return { policy_version: POLICY_VERSION, dials: SEED_DIALS, values, provenance, global };
  });

  // Set a global dial (admin). Validated + clamped; audited via updated_by.
  fastify.post('/companion/dials', admin, async (req) => {
    const { key, value } = req.body || {};
    const v = validateDial(key, value);
    if (!v.ok) { const e = new Error(v.error); e.statusCode = 400; throw e; }
    await companionStore.setGlobalDial(key, v.value, req.user?.email || 'admin');
    return { ok: true, key, value: v.value };
  });

  // Preview the resolved personality + decision plan for a sample message (no LLM call — the plan is
  // deterministic). Lets an admin tune dials and immediately see mode/intervention/challenge/authority.
  fastify.post('/companion/preview', admin, async (req) => {
    const { message = 'What do Bahá’ís believe about the soul?', persona = 'Jafar', tradition = "Baha'i" } = req.body || {};
    const global = await companionStore.getGlobalDials();
    const built = buildCompanionPlan({
      participantId: null, authed: false, message,
      classifier: { intent: 'definition', traditions: tradition ? [tradition] : [] },
      evidenceDocs: [{ doc_id: 0, title: 'Some Answered Questions', author: '‘Abdu’l-Bahá', religion: "Baha'i" }],
      evidenceCount: 3, relationship: null, globalDials: global,
    });
    return {
      plan: built.plan,
      dials: built.dials,
      system_preview: buildConstitution({ persona, dials: built.dials, mode: built.plan.mode }) + built.systemAppend,
    };
  });

  // Outcome metrics (§11): exposure counts by mode + intervention over a window. Diagnostics only —
  // never conversion. Reads the immutable exposure log.
  fastify.get('/companion/metrics', admin, async (req) => {
    const days = Math.min(90, Math.max(1, parseInt(req.query?.days, 10) || 30));
    const since = Math.floor(Date.now() / 1000) - days * 86400;
    const [byMode, byIntervention, byChallenge, total] = await Promise.all([
      userQueryAll('SELECT mode, COUNT(*) n FROM companion_exposure WHERE created_at > ? GROUP BY mode ORDER BY n DESC', [since]).catch(() => []),
      userQueryAll('SELECT intervention, COUNT(*) n FROM companion_exposure WHERE created_at > ? GROUP BY intervention ORDER BY n DESC', [since]).catch(() => []),
      userQueryAll('SELECT challenge_level, COUNT(*) n FROM companion_exposure WHERE created_at > ? GROUP BY challenge_level ORDER BY challenge_level', [since]).catch(() => []),
      userQueryAll('SELECT COUNT(*) n, COUNT(DISTINCT participant_id) p FROM companion_exposure WHERE created_at > ?', [since]).catch(() => [{ n: 0, p: 0 }]),
    ]);
    return { days, total: total[0]?.n || 0, participants: total[0]?.p || 0, byMode, byIntervention, byChallenge };
  });

  // Curriculum graph (§8) — the tracks the companion can guide into.
  fastify.get('/companion/courses', admin, async () => ({ tracks: TRACKS }));

  // Transparency (§7.4): inspect a participant's inquiry map, or delete their companion data (§14).
  fastify.get('/companion/participant/:id', admin, async (req) => companionStore.inquiryMap(req.params.id));
  fastify.delete('/companion/participant/:id', admin, async (req) => {
    await companionStore.deleteParticipant(req.params.id);
    return { ok: true, deleted: req.params.id };
  });
}
