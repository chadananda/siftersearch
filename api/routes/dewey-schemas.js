// OpenAPI schemas for /api/dewey/* (Chad 10-17: "is there a good openapi api?"). Served in /api/v1/docs/json under tag Dewey.
// Every object keeps additionalProperties: true — Fastify serializes responses through these schemas, and a closed object
// would silently drop fields the page and agents rely on. Contract test: tests/api/openapi-dewey-contract.test.js
const open = (properties = {}, extra = {}) => ({ type: 'object', additionalProperties: true, properties, ...extra });
const security = [{ apiKey: [] }, { bearer: [] }];
const base = (summary, description) => ({ tags: ['Dewey'], summary, description, security });

const fileUpload = open({ name: { type: 'string', description: 'file name with extension: .pdf .docx .doc .rtf .odt .wpd .html .webarchive .epub .txt .md' },
  data: { type: 'string', description: 'the file, base64' } }, { required: ['data'] });

const identified = open({
  title: { type: 'string' }, author: { type: 'string' }, edition: { type: 'string' }, year: { type: 'string' },
  language: { type: 'string' }, kind: { type: 'string', description: 'book · article · tablet · video · …' },
  from: { type: 'string', description: 'what it was read from: text · url · photo · file' },
  needs_ocr: { type: 'boolean', description: 'a scan with no text layer' },
}, { description: 'What Dewey read the work as' });

const relation = open({
  relation: { type: 'string', enum: ['same', 'inside', 'partial', 'overlap', 'quotes', 'too-short', 'unrelated'] },
  ours_in_theirs: { type: 'number', description: 'share of the given text found in this document' },
  theirs_in_ours: { type: 'number', description: 'share of this document found in the given text' },
  in_order: { type: 'number', description: '1 = the shared text runs in the same order (same work); low = scattered quotation' },
  length_ratio: { type: 'number', description: 'this document’s length ÷ the given text’s' },
}, { description: 'Full-text comparison (word 4-grams, both directions)' });

const candidate = open({
  id: { type: 'integer', description: 'document id (see /document/{id} on siftersearch.com)' },
  title: { type: 'string' }, author: { type: 'string' }, language: { type: 'string' },
  evidence: { type: 'array', items: open({ kind: { type: 'string', description: 'title · title+author · part of · text' }, detail: { type: 'string' } }) },
  relation,
});

const holdings = open({
  identified,
  memo: open({ sha256: { type: 'string' }, cached: { type: 'boolean' }, checked_at: { type: 'string' } }, { description: 'files only: the check memo (dewey_checks) — cached = answered from an earlier check of the same content (a held verdict while its document is live; others for 7 days)' }),
  verdict: { type: 'string', enum: ['held', 'partly-held', 'possible', 'not-found-by-title', 'not-held', 'undetermined'],
    description: 'From a FULL-TEXT comparison when text was given (a file, a passage, a photographed page): `held` = the same text or contained in a larger work; `partly-held` = the library holds only part of it; `possible` = shared passages only. `not-held` = nothing matched. Title-only input: `not-found-by-title` = only the title missed — send its text to settle it. `undetermined` = no readable text (a scan OCR could not read): Dewey cannot tell, and file-name matches are hints only.' },
  reason: { type: 'string' },
  compared: open({ words: { type: 'integer' }, probes: { type: 'integer' }, documents: { type: 'integer' } }, { description: 'what the text comparison covered' }),
  candidates: { type: 'array', items: candidate },
});

const STATES = ['offered', 'declined', 'wanted', 'researched', 'source', 'processing', 'ingested', 'needs-ocr', 'needs-human', 'failed', 'lead', 'to-buy', 'archived'];   // lead · to-buy: the scouts (planning/dewey-scouts-plan.md)
const item = open({
  id: { type: 'integer' }, title: { type: 'string' }, author: { type: ['string', 'null'] }, kind: { type: ['string', 'null'] },
  state: { type: 'string', enum: STATES, description: 'offered (an uploaded document we lack, archived, waiting for a yes: POST /items/{id}/accept) · wanted → researched → source → processing → ingested; or needs-ocr / needs-human / failed (reason in log)' },
  doc_id: { type: ['integer', 'null'], description: 'the library document once ingested' },
  research: open({}, { description: 'ISBN, publisher, year, cover, sources found', nullable: true }),
  log: { type: 'array', items: open({ at: { type: 'string' }, why: { type: 'string' } }) },
  created_at: { type: 'string' }, updated_at: { type: 'string' },
}, { description: 'A wanted work and its intake progress' });

const err = { 400: open({ error: { type: 'string' }, message: { type: 'string' } }) };

