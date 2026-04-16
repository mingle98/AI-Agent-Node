// ========== 能力路由：按用户问题动态激活 Tool/Skill ==========

function normalizeText(input) {
  if (typeof input === "string") return input;
  if (input && typeof input === "object") {
    if (typeof input.text === "string") return input.text;
    return JSON.stringify(input);
  }
  return String(input || "");
}

function buildKeywordRegex(words = []) {
  const filtered = words.filter(Boolean).map((w) => String(w).trim()).filter((w) => w.length >= 2);
  if (filtered.length === 0) return null;
  return new RegExp(filtered.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|"), "i");
}

function matchDefinition(def, text) {
  const candidates = [
    def.name,
    def.description,
    def.functionality,
    def.example,
    ...(def.params || []).flatMap((p) => [p.name, p.example, ...(p.options || [])]),
  ].filter(Boolean);

  const regex = buildKeywordRegex(candidates);
  if (!regex) return false;
  return regex.test(text);
}

const DOMAIN_PATTERNS = [
  {
    test: /(流程图|时序图|类图|状态图|架构图|泳道图|甘特图|思维导图|脑图|ER图|实体关系图|mermaid|diagram|graph|图示|示意图|关系图|画图|画个图|梳理流程|流程梳理)/i,
    tools: ["render_mermaid", "analyze_chart"],
    skills: ["mermaid_diagram"],
  },
  {
    test: /(图表|可视化|走势|趋势|echarts|柱状图|折线图|饼图|散点图|雷达图|面积图|仪表盘|热力图|k线|数据看板|dashboard|bi|kpi|同比|环比|房价|统计图)/i,
    tools: ["analyze_chart"],
    skills: ["ai_agent_echart"],
  },
  {
    test: /(今日热点|热点新闻|今日新闻|新闻热点|热搜|头条|新闻资讯|今日要闻|时事新闻|实时新闻|最新新闻|突发新闻|热点有什么|新闻速览|新闻摘要)/i,
    tools: ["daily_news"],
    skills: [],
  },
  {
    test: /(报错|异常|debug|调试|故障|排查|修复|错误|报bug|bug|崩溃|卡死|traceback|stack\s*trace|堆栈|报异常)/i,
    tools: ["analyze_code"],
    skills: ["debug_assistant", "code_review"],
  },
  {
    test: /(review|code\s*review|代码审查|代码走查|代码质量|优化建议|性能问题|安全问题|重构建议|最佳实践|可维护性|技术债)/i,
    tools: ["analyze_code"],
    skills: ["code_review"],
  },
  {
    test: /(excel|xlsx|xls|表格|工作表|电子表格|单元格|公式|函数|透视表|数据透视|vlookup|xlookup|sumif|数据清洗)/i,
    tools: ["excel_read", "excel_write", "excel_append"],
    skills: ["excel_helper"],
  },
  {
    test: /(word|docx|doc|文档|文字稿|报告文档|排版|正文)/i,
    tools: ["word_read", "word_read_html", "word_write_docx"],
    skills: [],
  },
  {
    test: /(ppt|pptx|powerpoint|幻灯片|演示文稿|演示稿|课件|投影片|发布会材料|路演材料|汇报材料)/i,
    tools: ["ppt_read", "ppt_write"],
    skills: [],
  },
  {
    test: /(pdf|合并pdf|导出pdf|pdf合并|pdf导出|转pdf|生成pdf)/i,
    tools: ["pdf_read", "pdf_merge", "pdf_write"],
    skills: [],
  },
  {
    test: /(csv|json|jsonl|逗号分隔|结构化数据)/i,
    tools: ["csv_read", "csv_write", "json_read", "json_write"],
    skills: [],
  },
  {
    test: /(压缩|解压|zip|打包|归档|压缩包|解包|解压缩)/i,
    tools: ["zip_compress", "zip_extract", "zip_info", "zip_list"],
    skills: [],
  },
  {
    test: /(图片|image|webp|png|jpg|jpeg|gif|avif|heic|bmp|svg|压缩图片|图片压缩|改尺寸|缩放图片|图片格式)/i,
    tools: ["image_info", "image_compress", "image_compress_batch", "svg_write"],
    skills: [],
  },
  {
    test: /(邮件|邮箱|发送|发信|mail|smtp|定时|schedule|通知|提醒|群发|定时任务|延时发送|邮件模板)/i,
    tools: ["email_send", "email_template", "email_verify", "schedule_task", "schedule_list", "schedule_cancel"],
    skills: ["email_sender", "email_writer"],
  },
  {
    test: /(文件|目录|文件夹|workspace|读取文件|读文件|写入文件|写文件|重命名|删除文件|复制文件|移动文件|列目录|路径|搜索文件内容|内容搜索|全文搜索|关键词搜索|查找文本|搜索文本|file\s*list|file\s*read|ls|cat)/i,
    tools: ["file_list", "file_read", "file_write", "file_delete", "file_mkdir", "file_move", "file_copy", "file_info", "file_search", "file_content_search", "file_quota"],
    skills: [],
  },
  {
    test: /(组件|控件|SuspendedBallChat|AISuspendedBallChat|ChatPanel|欢迎界面|欢迎语|开场白|流式|sse|回调|props|参数配置|组件配置|前端组件|接入组件|聊天组件|悬浮球|面板配置|样式配置|AI组件|ai组件|聊天组件)/i,
    tools: ["search_knowledge"],
    skills: ["component_consulting"],
  },
  {
    test: /(教学|学习|讲解|教程|入门|原理|是什么|怎么用|如何使用|架构|概念|对比|区别|ai\s*agent|智能体)/i,
    tools: ["search_knowledge"],
    skills: ["ai_agent_teaching", "component_consulting", "code_explanation"],
  },
  {
    test: /(分析数据|统计|转化率|加权|脚本|python|pandas|numpy|matplotlib|回归分析|预测|建模|批处理|自动化脚本|数据处理|数据清洗)/i,
    tools: ["exec_code", "script_generator"],
    skills: ["python_executor"],
  },
];

export function selectActiveCapabilities({
  userInput,
  toolDefinitions = [],
  skillDefinitions = [],
  alwaysOnTools = ["search_knowledge", "analyze_code", "exec_code"],
  alwaysOnSkills = [],
  maxTools = 14,
  maxSkills = 8,
} = {}) {
  const text = normalizeText(userInput);

  const toolNameSet = new Set(alwaysOnTools.filter(Boolean));
  const skillNameSet = new Set(alwaysOnSkills.filter(Boolean));

  // 1) 业务规则优先
  for (const rule of DOMAIN_PATTERNS) {
    if (!rule.test.test(text)) continue;
    for (const t of rule.tools || []) toolNameSet.add(t);
    for (const s of rule.skills || []) skillNameSet.add(s);
  }

  // 2) 元数据匹配补充（便于后续新增能力自动被召回）
  for (const def of toolDefinitions) {
    if (matchDefinition(def, text)) toolNameSet.add(def.name);
  }
  for (const def of skillDefinitions) {
    if (matchDefinition(def, text)) skillNameSet.add(def.name);
  }

  const knownToolNames = new Set(toolDefinitions.map((d) => d.name));
  const knownSkillNames = new Set(skillDefinitions.map((d) => d.name));

  const toolNames = [...toolNameSet].filter((n) => knownToolNames.has(n)).slice(0, maxTools);
  const skillNames = [...skillNameSet].filter((n) => knownSkillNames.has(n)).slice(0, maxSkills);

  // 兜底：至少保证最小可用面
  if (toolNames.length === 0) {
    toolNames.push(...toolDefinitions.slice(0, Math.min(6, toolDefinitions.length)).map((d) => d.name));
  }

  return {
    toolNames,
    skillNames,
    capabilityNames: [...toolNames, ...skillNames],
  };
}

export function expandCapabilitiesToAll(toolDefinitions = [], skillDefinitions = []) {
  const toolNames = toolDefinitions.map((d) => d.name);
  const skillNames = skillDefinitions.map((d) => d.name);
  return {
    toolNames,
    skillNames,
    capabilityNames: [...toolNames, ...skillNames],
  };
}
