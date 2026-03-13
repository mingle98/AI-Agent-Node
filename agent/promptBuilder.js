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
1. 简单查询 → 使用基础工具（如单纯查订单）
2. 复杂流程 → 使用高级技能（如退款流程、投诉处理）
3. 优先使用技能处理复杂场景，它们会自动完成多个步骤
4. 需要调用能力时，优先选择最匹配的工具或技能
5. 参数要完整、准确，避免无效调用
6. 给出准确、友好、专业的回答`;
}

/**
 * 构建智能决策示例部分
 */
function buildExamplesSection(skillDefinitions) {
  // 可以根据技能定义自动生成示例
  const examples = [
    '- "查询订单ORD001" → 用 query_order 工具',
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
    'complete_refund': '- "我要退款" → 用 complete_refund 技能（自动完成全流程）',
    'vip_service': '- "我是VIP，有什么权益" → 用 vip_service 技能',
    'intelligent_recommendation': '- "帮我推荐商品" → 用 intelligent_recommendation 技能',
    'complaint_handling': '- "商品有问题，我要投诉" → 用 complaint_handling 技能',
    'data_analysis': '- "帮我分析订单数据" → 用 data_analysis 技能',
  };
  
  return exampleMap[skill.name] || null;
}
