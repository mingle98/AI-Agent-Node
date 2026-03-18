// ========== 脚本生成工具（LLM 驱动） ==========

// 脚本生成用的 LLM 实例（由外部注入）
let scriptGeneratorLLM = null;

/**
 * 设置脚本生成用的 LLM
 * @param {Object} llm - LangChain LLM 实例
 */
export function setScriptGeneratorLLM(llm) {
  scriptGeneratorLLM = llm;
}

/**
 * 使用 LLM 生成 Python 脚本
 * @param {string} task - 任务描述
 * @param {string} dataInput - 输入数据
 * @param {string} outputFormat - 期望输出格式（summary, json, csv, chart_data）
 * @param {Function} fallbackGenerator - 降级方案生成器（可选）
 * @returns {Promise<string>} - 生成的 Python 脚本
 */
export async function generatePythonScript(task, dataInput = "", outputFormat = "summary", fallbackGenerator = null) {
  if (!scriptGeneratorLLM) {
    console.log(`⚠️ LLM 未配置，使用降级方案`);
    if (fallbackGenerator) {
      return fallbackGenerator(task, dataInput, outputFormat);
    }
    return generateDefaultFallbackScript(task, dataInput);
  }

  const prompt = buildScriptGenerationPrompt(task, dataInput, outputFormat);
  
  try {
    const response = await scriptGeneratorLLM.invoke([
      { 
        role: "system", 
        content: "你是一个专业的 Python 脚本生成助手。根据用户需求生成简洁、健壮、有注释的 Python 脚本。只输出 Python 代码，不要输出任何解释或 markdown 标记。" 
      },
      { role: "user", content: prompt }
    ]);
    
    let script = response.content || response.text || "";
    
    // 清理可能的 markdown 代码块标记
    script = script.replace(/^```python\s*/i, "").replace(/```\s*$/i, "").trim();
    
    if (!script || script.length === 0) {
      throw new Error("LLM 返回空脚本");
    }
    
    return script;
  } catch (error) {
    console.error(`LLM 脚本生成失败: ${error.message}`);
    // 降级到默认脚本
    if (fallbackGenerator) {
      return fallbackGenerator(task, dataInput, outputFormat);
    }
    return generateDefaultFallbackScript(task, dataInput);
  }
}

/**
 * 使用 LLM 分析执行结果
 * @param {string} task - 原始任务描述
 * @param {string} script - 执行的脚本内容
 * @param {string} output - 脚本输出结果
 * @param {string} outputFormat - 输出格式
 * @param {Function} fallbackAnalyzer - 降级分析器（可选）
 * @returns {Promise<string>} - 分析结果
 */
export async function analyzeScriptResult(task, script, output, outputFormat = "summary", fallbackAnalyzer = null) {
  if (!scriptGeneratorLLM) {
    if (fallbackAnalyzer) {
      return fallbackAnalyzer(task, output, outputFormat);
    }
    return generateDefaultFallbackAnalysis(task, output);
  }

  const analysisPrompt = `你是一位数据分析专家。请根据以下信息给出简洁专业的分析：

【原始任务】
${task}

【执行的脚本】
${script.substring(0, 500)}...

【脚本输出结果】
${output.substring(0, 2000)}

【分析要求】
1. 总结执行是否成功
2. 提取关键数据指标
3. 给出业务/技术层面的解读
4. 如有异常或错误，指出问题
5. 建议下一步可以做什么

请用简洁的 bullet points 格式输出（中文）：`;

  try {
    const response = await scriptGeneratorLLM.invoke([
      { 
        role: "system", 
        content: "你是数据分析专家，擅长从脚本输出中提取关键洞察。" 
      },
      { role: "user", content: analysisPrompt }
    ]);
    
    return response.content || response.text || 
      (fallbackAnalyzer ? fallbackAnalyzer(task, output, outputFormat) : generateDefaultFallbackAnalysis(task, output));
  } catch (error) {
    console.error(`LLM 结果分析失败: ${error.message}`);
    if (fallbackAnalyzer) {
      return fallbackAnalyzer(task, output, outputFormat);
    }
    return generateDefaultFallbackAnalysis(task, output);
  }
}

/**
 * 构建脚本生成提示词
 */
