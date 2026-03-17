export function resolveThinkingMode(requestBody, streamEnabled) {
  const useThinkMode = typeof requestBody?.useThinkMode === "boolean" ? requestBody.useThinkMode : undefined;
  if (!streamEnabled) {
    return { enableThinking: undefined, useThinkMode };
  }
  return { enableThinking: useThinkMode, useThinkMode };
}
