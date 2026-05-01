import { MultiAgentCoordinator } from "../agent/multi-agent/index.js";
import { MULTI_AGENT_UI_CONFIG } from "../agent/multi-agent/config.js";
import { escapeHtml } from "./thinkingRenderer.js";

export function buildMultiAgentCoordinator(primaryAgent, config = {}) {
  return new MultiAgentCoordinator({
    primaryAgent,
    subAgentOptions: {
      capabilityRoutingEnabled: config.capabilityRoutingEnabled === true,
    },
  });
}

export function normalizeMultiAgentOptions(body = {}) {
  const requestMultiAgent = body?.multiAgent;
  const enableMultiAgent = body?.enableMultiAgent === true;

  if (!requestMultiAgent || typeof requestMultiAgent !== "object" || Array.isArray(requestMultiAgent)) {
    return {
      enabled: enableMultiAgent,
    };
  }

  return {
    ...requestMultiAgent,
    enabled: requestMultiAgent.enabled === true || enableMultiAgent,
  };
}

export function renderMultiAgentEventBlock(chunk = {}) {
  const palette = {
    multi_agent_status: {
      border: "#7c3aed",
      bg: "#f5f3ff",
      title: "#5b21b6",
      label: MULTI_AGENT_UI_CONFIG.labels.multiAgentStatus,
    },
    subagent_status: {
      border: "#2563eb",
      bg: "#eff6ff",
      title: "#1d4ed8",
      label: MULTI_AGENT_UI_CONFIG.labels.subAgentStatus,
    },
    subagent_result: {
      border: chunk.status === "done" ? "#059669" : "#dc2626",
      bg: chunk.status === "done" ? "#ecfdf5" : "#fef2f2",
      title: chunk.status === "done" ? "#047857" : "#b91c1c",
      label: MULTI_AGENT_UI_CONFIG.formatters.subAgentResultLabel(chunk.agentLabel),
    },
  };

  const theme = palette[chunk.type] || palette.multi_agent_status;
  const agentLabel = escapeHtml(String(chunk.agentLabel || MULTI_AGENT_UI_CONFIG.labels.subAgentStatus));
  const title = chunk.type === "multi_agent_status"
    ? MULTI_AGENT_UI_CONFIG.titles.multiAgentStatus
    : MULTI_AGENT_UI_CONFIG.formatters.subAgentResultTitle(agentLabel, chunk.status);
  const taskTitleText = MULTI_AGENT_UI_CONFIG.formatters.subTaskTitle(chunk.taskTitle);
  const taskTitle = taskTitleText ? escapeHtml(taskTitleText) : "";
  const body = escapeHtml(String(
    chunk.summary
    || chunk.content
    || (chunk.type === "multi_agent_status" ? MULTI_AGENT_UI_CONFIG.content.multiAgentStatus : "")
    || chunk.error
    || chunk.message
    || ""
  ));

  return `
<div style="margin:8px 0;padding:10px 12px;border-left:4px solid ${theme.border};background:${theme.bg};border-radius:0px;">
  <div style="font-size:12px;font-weight:700;color:${theme.title};margin-bottom:4px;">${theme.label}</div>
  <div style="font-size:13px;font-weight:600;color:#1f2937;margin-bottom:${body || taskTitle ? "6px" : "0"};">${title}</div>
  ${taskTitle ? `<div style="font-size:12px;line-height:1.5;color:#4b5563;white-space:pre-wrap;margin-bottom:${body ? "6px" : "0"};">${taskTitle}</div>` : ""}
  ${body ? `<div style="font-size:12px;line-height:1.6;color:#374151;white-space:pre-wrap;">${body}</div>` : ""}
</div>`;
}
