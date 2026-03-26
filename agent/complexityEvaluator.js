// ========== 智能复杂度评估系统 ==========
// 多维度、多阶段的智能任务复杂度评估

import { SystemMessage, HumanMessage } from "@langchain/core/messages";

/**
 * 复杂度等级枚举
 */
export const ComplexityLevel = {
  LOW: "low",           // 简单问答，直接 ReAct
  MEDIUM: "medium",     // 中等复杂，可选 Plan
  HIGH: "high",         // 高复杂度，建议 Plan
  CRITICAL: "critical"  // 极高复杂度，必须 Plan
};

/**
 * 轻量级 LLM 评估 Prompt（用于边界情况）
 */
const LIGHTWEIGHT_EVAL_PROMPT = `你是一个任务复杂度评估专家。

请快速判断以下任务的复杂度级别：

任务：{task}

复杂度级别说明：
- LOW（低）：简单问答、定义解释、单次查询、无需多步骤
- MEDIUM（中）：需要2-3个简单步骤、简单的文件操作、基础数据处理
- HIGH（高）：需要多个步骤/工具、文件批量处理、报告生成、复杂数据分析、对比分析
- CRITICAL（极高）：超复杂任务，需要5步以上、涉及多文件/多工具协同、自动化流程

请只输出一个词：LOW、MIDDLE 或 HIGH（将 MEDIUM 映射为 MEDIUM，CRITICAL 映射为 HIGH）

注意：只需要输出一个词，不要解释。`;

/**
 * 工具-复杂度映射表
 * 根据任务关键词判断可能需要的工具数量和类型
 */
const TOOL_COMPLEXITY_MAP = {
  // 高复杂度工具模式
  highTools: [
    /分析[个篇堆份批]/, /整理[个篇堆份批]/, /批量.*处理/,
    /统计.*计算/, /对比/, /归纳/, /总结[出给]/,
    /提取[出给]/, /筛选/, /处理[个批]/,
    /全部/, /所有/, /遍历/,
    /100|一百|两百|多份/, /第一.*第二.*第三/, /首先.*然后.*最后/,
    /流程.*图/, /生成.*报告/, /数据.*分析/,
    // 增强：添加更多高复杂度模式
    /自动化/, /批量/, /多.*步骤/,
    /生成.*图表/, /代码.*审查/, /代码.*分析/,
    /多.*文件/, /遍历.*文件/, /搜索.*并.*/
  ],
  
  // 中等复杂度工具模式
  mediumTools: [
    /创建.*文件/, /编写.*代码/, /查找.*并/, /搜索.*并/,
    /帮我.*一下/, /需要.*先/, /完成.*后/,
    /复杂/, /详细/, /全面/, /完整/,
    // 多步骤指示词
    /先.*再/, /然后/, /接着/, /最后/,
    /第[一二三四五六七八九十]步/, /第一步/, /下一步/
  ]
};

/**
 * 操作类型复杂度权重
 */
const OPERATION_COMPLEXITY = {
  file_batch: 0.3,      // 批量文件操作
  report_generation: 0.3, // 报告生成
  multi_document: 0.25,  // 多文档处理
  code_analysis: 0.2,    // 代码分析
  file_single: 0.15,     // 单文件操作
  knowledge_query: 0.05, // 知识查询
  simple_question: 0.0   // 简单问答
};

/**
 * 简单问答模式（低复杂度标志）
 */
const LOW_COMPLEXITY_PATTERNS = [
  /^(什么是|什么叫|解释一下|帮我看|请问|问一下|怎么|如何|是不是|能否|有没有).*[？?]$/,
  /^(?!.*(首先|然后|接着|最后|第一步|下一步|分析|整理|统计|计算|生成|创建|处理|提取)).*[？?]$/,
  /^(React|JavaScript|Node|Python|TypeScript|HTML|CSS).*(是什么|怎么用|如何使用)/,
  /^(这个|那个|它|这个函数|这个方法).*(是什么|干嘛的|什么意思|怎么用)/
];

/**
 * 文本长度与复杂度关系
 */
