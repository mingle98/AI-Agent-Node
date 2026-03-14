export const MERMAID_DIAGRAM_TYPES = [
  "flowchart",
  "sequence",
  "gantt",
  "pie",
  "class",
  "state",
  "er",
  "journey",
  "mindmap",
  "timeline",
  "gitgraph",
];

export function renderMermaid(diagramOrType, maybeBody) {
  const isTypeAndBody = typeof maybeBody === "string" && typeof diagramOrType === "string";
  let mermaidSource;

  if (isTypeAndBody) {
    const type = diagramOrType.trim();
    const body = maybeBody.trim();

    if (type && !MERMAID_DIAGRAM_TYPES.includes(type)) {
      return `Mermaid图表类型不支持: ${type}\n\n支持类型: ${MERMAID_DIAGRAM_TYPES.join(", ")}`;
    }

    const headerByType = {
      flowchart: "graph TD",
      sequence: "sequenceDiagram",
      gantt: "gantt",
      pie: "pie",
      class: "classDiagram",
      state: "stateDiagram-v2",
      er: "erDiagram",
      journey: "journey",
      mindmap: "mindmap",
      timeline: "timeline",
      gitgraph: "gitGraph",
    };

    const header = headerByType[type] ?? "";
    mermaidSource = header ? `${header}\n${body}` : body;
  } else {
    mermaidSource = String(diagramOrType ?? "").trim();
  }

  if (!mermaidSource) return "Mermaid源码不能为空";

  const normalized = mermaidSource
    .replace(/^```mermaid\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();

  return `\n\n\u0060\u0060\u0060mermaid\n${normalized}\n\u0060\u0060\u0060\n\n`;
}
