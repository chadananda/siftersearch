// The score-hype grading rubric + judge model, shared by tests/quality/score-hype.mjs and the hype-program 1% grader. No deps.
import { modelFor } from '../model-roles.js';
export const JUDGE_MODEL = modelFor('hype-judge').model;   // role hype-judge = the model score-hype grades with (comparable grades)
export const RUBRIC = `You are grading SEARCH QUESTIONS written for one passage. They exist so a reader's own wording retrieves this passage.

For EACH question return:
  "searchable": true only if a real reader might type it into a search box. FALSE for anything referring to the text itself ("what does this passage say/ask", "according to the following"), and FALSE for a topic with a question mark that would match anything ("what did the author say about nature?").
  "answered": true only if THIS passage answers it — either text. A question about an original-language term is ANSWERED when that term appears in the original passage shown, even though the English does not contain it: that is what the two texts are for. False only if it genuinely needs knowledge from outside both.
  "distinct": false if another question in the set asks the same thing in different words — name it in "same_as".
Then for the SET:
  "missed": short list of things this passage clearly answers that NO question covers. Be strict; this is the most useful field.
Return ONLY JSON:
{"questions":[{"i":0,"searchable":true,"answered":true,"distinct":true,"same_as":null,"why":"…"}],"missed":["…"]}`;
// The ORIGINAL goes too: without it the judge marks every question about an original-language term "outside knowledge".
export const judgeUser = (paragraph, original, questions) => `PASSAGE (English):\n${paragraph}${original ? `\n\nPASSAGE (original language — a question about a term FOUND HERE is answerable):\n${original}` : ''}\n\nQUESTIONS:\n${questions.map((q, i) => `${i}. ${q}`).join('\n')}`;