function calculateLengthFactor(text) {
  const len = text.length;
  if (len < 20) return 0;
  if (len < 50) return 0.05;
  if (len < 100) return 0.1;
  if (len < 200) return 0.15;
  if (len < 500) return 0.2;
  return 0.25;
}

/**
 * 步骤序列检测（增强版）
 */
function detectStepSequence(text) {
  const patterns = [
    { regex: /先(.+)再(.+)最后/gi, weight: 0.35 },
    { regex: /首先(.+)然后(.+)最后/gi, weight: 0.35 },
    { regex: /第一步(.+)第二步(.+)第三步/gi, weight: 0.35 },
    { regex: /先(.+)接着(.+)再(.+)最后/gi, weight: 0.4 },
    { regex: /首先(.+)接着(.+)然后(.+)最后/gi, weight: 0.4 },
    { regex: /依次(.+)、依次(.+)、依次/gi, weight: 0.3 },
    { regex: /逐一(.+)、逐一(.+)/gi, weight: 0.3 },
    { regex: /(?:第[一二三四五六七八九十\d]+步|第一步|下一步|下一步|最后一步)/gi, weight: 0.2 }
  ];

  let totalWeight = 0;
  for (const { regex, weight } of patterns) {
    const matches = text.match(regex);
    if (matches) {
      totalWeight += weight * Math.min(matches.length, 2);
    }
  }

  // 统计步骤指示词数量
  const stepIndicators = ["先", "然后", "接着", "再", "最后", "其次", "第一步", "下一步", "最后一步"];
  const indicatorCount = stepIndicators.reduce((count, word) => {
    const regex = new RegExp(word, 'g');
    return count + (text.match(regex) || []).length;
  }, 0);

  if (indicatorCount >= 4) totalWeight += 0.25;
  else if (indicatorCount >= 3) totalWeight += 0.15;
  else if (indicatorCount >= 2) totalWeight += 0.1;

  return Math.min(totalWeight, 0.5);
}

/**
 * 工具需求数量估算
 */
function estimateToolCount(text) {
  let score = 0;

  for (const pattern of TOOL_COMPLEXITY_MAP.highTools) {
    if (pattern.test(text)) {
      score += 0.35;
      break;
    }
  }

  for (const pattern of TOOL_COMPLEXITY_MAP.mediumTools) {
    if (pattern.test(text)) {
      score += 0.15;
      break;
    }
  }

  // 数量词检测
  const quantifiers = [
    { pattern: /(?:所有|全部|整个|全部的|整个的)/g, weight: 0.25 },
    { pattern: /\d+[个份批堆页张]/g, weight: 0.15 },
    { pattern: /多[个份]|[几许]个/g, weight: 0.1 }
  ];

  for (const { pattern, weight } of quantifiers) {
    if (pattern.test(text)) {
      score += weight;
      break;
    }
  }

  return Math.min(score, 0.4);
}

/**
 * 操作类型识别
 */
function identifyOperationType(text) {
  const types = [];

  if (/多[个份批].*(文件|文档|报告)/.test(text) || 
      /(遍历|搜索).*所有.*文件/.test(text) ||
      /批量.*处理/.test(text)) {
    types.push("file_batch");
  }

  if (/生成.*报告|整理.*报告|分析.*报告/.test(text)) {
    types.push("report_generation");
  }

  if (/(对比|比较).*[文档文件报告内容]/.test(text) ||
      /两份|三份|多份.*对比/.test(text)) {
    types.push("multi_document");
  }

  if (/代码.*(审查|分析|检查|review)|代码质量/.test(text)) {
    types.push("code_analysis");
  }

  if (/文件.*(读取|写入|编辑|创建)|创建.*文件/.test(text)) {
    types.push("file_single");
  }

  if (/知识库|查询.*知识|搜索.*文档/.test(text)) {
    types.push("knowledge_query");
  }

  return types;
}

/**
 * 计算操作类型分数
 */
