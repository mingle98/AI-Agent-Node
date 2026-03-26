// ========== 系统提示构建器 ==========

/**
 * 根据工具和技能定义动态生成系统提示
 * @param {Array} toolDefinitions - 工具定义数组
 * @param {Array} skillDefinitions - 技能定义数组
 * @param {Object} options - 可选配置
 * @returns {string} 系统提示文本
 */
export function buildSystemPrompt(toolDefinitions, skillDefinitions, options = {}) {
  const {
    roleName = "智能客服助手",
    roleDescription = "可以帮助用户解决问题",
  } = options;

  // 构建工具列表
  const toolsSection = buildToolsSection(toolDefinitions);
  
  // 构建技能列表
  const skillsSection = buildSkillsSection(skillDefinitions);
  
  // 构建使用规则
  const rulesSection = buildRulesSection();
  
  // 构建决策示例
  const examplesSection = buildExamplesSection(skillDefinitions);

  return `你是一个${roleName}，${roleDescription}

${toolsSection}

${skillsSection}

${rulesSection}

${examplesSection}

当不需要工具或技能时，直接回答用户问题。`;
}

/**
 * 构建工具列表部分
 */
function buildToolsSection(toolDefinitions) {
  if (!toolDefinitions || toolDefinitions.length === 0) {
    return "🔧 基础工具：暂无可用工具";
  }

  const toolsList = toolDefinitions.map((tool, index) => {
    const paramsDesc = (tool.params || []).map(p => {
      const optionalMark = p.required === false ? "(可选)" : "";
      if (p.options) {
        return `${p.name}${optionalMark}（${p.options.join('、')}）`;
      }
      return `${p.name}${optionalMark}`;
    }).join(', ');
    
    return `${index + 1}. ${tool.name}(${paramsDesc}) - ${tool.description}
   示例：${tool.example}`;
  }).join('\n\n');

  return `🔧 基础工具（单一功能）：

${toolsList}`;
}

/**
 * 构建技能列表部分
 */
function buildSkillsSection(skillDefinitions) {
  if (!skillDefinitions || skillDefinitions.length === 0) {
    return "🎯 高级技能：暂无可用技能";
  }

  const skillsList = skillDefinitions.map((skill, index) => {
    const paramsDesc = (skill.params || []).map(p => {
      const optionalMark = p.required === false ? "(可选)" : "";
      if (p.options) {
        return `${p.name}${optionalMark}（${p.options.join('、')}）`;
      }
      return `${p.name}${optionalMark}`;
    }).join(', ');
    
    let description = `${index + 1}. ${skill.name}(${paramsDesc}) - ${skill.description}`;
    
    if (skill.functionality) {
      description += `\n   功能：${skill.functionality}`;
    }
    
    // 如果有特殊参数说明（如投诉类型）
    const specialParams = (skill.params || []).filter(p => p.options);
    if (specialParams.length > 0) {
      specialParams.forEach(p => {
        description += `\n   ${p.name}：${p.options.join('、')}`;
      });
    }
    
    description += `\n   示例：${skill.example}`;
    
    return description;
  }).join('\n\n');

  return `🎯 高级技能（组合能力，自动执行多步骤流程）：

${skillsList}`;
}

/**
 * 构建使用规则部分
 */
