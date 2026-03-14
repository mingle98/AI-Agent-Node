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
2)、最终只输出 Mermaid 代码块，不要输出任何额外解释/说明文字，以便前端直接渲染。
3)、输出格式必须是：\n\n\u0060\u0060\u0060mermaid\n...\n\u0060\u0060\u0060\n\n4)、常见映射：
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

如果用户信息不足以生成准确图，请先在同一次回复中把图做成“合理假设版”（仍然只输出 Mermaid 代码块），并在图中用节点/注释表达假设点（但不要在代码块外写解释）。`;
  } catch (error) {
    return `Mermaid图生成技能执行失败: ${error.message}`;
  }
}