function calculateOperationScore(text) {
  const types = identifyOperationType(text);
  if (types.length === 0) return 0;

  let maxScore = 0;
  for (const type of types) {
    const score = OPERATION_COMPLEXITY[type] || 0;
    if (score > maxScore) maxScore = score;
  }

  // 多个操作类型叠加
  if (types.length > 1) {
    maxScore *= 1.2;
  }

  return Math.min(maxScore, 0.35);
}

/**
 * 检测简单问答模式
 */
function isSimpleQuestion(text) {
  for (const pattern of LOW_COMPLEXITY_PATTERNS) {
    if (pattern.test(text)) {
      return true;
    }
  }
  return false;
}

/**
 * 上下文依赖分析
 */
function analyzeContextDependency(sessionHistory, currentInput) {
  if (!sessionHistory || sessionHistory.length < 2) {
    return 0;
  }

  let score = 0;

  // 检测指代词（依赖前文）
  const deicticPatterns = [
    /^(它|这个|那个|这些|那些|上面|刚才|之前)/,
    /(它|这个|那个|这些|那些)的/,
    /(处理|分析|整理|总结|完成)它们/,
    /(基于|根据|接着|在此基础上)/
  ];

  for (const pattern of deicticPatterns) {
    if (pattern.test(currentInput)) {
      score += 0.15;
      break;
    }
  }

  // 检测延续性动作
  const continuationPatterns = [
    /^(继续|还有|另外|此外|加上|加上)/,
    /(继续|接着)(做|处理|分析|完成)/
  ];

  for (const pattern of continuationPatterns) {
    if (pattern.test(currentInput)) {
      score += 0.1;
      break;
    }
  }

  // 如果前几轮都是复杂任务，提高当前任务可能是复杂的置信度
  const recentMessages = sessionHistory.slice(-4);
  const hasRecentComplexTasks = recentMessages.some(msg => {
    const content = typeof msg.content === "string" ? msg.content : 
                    (msg.content?.[0]?.text || "");
    return detectStepSequence(content) > 0.2 || estimateToolCount(content) > 0.2;
  });

  if (hasRecentComplexTasks) {
    score += 0.05;
  }

  return Math.min(score, 0.25);
}

/**
 * 快速规则评估（用于 LLM 调用前的快速路径）
 */
function quickRuleBasedEval(text) {
  // 明显的简单问题
  if (isSimpleQuestion(text)) {
    return { level: ComplexityLevel.LOW, confidence: 0.9 };
  }

  // 明显的极高复杂度
  if (/^(所有|全部).*(分析|整理|统计)/.test(text) ||
      /生成.*完整.*报告/.test(text) ||
      /^(自动化|批量).*处理/.test(text) ||
      /分析.*并.*生成.*报告/.test(text) ||
      /(首先|先).*(然后|再).*(最后)/.test(text) ||
      /分析.*整理.*统计/.test(text)) {
    return { level: ComplexityLevel.HIGH, confidence: 0.95 };
  }

  // 需要 LLM 进一步判断的边界情况
  return null;
}

/**
 * 主流式文本归一化
 */
function normalizeText(text) {
  if (typeof text === "string") return text;
  if (Array.isArray(text)) {
    return text.map(part => typeof part === "string" ? part : (part?.text || "")).join("");
  }
  return String(text || "");
}

/**
 * ========== 智能复杂度评估核心类 ==========
 */
export class IntelligentComplexityEvaluator {
  constructor(options = {}) {
    this.llm = options.llm || null;
    this.enableLLMEval = options.enableLLMEval !== false; // 默认启用 LLM 评估
    this.llmTimeout = options.llmTimeout || 3000; // 3秒超时
    this.confidenceThreshold = options.confidenceThreshold || 0.7; // 置信度阈值

    // 自适应阈值（可选）
    this.adaptiveThreshold = options.adaptiveThreshold || null;

    // 评估统计（用于自适应调整）
    this.stats = {
      totalEvals: 0,
      llmCallCount: 0,
      ruleBasedCount: 0
    };
  }

