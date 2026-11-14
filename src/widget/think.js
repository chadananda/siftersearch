// The thinking sky (Chad P4): while Anís researches, a faint constellation drifts behind the conversation and deepens with
// each research step. thinkDepth = how deep (0..1) after n stage/status events; skyNodes/linkAlpha size and shade it. Pure.
export const thinkDepth = (n) => (n > 0 ? 1 - Math.exp(-n / 4) : 0);
export const skyNodes = (depth, area = 1) => Math.round((14 + 24 * Math.min(1, Math.max(0, depth))) * Math.min(1.6, Math.max(0.5, area)));
// a line between two stars: fades with distance, strengthens with depth; 0 beyond reach
export const linkAlpha = (d, reach, depth) => (d >= reach || reach <= 0 ? 0 : (1 - d / reach) * (0.1 + 0.28 * Math.min(1, Math.max(0, depth))));