export const holdingsSchema = {
  ...base('Do we have it?', 'Give any ONE of: `text` (title, author, or a sentence of the work), `url` (a book page, PDF or video), `images` (photos of the cover, title page or a page of text), or `file`. Dewey reads it and searches the library by title, author and text.'),
  body: open({
    text: { type: 'string', description: 'a title, an author, or a sentence or more of its text' },
    url: { type: 'string', description: 'a book page, PDF or video' },
    images: { type: 'array', maxItems: 6, items: { type: 'string' }, description: 'data URLs (JPEG/PNG), ~1600 px is best' },
    file: fileUpload,
    path: { type: 'string', description: 'a file already ON THE SERVER, under a folder Dewey may read (the synced Dropbox, DEWEY_PATH_ROOTS) — read in place: no upload, no size limit' },
  }),
  querystring: { type: 'object', properties: { fresh: { type: 'string', description: '1 = check again even if this file content was checked before' } } },
  response: { 200: holdings, ...err },
};

export const activitySchema = {
  ...base('Intake activity', 'Works Dewey is loading now or has just loaded; once a work is a document, its indexing layers from the coverage ledger.'),
  querystring: { type: 'object', properties: { limit: { type: 'integer', minimum: 1, maximum: 100, default: 30 } } },
  response: { 200: open({ items: { type: 'array', items: open({
    id: { type: 'integer' }, title: { type: 'string' }, author: { type: ['string', 'null'] }, state: { type: 'string', enum: STATES },
    doc_id: { type: ['integer', 'null'] }, updated_at: { type: 'string' }, cover: { type: 'boolean' },
    last: { type: ['string', 'null'], description: 'the latest log line' },
    layers: open({}, { nullable: true, description: 'per indexing layer (text, sections, keyword, refs, embedding, phrase, hype): generated/indexed vs total' }),
    stages: { type: 'array', items: open({ key: { type: 'string' }, label: { type: 'string' }, state: { type: 'string', enum: ['done', 'active', 'todo', 'wait', 'fail', 'skip'] } }), description: 'checked → appraised → OCR → imported → indexing layers' },
    ocr: open({}, { nullable: true, description: 'done (receipt), in progress (pages_done / pages_total, stage) or rejected (why)' }),
    has_source: { type: 'boolean', description: 'the original file is on hand (GET /api/dewey/items/:id/file)' },
    shelf: { type: ['string', 'null'] },
  }) } }) },
};

export const missingSchema = {
  ...base('Missing books', 'Works the library\'s catalogues list but it does not hold, in two queues: a source is known, or none is. `{ pending: true }` until the snapshot exists.'),
  response: { 200: open({ pending: { type: 'boolean' }, haveSourceTotal: { type: 'integer' }, noSourceTotal: { type: 'integer' },
    generated_at: { type: ['string', 'null'] }, haveSource: { type: 'array', items: open() }, noSource: { type: 'array', items: open() } }) },
};

export const createItemSchema = {
  ...base('Add to the wanted list', 'Puts a work on the wanted list; research (ISBN, publisher, year, cover, sources) starts automatically. An open item with the same title is returned instead of a duplicate (`existing: true`).'),
  body: open({ identified: open({ title: { type: 'string', minLength: 1 }, author: { type: 'string' }, kind: { type: 'string' } }, { required: ['title'] }) }, { required: ['identified'] }),
  response: { 200: open({ item, existing: { type: 'boolean' } }), ...err },
};

export const listItemsSchema = {
  ...base('The wanted list', 'The wanted list and intake queue, open items first.'),
  querystring: { type: 'object', properties: { state: { type: 'string', enum: STATES }, limit: { type: 'integer', minimum: 1, maximum: 1000, default: 100 } } },
  response: { 200: open({ items: { type: 'array', items: item } }) },
};

export const sourceSchema = {
  ...base('Attach a source', 'A URL (PDF or web page) or an uploaded file for a wanted item. The original is archived untouched, then processed: text → library file → ingest → every index. Watch `GET /api/dewey/items` or `/activity` for progress.'),
  params: { type: 'object', properties: { id: { type: 'integer' } }, required: ['id'] },
  body: open({ url: { type: 'string' }, file: fileUpload }),
  response: { 200: open({ item }), ...err, 404: err[400] },
};

export const acceptSchema = {
  ...base('Add an offered upload', 'Yes to an upload Dewey offered (state `offered`: not in the library, already archived, appraised with a recommended shelf). Queues intake into that shelf. Idempotent.'),
  params: { type: 'object', properties: { id: { type: 'integer' } }, required: ['id'] },
  response: { 200: open({ item }), 400: err[400], 404: err[400] },
};

export const declineSchema = {
  ...base('Decline an offered upload', 'No to an offered upload: marked `declined`, never imported (the archived original is kept). Idempotent.'),
  params: { type: 'object', properties: { id: { type: 'integer' } }, required: ['id'] },
  response: { 200: open({ item }), 404: err[400] },
};

