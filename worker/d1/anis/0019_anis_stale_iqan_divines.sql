-- 11-14 (conversation 73b1d410…, rounds 3-4): set 172 "Who are the 'Illumined Divines' … Kitáb-i-Íqán?" fed a table that made the Íqán's
-- Mullá Báqir (Mullá Mihdíy-i-Kandí's brother, martyred at Ṭabarsí) the Letter of the Living of that name. Stale: never served again;
-- the next asker researches afresh under the identity rule (agent-core WHO A BOOK MEANS). Later cases: POST /_anis/stale {id}.
UPDATE anis_research_sets SET status = 'stale', updated_at = 1794662800000 WHERE id = 172 AND status = 'candidate';