  /**
   * 主要评估入口
   * @param {string|object} userInput - 用户输入
   * @param {Array} sessionHistory - 会话历史（可选）
   * @returns {object} { level, score, confidence, reasoning, requiresPlan }
   */
  async evaluate(userInput, sessionHistory = []) {
    const text = normalizeText(userInput);

    this.stats.totalEvals++;

    // 1. 快速规则评估
    const quickResult = quickRuleBasedEval(text);
    if (quickResult && quickResult.confidence > 0.85) {
      // 简单问题返回低分，高复杂度返回高分
      const score = quickResult.level === ComplexityLevel.LOW ? 0.1 : 0.65;
      return this.buildResult(quickResult.level, score, quickResult.confidence, "快速规则");
    }

    // 2. 多维度评分
    const dimensions = {
      stepSequence: detectStepSequence(text),
      toolEstimate: estimateToolCount(text),
      operationScore: calculateOperationScore(text),
      lengthFactor: calculateLengthFactor(text),
      contextDependency: analyzeContextDependency(sessionHistory, text)
    };

    // 3. 计算综合分数（提高基础权重）
    const weights = {
      stepSequence: 0.35,
      toolEstimate: 0.30,
      operationScore: 0.15,
      lengthFactor: 0.1,
      contextDependency: 0.1
    };

    const totalScore = Object.entries(dimensions).reduce((sum, [key, value]) => {
      return sum + (value * weights[key]);
    }, 0);

    // 4. 置信度计算
    const confidence = this.calculateConfidence(dimensions, text);

    // 5. 决定是否需要 LLM 评估
    if (confidence < this.confidenceThreshold && this.enableLLMEval && this.llm) {
      return this.evaluateWithLLM(text, dimensions, sessionHistory);
    }

    // 6. 基于规则返回结果
    const level = this.scoreToLevel(totalScore);
    const reasoning = this.generateReasoning(dimensions);

    return this.buildResult(level, totalScore, confidence, reasoning);
  }

