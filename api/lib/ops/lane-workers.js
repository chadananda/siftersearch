// Lane concurrency for the ops services (reports, indexer) — its own module so the indexer's import graph stays small.
// How many jobs a lane runs AT ONCE (default 1). Phrase indexing was tried at 3 (10-16) and MEASURED WORSE: ~91K
// phrases/h for all three vs ~142K/h for one, because the interim /crutch SSD (Kingston A400, no TRIM) saturated —
// 82% util, 667 ms write latency. Revisit on the 4TB NVMe. Override with OPS_LANE_WORKERS='{"index":2}'.
// ocr: 3 — SearchLayerPDF batches are cheapest submitted together (one GPU pod serves them; pods stop after 10 idle min).
export const LANE_WORKERS = { index: 1, ocr: 3, ...(() => { try { return JSON.parse(process.env.OPS_LANE_WORKERS || '{}'); } catch { return {}; } })() };
