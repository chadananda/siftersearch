// "Who was at this event" — the intersection of two node rosters.
//
// THE RULE (BA lock, 2026-08-28). Membership in the answer is decided by TWO structured rosters and nothing
// else: the event node's participants carrying the event relation, and the group node's members carrying the
// membership relation. A claim found by search elsewhere does NOT admit someone — Mullá Báqir-i-Tabrízí is a
// Letter of the Living with a Badasht claim in the claim table, and he is absent from the Badasht node, so
// he is not on this page.
//
// Four people are excluded for four different reasons, which is the whole difficulty of this page:
//   Mullá Ḥusayn    a Letter, but his event relation is `visited` — labelled, not attended
//   Mullá Báqir     a Letter, but absent from the event node
//   Bahá'u'lláh     participated-in, but not a member
//   Shoghi Effendi  neither
//
// NOTHING IS SILENTLY DROPPED. People on the event node with another relation come back as `otherRelations`
// and members with no event edge as `membersNotAtEvent`, both labelled, so the page can show why someone the
// reader expects is not in the list. An absence with no explanation reads as missing data.
//
// Deps: none (pure). Consumed by src/pages/who-was-at/[event].astro.

/**
 * @param {{event: {participants?: Array}, group: {participants?: Array},
 *          eventRelation?: string, groupRelation?: string}} args
 */
export function intersectRosters({ event, group, eventRelation = 'participated-in', groupRelation = 'letter-of-the-living' }) {
  const eventPeople = event?.participants || [];
  const groupPeople = group?.participants || [];

  const members = new Map(
    groupPeople.filter((p) => (p.relations || []).includes(groupRelation)).map((p) => [p.id, p]));
  const atEvent = new Map(eventPeople.map((p) => [p.id, p]));

  const attendees = [];
  const otherRelations = [];
  for (const p of eventPeople) {
    const isMember = members.has(p.id);
    const hasRelation = (p.relations || []).includes(eventRelation);
    if (isMember && hasRelation) {
      // Show the EVENT edge as the evidence: the page's claim is that they were there, not that they belong.
      attendees.push({ ...p, evidence: (p.evidence || []).filter((e) => e.relation === eventRelation) });
    } else if (isMember) {
      otherRelations.push(p);          // a member present in some other way — say which
    }
  }
  const membersNotAtEvent = [...members.values()].filter((p) => !atEvent.has(p.id));

  return { attendees, otherRelations, membersNotAtEvent };
}
