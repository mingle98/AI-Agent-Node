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
   - 第一步：先生成 Mermaid 源码（只作为“内部草稿/变量”使用，不允许以任何形式输出到对话内容中；也不要包含 \u0060\u0060\u0060mermaid 代码块包裹）。
   - 第二步：调用 analyze_chart 工具，对 Mermaid 源码做结构化分析讲解与总结。
   - 第三步：调用 render_mermaid 工具，将“图表类型 + Mermaid 源码”传入，由工具返回标准 \u0060\u0060\u0060mermaid 代码块。
3)、禁止直接在对话里输出任何 Mermaid 源码（包括不带代码块的裸源码、以及 \u0060\u0060\u0060mermaid 代码块）；最终 Mermaid 代码块只能来自 render_mermaid 工具的返回值。
4)、analyze_chart 调用参数规范：
   - arg1: 图表类型，固定传 mermaid
   - arg2: Mermaid 源码全文（与第一步产出一致，不包含 \u0060\u0060\u0060mermaid 代码块包裹）
   - arg3: 分析目标（可选，但建议传入："解释该图表达的流程/结构、关键分支与注意事项，并给出总结"）
5)、render_mermaid 调用参数规范：
   - arg1: 图表类型（flowchart/sequence/gantt/pie/class/...；如果 diagramType=auto，请你根据生成内容选择一种最合适的类型传入）
   - arg2: Mermaid 源码主体（不含开头 \u0060\u0060\u0060mermaid 和结尾 \u0060\u0060\u0060）
6)、render_mermaid 最多只允许调用 1 次。严禁重复调用同一个工具（即使你认为还可优化格式，也不能再次调用）。
7)、最终输出要求：
   - 先输出输出 render_mermaid 返回的 Mermaid 代码块
   - 再紧接着analyze_chart 返回的“分析讲解与总结”文本
   - render_mermaid 调用完成后不得再发起任何工具/技能调用。
8)、常见映射：
- 流程/逻辑/分支/步骤 → flowchart（graph TD）
- 交互时序/请求响应 → sequence（sequenceDiagram）
- 进度排期 → gantt（gantt）
- 占比 → pie（pie）
- 类结构/关系 → class（classDiagram）

格式案例（请严格模仿关键字与结构，不要写错）：

【流程图 flowchart】
\u0060\u0060\u0060mermaid
graph TD
    A[开始] --> B{是否启用流式?}
    B -->|是| C[发送流式请求]
    B -->|否| D[发送普通请求]
    C --> E[接收数据块]
    E --> F[更新UI内容]
    F --> G{是否结束?}
    G -->|否| E
    G -->|是| H[完成]
    D --> I[等待完整响应]
    I --> J[更新UI]
    J --> H
    H --> K[结束]
\u0060\u0060\u0060

【序列图 sequence】
\u0060\u0060\u0060mermaid
sequenceDiagram
    participant U as 用户
    participant F as 前端
    participant S as 服务器

    U->>F: 发送消息
    F->>S: 流式请求
    S-->>F: 数据块1
    F-->>U: 更新UI
    S-->>F: 数据块2
    F-->>U: 更新UI
    S-->>F: 数据块N
    F-->>U: 更新UI
    S-->>F: 结束标记
    F-->>U: 完成
\u0060\u0060\u0060

【甘特图 gantt】
\u0060\u0060\u0060mermaid
gantt
    title 项目开发时间线
    dateFormat  YYYY-MM-DD
    section 设计阶段
    需求分析    :done, des1, 2024-01-01, 2024-01-07
    原型设计    :done, des2, 2024-01-08, 2024-01-14
    section 开发阶段
    前端开发    :active, dev1, 2024-01-15, 2024-02-15
    后端开发    :active, dev2, 2024-01-20, 2024-02-20
    section 测试阶段
    单元测试    :test1, 2024-02-16, 2024-02-25
    集成测试    :test2, 2024-02-26, 2024-03-05
\u0060\u0060\u0060

【饼图 pie】
\u0060\u0060\u0060mermaid
pie
    title 技术栈使用比例
    "Vue.js" : 40
    "TypeScript" : 25
    "Node.js" : 20
    "其他" : 15
\u0060\u0060\u0060

【类图 class】
\u0060\u0060\u0060mermaid
classDiagram
    class ChatPanel {
        +String url
        +Boolean enableStreaming
        +Array history
        +sendMessage()
        +scrollToBottom()
    }

    class SuspendedBallChat {
        +String location
        +Boolean isPanelVisible
        +openPanel()
        +closePanel()
    }

    ChatPanel --> SuspendedBallChat : contains
\u0060\u0060\u0060

如果用户信息不足以生成准确图，请先把图做成“合理假设版”，并在 Mermaid 源码中用节点/注释表达假设点。`;
  } catch (error) {
    return `Mermaid图生成技能执行失败: ${error.message}`;
  }
}