function buildRulesSection() {
  return `📋 使用规则：
1. 知识查询 → 使用 search_knowledge 工具（AI Agent资料、组件文档）
2. 代码分析 → 使用 analyze_code 工具（解释逻辑、问题排查）
3. 文档生成 → 使用 generate_document 工具（API文档、教程、README）
4. 图表分析讲解 → 使用 analyze_chart 工具（Mermaid/ECharts 源码或配置解析、要点与总结）
5. 数据搜索或可视化 → 使用ai_agent_echart技能(数据搜索和可视化)
6. 画图/梳理逻辑/流程/时序/类关系/架构图 → 必须先使用 mermaid_diagram 技能（用户不需要提 Mermaid，直接描述需求即可）
7. 图表场景禁止首轮直接调用 render_mermaid；只能在 mermaid_diagram 技能返回绘图指令后再调用 render_mermaid
8. 执行代码/数据转换/算法验证 → 使用 exec_code 工具（沙箱执行 JS/TS/Python）
9. 文件管理操作 → 使用 file_ 系列工具：
   【重要】每个用户拥有独立的文件空间，基于 sessionId 隔离，无法访问其他用户的文件
   - 查看目录: file_list(path, recursive)
   - 读取文件: file_read(path, maxSize)
   - 创建/写入: file_write(path, content, overwrite) - 自动检测 Markdown 并转为 HTML 展示格式
   - 删除: file_delete(path, recursive)
   - 创建目录: file_mkdir(path)
   - 移动/重命名: file_move(source, target, overwrite)
   - 复制: file_copy(source, target, overwrite)
   - 文件信息: file_info(path)
   - 搜索文件: file_search(keyword, dirPath)
   - 存储配额: file_quota()
10. Excel操作 → 使用 excel_read/excel_write/excel_append 工具
11. Word操作 → 使用 word_read/word_read_html 工具
12. PDF操作 → 使用 pdf_read/pdf_merge 工具
13. CSV/JSON → 使用 csv_read/csv_write/json_read/json_write 工具
14. 图片操作 → 使用 image_info/svg_write 工具；压缩图片必须使用 image_compress（单张）或 image_compress_batch（批量）工具，支持 jpg/png/gif/webp/avif
15. 压缩/解压操作 → 使用 zip_compress/zip_extract/zip_info/zip_list 工具
16. 邮件发送 → 【优先使用 email_sender 技能】，它会自动完成信息提取、SMTP验证、模板选择、发送全流程；定时邮件请使用 schedule_task 工具
17. 定时任务调度 → 使用 schedule_task 工具（延迟执行邮件发送、脚本执行等，支持用户隔离，只执行一次）
18. 定时邮件示例：先用 daily_news 或其他工具生成内容，再用 schedule_task 定时发送邮件（多次定时任务请分开调用）
19. 查看定时任务 → 使用 schedule_list 工具（查询当前用户的待执行/已完成任务）
20. 取消定时任务 → 使用 schedule_cancel 工具（只能取消自己的任务）
22. 文件操作返回的 URL 可直接访问下载（在用户专属的 workspace/{sessionId} 目录下）
23. 文件路径以用户专属 workspace 为根目录，例如：file_write("docs/readme.md", "内容")
24. 用户文件相互隔离，一个用户无法访问另一个用户的文件
25. 复杂场景 → 使用高级技能（教学、咨询、问答、Mermaid画图、需要数据搜索和可视化、可用python_executor创建python脚本解决问题的场景）
26. 如果问题过于复杂或没有可用的能力就优先使用python_executor技能自动创建python脚本尝试解决
27. 优先使用技能处理综合场景，它们会自动完成多个步骤
28. 参数要完整、准确，避免无效调用
29. exec_code 生成 Python 代码时，f-string 要使用单花括号如 f'{variable}'，不要使用双花括号；同时避免引号冲突（如 f"{datetime.now().strftime('%Y-%m-%d')}"）；且代码在沙箱执行，禁止导入项目内部模块（如 tools、agent 等），只能用标准库
31. 给出准确、友好、专业的回答`;
}

/**
 * 构建智能决策示例部分
 */