  /**
   * LLM 增强评估（用于边界情况）
   */
  async evaluateWithLLM(text, dimensions, sessionHistory) {
    this.stats.llmCallCount++;

    try {
      // 构建带会话历史的 Prompt
      let prompt = LIGHTWEIGHT_EVAL_PROMPT.replace("{task}", text.slice(0, 1000));
      if (sessionHistory && sessionHistory.length > 0) {
        const historySummary = sessionHistory
          .slice(-3) // 只取最近3轮
          .map((msg) => {
            const role = msg._getType ? msg._getType() : (msg.role || "user");
            const content = typeof msg.content === "string" ? msg.content : JSON.stringify(msg.content);
            return `${role}: ${content.slice(0, 150)}`;
          })
          .join("\n");
        prompt = `【对话历史（最近3轮）】\n${historySummary}\n\n【当前任务】\n${prompt}`;
      }

      // 带超时的 LLM 调用
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error("LLM评估超时")), this.llmTimeout);
      });

      const llmPromise = this.llm.invoke([
        new SystemMessage(prompt),
        new HumanMessage("判断这个任务的复杂度级别，只回答 LOW、MEDIUM 或 HIGH")
      ]);

      const response = await Promise.race([llmPromise, timeoutPromise]);

      const llmAnswer = normalizeText(response.content).toUpperCase().trim();

      // 映射 LLM 答案到级别
      let llmLevel;
      if (llmAnswer.includes("LOW")) {
        llmLevel = ComplexityLevel.LOW;
      } else if (llmAnswer.includes("MEDIUM") || llmAnswer.includes("MIDDLE")) {
        llmLevel = ComplexityLevel.MEDIUM;
      } else {
        llmLevel = ComplexityLevel.HIGH;
      }

      // LLM 结果与规则结果融合
      const ruleLevel = this.scoreToLevel(this.calculateWeightedScore(dimensions));
      const finalLevel = this.fuseResults(ruleLevel, llmLevel, dimensions);

      return this.buildResult(
        finalLevel,
        this.calculateWeightedScore(dimensions),
        0.85,
        `规则评估 + LLM语义分析: ${llmAnswer}`
      );

    } catch (error) {
      // LLM 调用失败，回退到规则评估
      console.warn(`⚠️ LLM评估失败，回退到规则: ${error.message}`);
      this.stats.llmCallCount--;

      const level = this.scoreToLevel(this.calculateWeightedScore(dimensions));
      const reasoning = this.generateReasoning(dimensions);

      return this.buildResult(level, this.calculateWeightedScore(dimensions), 0.6, reasoning + " (LLM不可用)");
    }
  }

  /**
   * 融合规则和 LLM 的结果
   */
  fuseResults(ruleLevel, llmLevel, dimensions) {
    const levelPriority = {
      [ComplexityLevel.LOW]: 0,
      [ComplexityLevel.MEDIUM]: 1,
      [ComplexityLevel.HIGH]: 2,
      [ComplexityLevel.CRITICAL]: 3
    };

    // 如果维度中有高复杂度指标，优先采用较高等级
    if (dimensions.stepSequence > 0.3 || dimensions.toolEstimate > 0.3) {
      return ComplexityLevel.HIGH;
    }

    // 否则取较高等级
    return levelPriority[llmLevel] > levelPriority[ruleLevel] ? llmLevel : ruleLevel;
  }

  /**
   * 计算置信度
   */
  calculateConfidence(dimensions, text) {
    // 一致性检查
    let consistencyScore = 1.0;

    // 如果步骤指示词多，但工具估计少，可能不一致
    if (dimensions.stepSequence > 0.2 && dimensions.toolEstimate < 0.1) {
      consistencyScore -= 0.2;
    }

    // 如果是简单问答模式但其他维度分数高，可能不一致
    if (isSimpleQuestion(text) && dimensions.stepSequence + dimensions.toolEstimate > 0.3) {
      consistencyScore -= 0.3;
    }

    // 基础置信度
    const baseConfidence = 0.5 + (consistencyScore * 0.3);

    // 极端值增加置信度
    if (dimensions.stepSequence + dimensions.toolEstimate > 0.5) {
      return Math.min(baseConfidence + 0.2, 0.95);
    }

    if (dimensions.stepSequence + dimensions.toolEstimate < 0.1) {
      return Math.min(baseConfidence + 0.15, 0.9);
    }

    return baseConfidence;
  }

  /**
   * 计算加权分数
   */
  calculateWeightedScore(dimensions) {
    const weights = {
      stepSequence: 0.35,
      toolEstimate: 0.30,
      operationScore: 0.15,
      lengthFactor: 0.1,
      contextDependency: 0.1
    };

    return Object.entries(dimensions).reduce((sum, [key, value]) => {
      return sum + (value * weights[key]);
    }, 0);
  }

  /**
   * 分数转级别
   */
  scoreToLevel(score) {
    if (score < 0.15) return ComplexityLevel.LOW;
    if (score < 0.35) return ComplexityLevel.MEDIUM;
    if (score < 0.55) return ComplexityLevel.HIGH;
    return ComplexityLevel.CRITICAL;
  }

  /**
   * 生成推理说明
   */
  generateReasoning(dimensions) {
    const reasons = [];

    if (dimensions.stepSequence > 0.2) {
      reasons.push(`多步骤序列(权重:${dimensions.stepSequence.toFixed(2)})`);
    }
    if (dimensions.toolEstimate > 0.15) {
      reasons.push(`工具需求估计(权重:${dimensions.toolEstimate.toFixed(2)})`);
    }
    if (dimensions.operationScore > 0.1) {
      reasons.push(`操作类型(权重:${dimensions.operationScore.toFixed(2)})`);
    }
    if (dimensions.contextDependency > 0.05) {
      reasons.push(`上下文依赖(权重:${dimensions.contextDependency.toFixed(2)})`);
    }

    return reasons.length > 0 ? reasons.join(", ") : "各维度分数较低";
  }

  /**
   * 构建结果对象
   */
  buildResult(level, score, confidence, reasoning) {
    return {
      level,
      score: Math.max(0, Math.min(1, score)),
      confidence: Math.max(0, Math.min(1, confidence)),
      reasoning,
      requiresPlan: level === ComplexityLevel.HIGH || level === ComplexityLevel.CRITICAL,
      recommendedPlan: level !== ComplexityLevel.LOW
    };
  }

  /**
   * 获取评估统计
   */
  getStats() {
    return {
      ...this.stats,
      llmUsageRate: this.stats.totalEvals > 0
        ? (this.stats.llmCallCount / this.stats.totalEvals * 100).toFixed(1) + "%"
        : "0%"
    };
  }
}