function buildScriptGenerationPrompt(task, dataInput, outputFormat) {
  const outputInstructions = {
    auto: "根据任务类型智能选择最合适的输出格式（文本报告/JSON/CSV/图表数据）。用 print() 输出结果。",
    summary: "用 print() 输出清晰的文本报告，包含关键指标和结论。",
    json: "最后必须用 print(json.dumps(result, ensure_ascii=False, indent=2)) 输出结构化 JSON 结果。",
    csv: "用 print() 输出 CSV 格式（表头+数据行，逗号分隔）。",
    chart_data: "生成适合 ECharts 使用的数据格式，用 print(json.dumps(chart_data)) 输出。"
  };

  return `请根据以下需求生成一个完整的 Python 3 脚本：

【任务描述】
${task}

【输入数据】
${dataInput || "(无具体输入数据，脚本应能处理通用场景)"}

【输出要求】
${outputInstructions[outputFormat] || outputInstructions.auto}

【脚本要求】
1. 只输出 Python 代码，不要任何解释或 markdown
2. 必须包含完整的处理逻辑
3. 使用 try-except 处理可能的错误
4. 所有输出用 print()，方便捕获
5. 如果是数据处理任务，先判断输入类型再做处理
6. 脚本必须能够独立运行（不要依赖外部文件，除非必要）
7. **重要：只使用 Python 标准库（如 statistics, json, re, math, csv, itertools 等），禁止使用 numpy/pandas/matplotlib 等第三方库**

请直接输出 Python 代码：`;
}

/**
 * 默认降级脚本（当 LLM 不可用时）
 */
function generateDefaultFallbackScript(task, dataInput) {
  return `
print("=== 任务执行结果 ===")
print(f"任务描述: ${task}")

try:
    data = """${dataInput}"""
    if data.strip():
        print(f"收到数据长度: {len(data)} 字符")
        print(f"数据预览: {data[:200]}...")
        print(f"行数: {len(data.split(chr(10)))}")
    else:
        print("无输入数据")
    
    print(f"\\n✅ 任务执行完成")
except Exception as e:
    print(f"❌ 错误: {e}")
`;
}

/**
 * 默认降级分析（当 LLM 不可用时）
 */
function generateDefaultFallbackAnalysis(task, output) {
  const outputLower = output.toLowerCase();
  let analysis = [];
  
  if (outputLower.includes('错误') || outputLower.includes('error') || outputLower.includes('fail')) {
    analysis.push(`⚠️ 检测到执行错误`);
  } else {
    analysis.push(`✅ 脚本执行成功`);
  }
  
  // 尝试提取关键数字
  const numbers = output.match(/(\d+\.?\d*)/g);
  if (numbers && numbers.length > 0) {
    analysis.push(`📊 输出包含 ${numbers.length} 个数值结果`);
  }
  
  return analysis.join('\n') + `\n\n💡 提示: 结果已输出，可根据业务需求进一步解读`;
}

/**
 * 脚本安全检查
 * @param {string} code - Python 脚本代码
 * @returns {Object} - { safe: boolean, reason: string|null }
 */
export function checkScriptSafety(code) {
  const dangerousPatterns = [
    { pattern: /rm\s+-rf/i, reason: "包含危险的文件删除操作 (rm -rf)" },
    { pattern: /os\.system\s*\(/i, reason: "使用 os.system 执行系统命令" },
    { pattern: /subprocess\.call/i, reason: "使用 subprocess 调用外部程序" },
    { pattern: /eval\s*\(/i, reason: "使用 eval 执行动态代码" },
    { pattern: /exec\s*\(/i, reason: "使用 exec 执行动态代码" },
    { pattern: /open\s*\(.*['"]w/i, reason: "包含文件写入操作" },
    { pattern: /while\s*\(\s*True\s*\)/i, reason: "可能包含无限循环" },
    { pattern: /while\s+True:/i, reason: "可能包含无限循环" },
    { pattern: /for\s+\(\s*;\s*;\s*\)/i, reason: "可能包含无限循环" },
    { pattern: /import\s+socket/i, reason: "导入网络套接字模块" },
    { pattern: /import\s+urllib/i, reason: "导入网络请求模块" },
    { pattern: /requests\./i, reason: "使用网络请求" },
  ];

  for (const { pattern, reason } of dangerousPatterns) {
    if (pattern.test(code)) {
      return { safe: false, reason };
    }
  }

  return { safe: true, reason: null };
}

/**
 * 生成脚本元数据（用于工具注册）
 */
export const SCRIPT_GENERATOR_METADATA = {
  name: "script_generator",
  description: "使用 LLM 根据需求生成 Python 脚本",
  parameters: {
    task: { type: "string", description: "任务描述", required: true },
    dataInput: { type: "string", description: "输入数据", required: false, default: "" },
    outputFormat: { type: "string", description: "输出格式", required: false, default: "auto", options: ["auto", "summary", "json", "csv", "chart_data"] }
  }
};
