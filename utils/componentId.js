const INITIAL_TOOL_ID = 1000;
const INITIAL_THINK_ID = 2000;
const MAX_COMPONENT_ID = 999999999;

global.toolId = INITIAL_TOOL_ID;
global.thinkId = INITIAL_THINK_ID;

export function nextToolId() {
  const currentId = Number.isSafeInteger(global.toolId) ? global.toolId : INITIAL_TOOL_ID;
  global.toolId = currentId >= MAX_COMPONENT_ID ? INITIAL_TOOL_ID : currentId + 1;
  return global.toolId;
}

export function nextThinkId() {
  const currentId = Number.isSafeInteger(global.thinkId) ? global.thinkId : INITIAL_THINK_ID;
  global.thinkId = currentId >= MAX_COMPONENT_ID ? INITIAL_THINK_ID : currentId + 1;
  return global.thinkId;
}
