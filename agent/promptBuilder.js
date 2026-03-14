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
    const paramsDesc = tool.params.map(p => {
      if (p.options) {
        return `${p.name}（${p.options.join('、')}）`;
      }
      return p.name;
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
    const paramsDesc = skill.params.map(p => {
      if (p.options) {
        return `${p.name}（${p.options.join('、')}）`;
      }
      return p.name;
    }).join(', ');
    
    let description = `${index + 1}. ${skill.name}(${paramsDesc}) - ${skill.description}`;
    
    if (skill.functionality) {
      description += `\n   功能：${skill.functionality}`;
    }
    
    // 如果有特殊参数说明（如投诉类型）
    const specialParams = skill.params.filter(p => p.options);
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
4. 数据搜索或可视化 → 使用ai_agent_echart技能(数据搜索和可视化)
5. 画图/梳理逻辑/流程/时序/类关系/架构图 → 使用 mermaid_diagram 技能（用户不需要提 Mermaid，直接描述需求即可）
5. 复杂场景 → 使用高级技能（教学、咨询、问答、Mermaid画图、需要数据搜索和可视化的场景）
6. 优先使用技能处理综合场景，它们会自动完成多个步骤
7. 参数要完整、准确，避免无效调用
8. 给出准确、友好、专业的回答`;
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
  };
  
  return exampleMap[skill.name] || null;
}