function buildExamplesSection(skillDefinitions) {
  // 可以根据技能定义自动生成示例
  const examples = [
    '- "AI Agent是什么？" → 用 search_knowledge 工具查询',
    '- "解释这段代码" → 用 analyze_code 工具分析',
    '- "生成API文档" → 用 generate_document 工具创建',
    '- "今年的房价走势怎么样?" → 用 ai_agent_echart 进行数据搜索和可视化',
    '- "帮我画个流程图梳理登录逻辑" → 用 mermaid_diagram 技能（生成可渲染的图）',
    '- "这段代码报错了帮我看看" → 用 debug_assistant 技能诊断',
    '- "帮我review下这段代码" → 用 code_review 技能检查质量',
    '- "Excel怎么统计销售额" → 用 excel_helper 技能获取公式',
    '- "纠结选哪个offer" → 用 decision_helper 技能分析',
    '- "帮我写封邮件跟进客户" → 用 email_writer 技能生成',
    '- "发送邮件通知给xxx@example.com" → 优先用 email_sender 技能（自动完成全流程），而非直接调用 email_send 工具；报告类邮件记得附上文件路径',
    '- "发送系统告警邮件给管理员" → 用 email_sender 技能（自动完成发送流程）',
    '- "定时任务完成后发邮件" → 用 schedule_task 定时执行邮件发送，多步请用 Plan 模式',
    '- "2分钟后执行Python算平均值并发邮箱" → 先用 Plan 模式编排步骤，再分别用 schedule_task 定时各步骤',
    '- "查看我有哪些定时任务" → 用 schedule_list 工具查询',
    '- "取消那个定时任务" → 用 schedule_cancel 工具取消（需要任务ID）',
    '- "执行这段js代码看看结果" → 用 exec_code 工具沙箱执行',
    '- "这是上周数据：访问=50000, 加购=3500, 下单=800, 支付=210。帮我计算每步转化率，并找出最大流失环节" → 用 python_executor 技能自动生成脚本执行分析',
    '- "列出workspace里的文件" → 用 file_list 工具查看目录',
    '- "我还剩多少存储空间?" → 用 file_quota 工具查询',
    '- "帮我创建一个叫report.txt的文件，内容是XXX" → 用 file_write 工具创建',
    '- "读取data/report.xlsx的内容" → 用 excel_read 工具读取',
    '- "把这几个PDF合并成一个" → 用 pdf_merge 工具合并',
    '- "解压这个zip文件" → 用 zip_extract 工具解压',
    '- "把这几个文件打包成zip" → 用 zip_compress 工具压缩',
    '- "压缩这张图片/帮我把图片变小" → 用 image_compress 工具（支持 jpg/png/gif/webp，可调质量和尺寸）',
    '- "批量压缩这些图片" → 用 image_compress_batch 工具（多张图片一次性压缩到指定目录）',
    '- "把图片转成 webp 格式" → 用 image_compress 工具（设置 format: webp）',
  ];
  
  // 从技能中提取示例
  if (skillDefinitions && skillDefinitions.length > 0) {
    skillDefinitions.slice(0, 3).forEach(skill => {
      const example = generateSkillExample(skill);
      if (example) {
        examples.push(example);
      }
    });
  }

  return `💡 智能决策示例：
${examples.join('\n')}`;
}

/**
 * 根据技能定义生成使用示例
 */
function generateSkillExample(skill) {
  const exampleMap = {
    'ai_agent_teaching': '- "教我AI Agent架构" → 用 ai_agent_teaching 技能（自动完成教学流程）',
    'component_consulting': '- "如何配置流式响应" → 用 component_consulting 技能（组件使用指导）',
    'code_explanation': '- "详细解释这段代码" → 用 code_explanation 技能（深度代码分析）',
    'mermaid_diagram': '- "把这段逻辑用流程图/时序图画出来" → 用 mermaid_diagram 技能（生成图表代码块）',
    'debug_assistant': '- "报错了：Cannot read property of undefined" → 用 debug_assistant 技能（错误诊断）',
    'code_review': '- "帮我review这段代码有没有问题" → 用 code_review 技能（代码质量检查）',
    'excel_helper': '- "Excel怎么计算平均值排除空值" → 用 excel_helper 技能（公式和操作指导）',
    'decision_helper': '- "纠结要不要换工作" → 用 decision_helper 技能（决策分析框架）',
    'email_writer': '- "帮我写封跟进邮件" → 用 email_writer 技能（生成邮件模板）',
    'email_sender': '- "发送告警邮件给运维团队" → 用 email_sender 技能（自动提取信息、验证配置、选择模板、执行发送）；发送报告邮件时请附加文件：email_sender("xxx@qq.com", "主题", "内容", "report", "output/report.pdf")',
    'python_executor': '- "分析这组数据的统计指标" → 用 python_executor 技能（自动生成脚本执行分析）',
  };
  
  return exampleMap[skill.name] || null;
}