export const chatSchema = {
  ...base('Talk to Dewey', [
    'One turn of Dewey\'s chat. Anything attached is checked against the library BEFORE Dewey replies; if it is not held he researches it online (Perplexity + Parallel.ai) and appraises it — in scope, shelf, value, price. An uploaded file we lack that belongs here is imported at once.',
    '',
    'Every member has ONE thread, shared with the /dewey page on every device: send just `message` and the history comes from the saved thread (or pass your own `messages`).',
    '',
    '**Default: server-sent events** (`text/event-stream`), one JSON object per `data:` line, `type` one of: `status` (progress line; `text: null` clears it) · `holdings` (a check, shaped as POST /holdings returns) · `research` (`source`, `text`, `citations`) · `appraisal` · `item` (a wanted item created or changed) · `delta` (reply text) · `error` · `done`.',
    '',
    '**`stream: false`** returns the JSON documented below. Both forms answer at once and keep the connection alive (JSON: leading spaces every 20 s, valid JSON; SSE: `: ping` comments), so a long turn never hits the edge timeout. A failure after the headers comes back as `error` in the JSON.',
  ].join('\n')),
  body: open({
    message: { type: 'string', description: 'your message (the thread supplies the history)' },
    messages: { type: 'array', items: open({ role: { type: 'string', description: 'user | assistant' }, content: { type: 'string' } }),
      description: 'OR the whole conversation, last one yours — overrides the saved history' },
    attach: open({ images: { type: 'array', maxItems: 6, items: { type: 'string' }, description: 'photo data URLs' }, file: fileUpload, path: { type: 'string', description: 'a file already ON THE SERVER, under a folder Dewey may read (the synced Dropbox, DEWEY_PATH_ROOTS) — read in place: no upload, no size limit' }, url: { type: 'string' } }),
    stream: { type: 'boolean', default: true },
  }),
  response: { 200: open({ reply: { type: 'string' }, error: { type: 'string' }, holdings: { type: 'array', items: holdings }, items: { type: 'array', items: item } },
    { description: 'with `stream: false`' }) },
};

export const threadSchema = {
  ...base('Your thread', 'The member\'s one Dewey thread (the same on every device). `after` returns only messages newer than that id.'),
  querystring: { type: 'object', properties: { after: { type: 'integer', minimum: 0 } } },
  response: { 200: open({ messages: { type: 'array', items: open({ id: { type: 'integer' }, role: { type: 'string', enum: ['user', 'assistant'] },
    content: { type: 'string' }, parts: open({}, { nullable: true, description: 'cards shown with the message (holdings, research, appraisal, item, photo thumbs)' }),
    created_at: { type: 'string' } }) } }) },
};

export const keysSchema = {
  tags: ['Dewey'], summary: 'Create a Dewey API key',
  description: 'From a SIGNED-IN SESSION only (never with another key). Shown once, stored as a hash, permission `dewey`, 600 requests/hour. Revoke on /settings → API keys.',
  body: open({ name: { type: 'string', maxLength: 80 } }),
  response: { 200: open({ key: { type: 'string' }, id: { type: 'integer' }, name: { type: 'string' }, prefix: { type: 'string' },
    rateLimitPerHour: { type: 'integer' }, note: { type: 'string' } }), 403: err[400] },
};

const idParam = { type: 'object', required: ['id'], properties: { id: { type: 'integer' } } };
export const reviewSchema = {
  ...base('Review an item', 'For an item waiting for a person: the question Dewey is asking, what it knows, the text it has (OCR or file, first 4,000 characters), the library shelves, and the answers that fit (`answers[].action` → POST /items/:id/resolve).'),
  params: idParam,
  response: { 200: open({ item: open({}), question: { type: ['string', 'null'] }, history: { type: 'array', items: open({}) }, source: open({}, { nullable: true }),
    text: open({}, { nullable: true }), shelves: open({}), answers: { type: 'array', items: open({ action: { type: 'string' }, label: { type: 'string' }, hint: { type: 'string' }, fields: { type: 'boolean' } }) } }) },
};
export const itemFileSchema = { ...base('An item\'s original file', 'The archived original (PDF, Word, text…), served inline.'), params: idParam };
export const itemPreviewSchema = { ...base('An item\'s original, readable', 'RTF, Word (.doc/.docx), WordPerfect, ODT, EPUB or a webarchive converted to sanitised HTML for display (no scripts, no external fetches). Other types: GET …/file.'), params: idParam };
export const resolveSchema = {
  ...base('Answer an item', 'Carries out a person\'s answer: `import` (add it — waives the fragment, twin and page-limit guards; optional title, author, shelf), `use-ocr` (accept OCR text that failed the check), `retry-ocr`, or `decline`. Only the answers GET /review lists are accepted.'),
  params: idParam,
  body: { type: 'object', required: ['action'], properties: { action: { type: 'string', enum: ['import', 'use-ocr', 'retry-ocr', 'acquire', 'archive', 'decline'] },
    title: { type: 'string' }, author: { type: 'string' }, shelf: { type: 'object', properties: { religion: { type: 'string' }, collection: { type: 'string' } } } } },
  response: { 200: open({ item: open({}) }) },
};
