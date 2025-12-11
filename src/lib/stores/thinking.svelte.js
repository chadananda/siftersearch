// Shared reactive state for Sifter's thinking status
// Used to trigger neural activity animation in background

let thinkingState = $state({ isThinking: false });

export function setThinking(value) {
  thinkingState.isThinking = value;
}

export function getThinkingState() {
  return thinkingState;
}