/**
 * ========== 便捷函数：兼容旧接口 ==========
 */

/**
 * 智能复杂度检测（兼容旧接口）
 * @param {string|object} userInput - 用户输入
 * @param {object} options - 配置选项
 * @returns {number} 复杂度分数 0-1
 */
export async function detectTaskComplexity(userInput, options = {}) {
  const evaluator = new IntelligentComplexityEvaluator({
    llm: options.llm || null,
    enableLLMEval: options.enableLLMEval || false, // 默认关闭 LLM 以保持兼容
    ...options
  });

  const result = await evaluator.evaluate(userInput, options.sessionHistory || []);

  return result.score;
}

/**
 * 简单模式检测（保持向后兼容 - 同步版本）
 */
export function detectTaskComplexitySync(text) {
  const evaluator = new IntelligentComplexityEvaluator();
  // 同步版本：直接计算分数，不等待异步
  const normalizedText = typeof text === "string" ? text : (text?.text || "");
  
  // 使用快速规则评估
  const quickResult = quickRuleBasedEval(normalizedText);
  if (quickResult) {
    return quickResult.level === ComplexityLevel.LOW ? 0.1 : 0.6;
  }
  
  // 多维度评分
  const dimensions = {
    stepSequence: detectStepSequence(normalizedText),
    toolEstimate: estimateToolCount(normalizedText),
    operationScore: calculateOperationScore(normalizedText),
    lengthFactor: calculateLengthFactor(normalizedText),
    contextDependency: 0 // 同步版本不支持上下文
  };
  
  const weights = {
    stepSequence: 0.35,
    toolEstimate: 0.30,
    operationScore: 0.15,
    lengthFactor: 0.1,
    contextDependency: 0.1
  };
  
  const totalScore = Object.entries(dimensions).reduce((sum, [key, value]) => {
    return sum + (value * weights[key]);
  }, 0);
  
  return Math.max(0, Math.min(1, totalScore));
}

/**
 * 获取任务模式建议
 */
export async function selectTaskMode(agent, userInput, requestOptions = {}, sessionHistory = []) {
  // 1. 强制指定
  if (requestOptions.taskMode === "react" || requestOptions.taskMode === "plan_exec") {
    return requestOptions.taskMode;
  }

  // 2. Agent 配置
  if (agent.taskMode === "react") return "react";
  if (agent.taskMode === "plan_exec") return "plan_exec";

  // 3. 智能评估
  const evaluator = new IntelligentComplexityEvaluator({
    llm: agent.llm,
    enableLLMEval: true
  });

  const result = await evaluator.evaluate(userInput, sessionHistory);

  // 4. 应用阈值
  const threshold = agent.complexityThreshold || 0.5;
  const complexity = result.score;

  if (result.requiresPlan || complexity >= threshold) {
    if (complexity >= threshold) {
      console.log(`📊 [Plan+Exec] 任务复杂度: ${complexity.toFixed(2)} >= ${threshold}, 启用计划模式`);
    } else {
      console.log(
        `📊 [Plan+Exec] 任务复杂度: ${complexity.toFixed(2)} < ${threshold}（结构化规划），启用计划模式`
      );
    }
    return "plan_exec";
  }

  console.log(`⚡ [ReAct] 任务复杂度: ${complexity.toFixed(2)} < ${threshold}, 使用快速响应`);
  return "react";
}

/**
 * 获取评估解释（用于调试）
 */
export async function explainComplexity(userInput, sessionHistory = []) {
  const evaluator = new IntelligentComplexityEvaluator();
  return evaluator.evaluate(userInput, sessionHistory);
}
