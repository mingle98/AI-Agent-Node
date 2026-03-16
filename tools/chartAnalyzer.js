export function analyzeChart(chartType, source, userGoal) {
  const type = String(chartType || "").trim().toLowerCase();
  const raw = typeof source === "string" ? source : JSON.stringify(source ?? "", null, 2);
  const goal = String(userGoal || "").trim();

  if (!type) {
    return "图表分析失败：chartType 不能为空";
  }

  if (!raw.trim()) {
    return "图表分析失败：source 不能为空";
  }

  if (type === "mermaid") {
    return analyzeMermaid(raw, goal);
  }

  if (type === "echarts" || type === "echart") {
    return analyzeEcharts(raw, goal);
  }

  return `暂不支持的图表类型: ${type}（支持: mermaid/echarts）`;
}

function analyzeMermaid(src, goal) {
  const normalized = String(src)
    .replace(/^```mermaid\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();

  const firstLine = normalized.split("\n").find((l) => l.trim() && !l.trim().startsWith("%%")) || "";
  const diagramKind = detectMermaidKind(firstLine);

  const lines = normalized.split("\n").map((l) => l.trim()).filter(Boolean);
  const stats = {
    totalLines: lines.length,
    comments: lines.filter((l) => l.startsWith("%%")).length,
    arrows: (normalized.match(/-->|-\\.->|-\\.\\.->|==>|->>|-->>/g) || []).length,
  };

  const keyFindings = [];
  if (!diagramKind) {
    keyFindings.push("未能从首行识别 Mermaid 图类型（建议首行使用 graph TD / sequenceDiagram / classDiagram 等）。");
  } else {
    keyFindings.push(`图类型识别为：${diagramKind}`);
  }

  const issues = [];
  if (stats.totalLines > 200) {
    issues.push("图表行数较多，建议按模块拆分或用 subgraph/分层组织，提升可读性。");
  }
  if (diagramKind === "flowchart" && stats.arrows === 0) {
    issues.push("疑似流程图但未检测到连线箭头（-->/-.-> 等），可能缺少关系表达。");
  }

  const structured = mermaidStructure(normalized, diagramKind);

  const goalLine = goal ? `- **分析目标**
${goal}
` : "";

  return `【图表分析（Mermaid）】\n\n- **图类型**\n${diagramKind || "unknown"}\n\n- **结构概览**\n${structured.overview}\n\n- **关键元素**\n${structured.keyElements}\n\n${goalLine}- **可读性与风险点**\n${issues.length ? issues.map((x) => `- ${x}`).join("\n") : "- 暂未发现明显结构性问题"}\n\n- **总结**\n${structured.summary}\n`;
}

function detectMermaidKind(firstLine) {
  const t = String(firstLine || "").trim();
  if (/^graph\s+/i.test(t) || /^flowchart\s+/i.test(t)) return "flowchart";
  if (/^sequencediagram\b/i.test(t)) return "sequence";
  if (/^gantt\b/i.test(t)) return "gantt";
  if (/^pie\b/i.test(t)) return "pie";
  if (/^classdiagram\b/i.test(t)) return "class";
  if (/^statediagram/i.test(t)) return "state";
  if (/^erdiagram\b/i.test(t)) return "er";
  if (/^journey\b/i.test(t)) return "journey";
  if (/^mindmap\b/i.test(t)) return "mindmap";
  if (/^timeline\b/i.test(t)) return "timeline";
  if (/^gitgraph\b/i.test(t) || /^gitgraph\b/i.test(t.replace(/\s/g, ""))) return "gitgraph";
  return "";
}

function mermaidStructure(normalized, diagramKind) {
  const lines = normalized.split("\n");

  if (diagramKind === "sequence") {
    const participants = [];
    const messages = [];
    for (const line of lines) {
      const trimmed = line.trim();
      const p = trimmed.match(/^participant\s+([\w-]+)(?:\s+as\s+(.+))?$/i);
      if (p) {
        participants.push({ id: p[1], label: (p[2] || p[1]).trim() });
      }
      const m = trimmed.match(/^([\w-]+)\s*(-{1,2}>>?)\s*([\w-]+)\s*:\s*(.+)$/);
      if (m) {
        messages.push({ from: m[1], to: m[3], text: m[4].trim() });
      }
    }

    const overview = participants.length
      ? `- 参与者数量：${participants.length}\n- 消息条数：${messages.length}`
      : `- 消息条数：${messages.length}`;

    const keyElements = participants.length
      ? participants.map((p) => `- ${p.id}${p.label !== p.id ? `（${p.label}）` : ""}`).join("\n")
      : "- 未显式声明 participant（不影响渲染，但不利于阅读）";

    const summary = messages.length
      ? `该时序图描述了从 ${messages[0].from} 到 ${messages[messages.length - 1].to} 的一系列交互，重点在于消息顺序与责任边界。`
      : "该时序图尚未包含可识别的消息交互。";

    return { overview, keyElements, summary };
  }

  if (diagramKind === "class") {
    const classes = [];
    const relations = [];
    for (const line of lines) {
      const trimmed = line.trim();
      const c = trimmed.match(/^class\s+([\w-]+)/i);
      if (c) classes.push(c[1]);
      if (/-->|<\|--|\*--|o--|--\||\.<\|--|\.<\|\.\./.test(trimmed)) {
        relations.push(trimmed);
      }
    }

    return {
      overview: `- 类数量（粗略）：${new Set(classes).size}\n- 关系声明（粗略）：${relations.length}`,
      keyElements: classes.length ? [...new Set(classes)].map((x) => `- ${x}`).join("\n") : "- 未识别到 class 声明",
      summary: "该类图用于表达领域对象/模块之间的结构关系，建议保证命名清晰并补齐关键关系（继承/组合/依赖）。",
    };
  }

  if (diagramKind === "flowchart") {
    const nodeIdSet = new Set();
    const edges = [];

    for (const line of lines) {
      const trimmed = line.trim();
      const edge = trimmed.match(/^([A-Za-z0-9_]+)\s*(-->|-\.->|-\.\.->|==>)\s*(\|[^|]+\|\s*)?([A-Za-z0-9_]+)/);
      if (edge) {
        nodeIdSet.add(edge[1]);
        nodeIdSet.add(edge[4]);
        edges.push({ from: edge[1], to: edge[4], label: (edge[3] || "").trim() });
      }
    }

    const overview = `- 节点数量（粗略）：${nodeIdSet.size}\n- 连线数量（粗略）：${edges.length}`;
    const keyElements = edges.length
      ? edges.slice(0, 8).map((e) => `- ${e.from} -> ${e.to}${e.label ? ` ${e.label}` : ""}`).join("\n") + (edges.length > 8 ? "\n- ..." : "")
      : "- 未识别到连线关系";
    const summary = "该流程图用于表达步骤/分支与流转路径。建议用一致的命名、对关键分支加条件标签，并避免交叉过多。";

    return { overview, keyElements, summary };
  }

  return {
    overview: "- 已生成 Mermaid 源码，但暂未对该图类型做细分结构解析",
    keyElements: "- 建议检查首行图类型声明是否正确，并确保关键实体/关系在图中都有表达",
    summary: "该图用于表达结构或时间/关系信息。建议补齐必要的标题、关键节点说明与边界条件。",
  };
}

function analyzeEcharts(raw, goal) {
  let option;
  try {
    option = typeof raw === "string" ? JSON.parse(raw) : raw;
  } catch (e) {
    option = null;
  }

  if (!option || typeof option !== "object") {
    return "【图表分析（ECharts）】\n\n- **错误**\n无法解析为有效的 ECharts option JSON";
  }

  const titleText = option?.title?.text || option?.title?.[0]?.text || "";
  const series = Array.isArray(option.series) ? option.series : (option.series ? [option.series] : []);
  const seriesTypes = [...new Set(series.map((s) => s?.type).filter(Boolean))];

  const xAxis = option.xAxis;
  const yAxis = option.yAxis;

  const axisSummary = (axis) => {
    if (!axis) return "";
    const a = Array.isArray(axis) ? axis[0] : axis;
    const t = a?.type ? `type=${a.type}` : "";
    const n = a?.name ? `name=${a.name}` : "";
    return [t, n].filter(Boolean).join(", ");
  };

  const issues = [];
  if (!series.length) issues.push("未发现 series，图表可能无法渲染。");
  if (!xAxis && !yAxis && !seriesTypes.includes("pie")) issues.push("缺少 xAxis/yAxis 配置（非饼图场景可能不完整）。");

  const goalLine = goal ? `- **分析目标**\n${goal}\n\n` : "";

  return `【图表分析（ECharts）】\n\n- **标题**\n${titleText || "(未设置)"}\n\n- **图形类型**\n${seriesTypes.length ? seriesTypes.join(", ") : "(未设置)"}\n\n- **数据系列概览**\n- series 数量：${series.length}\n\n- **坐标轴概览**\n- xAxis：${axisSummary(xAxis) || "(未设置)"}\n- yAxis：${axisSummary(yAxis) || "(未设置)"}\n\n${goalLine}- **可读性与风险点**\n${issues.length ? issues.map((x) => `- ${x}`).join("\n") : "- 暂未发现明显结构性问题"}\n\n- **总结**\n该 option 已具备基础结构。建议补齐标题/单位、明确维度含义，并确保 series 与轴/维度匹配。\n`;
}
