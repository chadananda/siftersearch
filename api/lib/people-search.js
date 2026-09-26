// People search over the entity graph: who did X / members of a group who did Y — each person with cited claims.
// Moved out of routes/people.js (/people/search) so RAW planned search can use it as its claims layer: the plan
// already classifies roster/relational questions; this is the index that answers them. Deps: bio, entity-api.
import { bioSearch } from './bio.js';
import { entityDossier, entitySearch, searchTerms, foldText } from './entity-api.js';
import { alignAnswer } from './people-answer.js';

export async function peopleSearch(q) {
  const base = await bioSearch(q);
  // THE LIVE BODY MUST MATCH THE SPEC. It returned {ids, q, group, reasoning} while the OpenAPI documented
  // people[] with evidence.relation/statement/source/paraId — so a client written from the contract got
  // nothing it could use, and the ids alone carry no citation to verify.
  //
  // `ids` and `reasoning` are KEPT (the biography browser reads them); people[] is added alongside, built
  // from the cited-claim layer so every person arrives with the proof a reader needs.
  //
  // RECALL: bioSearch answered "Letters of the Living who participated in Badasht" with 4 of the 6 people
  // the evidence supports. Its ids are unioned with the evidence search rather than replaced — two
  // different recall paths over the same corpus, and dropping either loses real people.
  // A GROUP IN THE QUERY IS A CONSTRAINT; THE REST OF THE QUERY IS THE QUESTION.
  // Bounding by the roster alone still answered "Letters of the Living who participated in Badasht" with
  // all 11 roster members that matched — because every one of them matches the words "letters"/"living",
  // which are the group's OWN name. The group half selects WHO IS ELIGIBLE; the remaining words are what
  // they must actually have done. So search on the remainder ("participated badasht") and intersect with
  // the roster — one search rather than two, and the answer is members with evidence for the act.
  let searchQ = q;
  if (base.group) {
    const gname = (await entityDossier(base.group).catch(() => null))?.name || '';
    const groupTerms = new Set(searchTerms(gname.replace(/\([^)]*\)/g, ' ')));
    const rest = searchTerms(q).filter((t) => !groupTerms.has(t));
    if (rest.length) searchQ = rest.join(' ');
  }
  const evidence = await entitySearch(searchQ, { limit: 60 });
  // A VERB IN THE QUERY THAT NAMES A RELATION CONSTRAINS THE RELATION.
  // "who PARTICIPATED IN Badasht" is a question about the `participated-in` edge. Answering it with
  // `visited` evidence is answering a different question: visiting is not attending. The relation names
  // come from the data itself (whatever relations the candidate evidence carries), so this needs no
  // vocabulary list and stays correct as the extractor's relation set grows.
  const relsPresent = [...new Set(evidence.results.flatMap((r) => r.evidence.map((e) => e.relation)).filter(Boolean))];
  const qTerms = searchTerms(q);
  const askedRelations = relsPresent.filter((rel) => {
    const f = foldText(rel).replace(/[^a-z0-9]+/g, ' ');
    return qTerms.some((t) => f.split(' ').some((w) => w.startsWith(t) || t.startsWith(w)));
  });
  if (askedRelations.length) {
    const want = new Set(askedRelations);
    // THE VERB PICKS THE EDGE; THE REMAINING WORDS PICK THE SUBJECT.
    // Constraining the relation alone let "participated-in ANYTHING" through: Mullá Ḥusayn arrived on
    // "participated-in engagement of Vás-Kas" and "battle at Bárfurúsh", Mullá ‘Alíy-i-Basṭámí on
    // "retirement for forty days" — neither has a Badasht claim. "participated" is the generic word here
    // exactly as "conference" was on the event node; "badasht" is the one that identifies the subject.
    // So the words NOT consumed by the relation must appear in the evidence itself.
    const relWords = new Set(askedRelations.flatMap((rel) => foldText(rel).split(/[^a-z0-9]+/).filter(Boolean)));
    const topicTerms = qTerms.filter((t) => ![...relWords].some((w) => w.startsWith(t) || t.startsWith(w)));
    const constrain = (needAll) => evidence.results
      .map((r) => ({
        ...r,
        evidence: r.evidence.filter((e) => want.has(e.relation) && (!topicTerms.length || (needAll
          ? topicTerms.every((t) => foldText(e.statement).includes(t))
          : topicTerms.some((t) => foldText(e.statement).includes(t))))),
      }))
      .filter((r) => r.evidence.length);
    // All topic words, or — rather than return nothing — any of them.
    const strict = constrain(true);
    evidence.results = strict.length ? strict : constrain(false);
  }
  const byId = new Map(evidence.results.map((r) => [r.id, r]));
  let people = [];
  for (const id of (base.ids || [])) {
    const hit = byId.get(id);
    if (hit) { people.push(hit); byId.delete(id); continue; }
    // Only widen with a dossier when the query did NOT name a relation. Pulling bioSearch's ids in
    // unconditionally re-admitted people whose evidence is the wrong edge — Bahá'u'lláh presided at
    // Badasht but is not a Letter of the Living, and that is exactly what the constraints exist to exclude.
    if (askedRelations.length) continue;
    const d = await entityDossier(id).catch(() => null);
    if (d) people.push({ id: d.id, name: d.name, importance: d.importance || 0, score: 0, evidence: (d.claims || []).slice(0, 8) });
  }
  for (const r of byId.values()) people.push(r);

  // A GROUP IN THE QUERY IS A CONSTRAINT, NOT A HINT.
  // Unioning the two recall paths answered "Letters of the Living who participated in Badasht" with 30
  // people including Shoghi Effendi and Ahmad Sohrab — the same wrong-people failure the group NODE was
  // just fixed for. When bioSearch resolves a group, the answer is bounded by that group's structured
  // roster (graph_relations), so membership is decided by the edge and never by whose claim happens to
  // repeat the group's name. `ids` and `reasoning` are left untouched for existing clients.
  if (base.group) {
    const g = await entityDossier(base.group).catch(() => null);
    const memberIds = new Set((g?.participants || []).map((m) => m.id));
    // Membership is decided by the structured edge, never by whose claim repeats the group's name.
    if (memberIds.size) people = people.filter((p) => memberIds.has(p.id));
  }
  people.sort((a, b) => (b.score || 0) - (a.score || 0) || (b.importance || 0) - (a.importance || 0));
  // ONE ANSWER. `ids` and `reasoning` are projected FROM people[], never left as a second, looser list —
  // agents read `ids`, and it was still naming Bahá'u'lláh (not a Letter of the Living) while omitting two
  // people the answer contained. Narrow the derived views to the answer; never widen the answer to match.
  return alignAnswer({ base, people: people.slice(0, 60) });
}
