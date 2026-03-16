export async function skillMermaidDiagram(request, diagramType = "auto") {
  try {
    console.log(`🧩 Mermaid图生成: ${diagramType}`);

    const supportedTypes = [
      "auto",
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

    if (!supportedTypes.includes(diagramType)) {
      return `Mermaid图表类型不支持: ${diagramType}\n\n支持类型: ${supportedTypes.join(", ")}`;
    }

    return `【Mermaid图生成技能流程】

用户需求：${request}
期望图类型：${diagramType}

生成要求（必须严格遵守）：
1)、你需要根据用户需求，生成一个 Mermaid 图（优先使用最能表达逻辑的图类型；如果 diagramType=auto 则你自行选择）。
2)、你必须使用“三段式流程”：
   - 第一步：先生成 Mermaid 源码（只作为“内部草稿/变量”使用，不允许以任何形式输出到对话内容中；也不要包含任何 Mermaid 代码块包裹）。
   - 第二步：调用 analyze_chart 工具，对 Mermaid 源码做结构化分析讲解与总结。
   - 第三步：调用 render_mermaid 工具，将“图表类型 + Mermaid 源码”传入，由工具返回标准 Mermaid 代码块。
3)、禁止直接在对话里输出任何 Mermaid 源码（包括不带代码块的裸源码、以及任何 Mermaid 代码块）；最终 Mermaid 代码块只能来自 render_mermaid 工具的返回值。
4)、analyze_chart 调用参数规范：
   - arg1: 图表类型，固定传 mermaid
   - arg2: Mermaid 源码全文（与第一步产出一致，不包含任何 Mermaid 代码块包裹）
   - arg3: 分析目标（可选，但建议传入："解释该图表达的流程/结构、关键分支与注意事项，并给出总结"）
5)、render_mermaid 调用参数规范：
   - arg1: 图表类型（flowchart/sequence/gantt/pie/class/...；如果 diagramType=auto，请你根据生成内容选择一种最合适的类型传入）
   - arg2: Mermaid 源码主体（不含 Mermaid 代码块包裹符号）
6)、render_mermaid 最多只允许调用 1 次。严禁重复调用同一个工具（即使你认为还可优化格式，也不能再次调用）。
7)、最终输出要求：
   - 先输出 render_mermaid 返回的 Mermaid 代码块
   - 再紧接着输出 analyze_chart 返回的“分析讲解与总结”文本
   - render_mermaid 调用完成后不得再发起任何工具/技能调用。

执行清单（用于自检，不得省略任一步）：
A. 先在内部生成 Mermaid 源码变量（不要输出）
B. 调用 analyze_chart(mermaid, 源码全文, "解释该图表达的流程/结构、关键分支与注意事项，并给出总结")
C. 调用 render_mermaid(图类型, 源码主体) —— 只调用一次
D. 最终回复必须严格按顺序：先输出 render_mermaid 的代码块，再输出分析文本；如果未输出代码块则视为任务失败

常见映射：
- 流程/逻辑/分支/步骤 → flowchart
- 交互时序/请求响应 → sequence
- 进度排期 → gantt
- 占比 → pie
- 类结构/关系 → class

语法参考示例（仅用于生成时校验语法；不得直接输出；不得包含任何代码块包裹符号）：

【flowchart 示例源码】
graph TD
  A[开始] --> B{是否通过?}
  B -->|是| C[下一步]
  B -->|否| D[结束]

【sequence 示例源码】
sequenceDiagram
  participant U as User
  participant S as Server
  U->>S: Request
  S-->>U: Response

【gantt 示例源码】
gantt
  title 项目计划
  dateFormat YYYY-MM-DD
  section 阶段
  需求分析 :done, a1, 2026-01-01, 2026-01-07
  开发实现 :active, a2, 2026-01-08, 2026-01-20

【pie 示例源码】
pie
  title 占比
  "A" : 60
  "B" : 40

【class 示例源码】
classDiagram
  class A {
    +String name
  }
  class B
  A --> B

注意：不要在本技能返回内容中夹带任何 Mermaid 源码示例（避免误输出）。如果用户信息不足以生成准确图，请先做“合理假设版”，并在 Mermaid 源码中用节点/注释表达假设点。`;
  } catch (error) {
    return `Mermaid图生成技能执行失败: ${error.message}`;
  }
}
