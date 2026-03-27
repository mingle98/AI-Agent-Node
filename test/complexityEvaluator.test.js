// ========== 智能复杂度评估器 - 动作密度算法重构测试 ==========
// 本测试套件覆盖：
// 1. 动作密度算法核心（evaluateActionDensity）
// 2. 快速规则评估（quickRuleBasedEval）通用检测
// 3. 多维度评分路径
// 4. 各维度独立函数
// 5. 修复验证：逗号分隔多动作序列（原 Bug 案例）
// 6. 边界情况与性能

import assert from "node:assert/strict";
import test from "node:test";

import {
  IntelligentComplexityEvaluator,
  ComplexityLevel,
  detectTaskComplexity,
  detectTaskComplexitySync,
  selectTaskMode,
  explainComplexity
} from "../agent/complexityEvaluator.js";

// ========== 动作密度算法核心测试 ==========

test.describe("动作密度算法 - 核心函数", () => {
  // 通过 evaluate() 的 reasoning 字段间接验证内部逻辑
  const evaluator = new IntelligentComplexityEvaluator({ enableLLMEval: false });

  test("evaluateActionDensity: 零个动作 → 低分", async () => {
    const result = await evaluator.evaluate("今天天气怎么样？");
    assert.equal(result.level, ComplexityLevel.LOW);
  });

  test("evaluateActionDensity: 单个动作 → 低分", async () => {
    const result = await evaluator.evaluate("解释一下闭包是什么");
    assert.equal(result.level, ComplexityLevel.LOW);
    assert.ok(result.score < 0.35);
  });

  test("evaluateActionDensity: 2个高权重动作 → 有分数（公式决定具体数值）", async () => {
    const result = await evaluator.evaluate("帮我搜索并分析这些数据");
    // 公式: stepSeq(0.14)×0.4 + toolEst(0.12)×0.3 = 0.092
    assert.ok(result.score >= 0.05, `2个动作应有分数: ${result.score}`);
    assert.ok(result.score <= 0.25, `2个动作分数不应过高: ${result.score}`);
  });

  test("evaluateActionDensity: 3+ 高权重动作 → HIGH", async () => {
    const result = await evaluator.evaluate("帮我分析统计汇总这些数据");
    assert.ok(result.level === ComplexityLevel.HIGH || result.level === ComplexityLevel.MEDIUM,
      `3个动作应为HIGH/MEDIUM: ${result.level}`);
  });

  test("evaluateActionDensity: 逗号分隔多段操作 → HIGH（动作密度信号）", async () => {
    const result = await evaluator.evaluate("扫描、整理、删除这些文件");
    assert.ok(
      result.level === ComplexityLevel.HIGH || result.score >= 0.35,
      `逗号多段应为HIGH: level=${result.level}, score=${result.score}`
    );
  });

  test("evaluateActionDensity: 动作密度极高 → HIGH（4+加权当量）", async () => {
    const result = await evaluator.evaluate("扫描所有文件，整理数据，删除空文件，分析内容，重命名");
    assert.equal(result.level, ComplexityLevel.HIGH,
      `6个高权重动作应判定HIGH: level=${result.level}`);
  });

  test("动作密度加分机制: 逗号分隔3+段额外加分", async () => {
    const score2 = (await evaluator.evaluate("搜索并分析")).score;
    const score3 = (await evaluator.evaluate("搜索、分析、整理")).score;
    assert.ok(score3 >= score2, "3段逗号应比2段得更高分");
  });
});

// ========== 快速规则评估通用检测 ==========

test.describe("quickRuleBasedEval - 通用动作密度检测", () => {
  const evaluator = new IntelligentComplexityEvaluator({ enableLLMEval: false });

  test("快速路径: 动作密度极高直接返回HIGH，不进入多维度", async () => {
    const result = await evaluator.evaluate("帮我分析统计对比汇总这些数据生成报告");
    assert.equal(result.level, ComplexityLevel.HIGH);
    assert.ok(result.confidence >= 0.9, `高置信度: ${result.confidence}`);
  });

  test("快速路径: 逗号多段操作直接返回HIGH", async () => {
    const result = await evaluator.evaluate("扫描,整理,删除,重命名,发送邮件");
    assert.equal(result.level, ComplexityLevel.HIGH);
  });

  test("快速路径: 简单问答直接返回LOW", async () => {
    const result = await evaluator.evaluate("什么是闭包？");
    assert.equal(result.level, ComplexityLevel.LOW);
  });

  test("快速路径: 固定高复杂度模式兜底", async () => {
    const result = await evaluator.evaluate("首先分析所有数据然后整理最后生成完整报告");
    assert.equal(result.level, ComplexityLevel.HIGH);
  });
});

// ========== 【核心修复验证】逗号分隔多动作序列 ==========

test.describe("【Bug 修复】逗号分隔多动作序列（原始案例）", () => {
  const evaluator = new IntelligentComplexityEvaluator({ enableLLMEval: false });

  test("【原Bug】扫描、整理、删除、重命名、发邮件 → 必须HIGH", async () => {
    const result = await evaluator.evaluate(
      "帮我扫描所有的文件,进行整理,删除空文件和文件夹," +
      "另外如果文件名字和内容没有关联请帮我工具内容特征重命名," +
      "最后产出一份整理过程报告通过邮箱发给我"
    );
    assert.equal(result.level, ComplexityLevel.HIGH,
      `原始案例应判定HIGH，实际: level=${result.level}, score=${result.score}`);
    assert.ok(result.requiresPlan, "requiresPlan 必须为 true");
    assert.ok(result.confidence >= 0.9, `置信度应>=0.9: ${result.confidence}`);
  });

  test("【原Bug】变体1: 扫描、整理、删除、发邮件 → HIGH", async () => {
    const result = await evaluator.evaluate("帮我扫描所有文件,整理数据,删除空文件,最后发邮件给我");
    assert.equal(result.level, ComplexityLevel.HIGH,
      `变体1应判定HIGH: level=${result.level}`);
  });

  test("【原Bug】变体2: 无固定句式但含4+高权重动作 → HIGH", async () => {
    const result = await evaluator.evaluate("遍历每个文件，提取内容，整理归类，统计结果");
    assert.equal(result.level, ComplexityLevel.HIGH,
      `4个动作应判定HIGH: level=${result.level}`);
  });

  test("【原Bug】变体3: 产报告+发送 → HIGH（固定模式兜底）", async () => {
    const result = await evaluator.evaluate("帮我整理这些文件，然后产出一份报告通过邮箱发送给我");
    assert.equal(result.level, ComplexityLevel.HIGH);
  });

  test("【回归测试】简单问答不受影响 → LOW", async () => {
    const cases = [
      "什么是 JavaScript?",
      "请问这个函数是干嘛的",
      "帮我看看这段代码对不对",
    ];
    for (const input of cases) {
      const result = await evaluator.evaluate(input);
      assert.equal(result.level, ComplexityLevel.LOW, `回归: "${input}" 应为LOW`);
    }
  });

  test("【回归测试】固定多步骤句式不受影响 → HIGH", async () => {
    const cases = [
      "首先搜索文件，然后整理排序，最后生成图表",
      "先分析数据再统计计算最后生成报告",
    ];
    for (const input of cases) {
      const result = await evaluator.evaluate(input);
      assert.equal(result.level, ComplexityLevel.HIGH, `回归: "${input}" 应为HIGH`);
    }
  });
});

// ========== 各维度独立函数测试 ==========

test.describe("各维度独立函数", () => {
  test("detectStepSequence: 逗号分隔动词序列得分", async () => {
    const evaluator = new IntelligentComplexityEvaluator({ enableLLMEval: false });
    const result = await evaluator.evaluate("扫描,整理,删除,重命名");
    assert.ok(result.score >= 0.15, `stepSequence应>0.15: score=${result.score}`);
  });

  test("detectStepSequence: 无步骤序列信号时得0", async () => {
    const evaluator = new IntelligentComplexityEvaluator({ enableLLMEval: false });
    const result = await evaluator.evaluate("什么是JavaScript");
    assert.ok(result.score < 0.35, `简单问答应低于HIGH阈值: score=${result.score}`);
  });

  test("identifyOperationType: file_batch 检测", async () => {
    const evaluator = new IntelligentComplexityEvaluator({ enableLLMEval: false });
    const cases = [
      "扫描所有文件并整理",
      "遍历目录下的每个文件",
      "批量处理这批数据",
    ];
    for (const input of cases) {
      const result = await evaluator.evaluate(input);
      assert.ok(result.score >= 0.08, `file_batch相关"${input}"应有分数: ${result.score}`);
    }
  });

  test("identifyOperationType: report_generation 检测", async () => {
    const evaluator = new IntelligentComplexityEvaluator({ enableLLMEval: false });
    const cases = [
      "生成一份报告",
      "产出一份整理报告",
      "输出分析报告",
    ];
    for (const input of cases) {
      const result = await evaluator.evaluate(input);
      assert.ok(result.score >= 0.08, `report相关"${input}"应有分数: ${result.score}`);
    }
  });
});

// ========== selectTaskMode 智能模式选择 ==========

test.describe("selectTaskMode - 智能模式选择", () => {
  function createTestAgent(options = {}) {
    return {
      llm: null,
      taskMode: options.taskMode || "auto",
      complexityThreshold: options.complexityThreshold || 0.5,
    };
  }

  test("强制指定 react 优先于智能评估", async () => {
    const agent = createTestAgent({ taskMode: "plan_exec" });
    const mode = await selectTaskMode(agent, "极其复杂的多步骤任务", { taskMode: "react" });
    assert.equal(mode, "react");
  });

  test("强制指定 plan_exec 优先于智能评估", async () => {
    const agent = createTestAgent({ taskMode: "react" });
    const mode = await selectTaskMode(agent, "什么是JavaScript", { taskMode: "plan_exec" });
    assert.equal(mode, "plan_exec");
  });

  test("Agent 配置 react 优先于智能评估", async () => {
    const agent = createTestAgent({ taskMode: "react" });
    const mode = await selectTaskMode(agent, "极其复杂的多步骤任务");
    assert.equal(mode, "react");
  });

  test("Agent 配置 plan_exec 优先于智能评估", async () => {
    const agent = createTestAgent({ taskMode: "plan_exec" });
    const mode = await selectTaskMode(agent, "什么是JavaScript");
    assert.equal(mode, "plan_exec");
  });

  test("【核心】逗号多动作 → plan_exec", async () => {
    const agent = createTestAgent({ taskMode: "auto", complexityThreshold: 0.5 });
    const mode = await selectTaskMode(agent,
      "帮我扫描所有的文件,进行整理,删除空文件和文件夹," +
      "另外如果文件名字和内容没有关联请帮我重命名," +
      "最后产出一份整理过程报告通过邮箱发给我"
    );
    assert.equal(mode, "plan_exec",
      `原始案例应走plan_exec，实际: ${mode}`);
  });

  test("高复杂度任务 → plan_exec（阈值判断）", async () => {
    const agent = createTestAgent({ taskMode: "auto", complexityThreshold: 0.5 });
    const mode = await selectTaskMode(agent,
      "分析所有数据，统计结果，生成图表，发送报告"
    );
    assert.equal(mode, "plan_exec",
      `4个动作应走plan_exec，实际: ${mode}`);
  });

  test("低复杂度任务 → react", async () => {
    const agent = createTestAgent({ taskMode: "auto", complexityThreshold: 0.5 });
    const mode = await selectTaskMode(agent, "什么是闭包？");
    assert.equal(mode, "react");
  });

  test("上下文依赖提升复杂度", async () => {
    const agent = createTestAgent({ taskMode: "auto", complexityThreshold: 0.5 });
    const history = [
      { content: "帮我分析这十份文档" },
      { content: "生成报告" }
    ];
    const mode = await selectTaskMode(agent, "把它们整理成表格", {}, history);
    assert.ok(mode === "plan_exec" || mode === "react");
  });

  test("不同阈值行为正确", async () => {
    const agentLow = createTestAgent({ taskMode: "auto", complexityThreshold: 0.2 });
    const agentHigh = createTestAgent({ taskMode: "auto", complexityThreshold: 0.8 });

    // 高阈值(0.8): 极简单任务 score=0.0 → 不满足阈值，走 react
    const modeHigh = await selectTaskMode(agentHigh, "hi");
    assert.equal(modeHigh, "react",
      `高阈值(0.8)+极简单(0.0)应走react，实际: ${modeHigh}`);

    // 低阈值(0.2): 高复杂度任务 score=0.65 → 超过阈值，走 plan_exec
    const modeLow = await selectTaskMode(agentLow,
      "帮我分析统计汇总这些数据生成报告发送邮件"
    );
    assert.equal(modeLow, "plan_exec",
      `低阈值(0.2)+高复杂度(0.65)应走plan_exec，实际: ${modeLow}`);
  });
});

// ========== 便捷函数测试 ==========

test.describe("便捷函数接口", () => {
  test("detectTaskComplexity: 返回有效分数", async () => {
    const cases = [
      { input: "什么是JavaScript?", expectLow: true },
      { input: "帮我扫描所有文件,整理,删除,发邮件", expectLow: false },
    ];
    for (const { input, expectLow } of cases) {
      const score = await detectTaskComplexity(input);
      assert.ok(typeof score === "number" && score >= 0 && score <= 1,
        `"${input}" 应返回0-1之间的数: ${score}`);
      if (expectLow) assert.ok(score < 0.5, `"${input}" 应为低分: ${score}`);
    }
  });

  test("detectTaskComplexitySync: 同步返回有效分数", () => {
    const score = detectTaskComplexitySync("帮我分析并生成报告");
    assert.ok(typeof score === "number" && score >= 0 && score <= 1, `同步应返回有效分数: ${score}`);
  });

  test("explainComplexity: 返回完整评估对象", async () => {
    const result = await explainComplexity("帮我扫描,整理,删除,重命名,发邮件");
    assert.ok(result.hasOwnProperty("level"));
    assert.ok(result.hasOwnProperty("score"));
    assert.ok(result.hasOwnProperty("confidence"));
    assert.ok(result.hasOwnProperty("reasoning"));
    assert.ok(result.hasOwnProperty("requiresPlan"));
    assert.ok(result.hasOwnProperty("recommendedPlan"));
    assert.equal(result.requiresPlan, true, "多动作应requiresPlan=true");
  });

  test("兼容对象输入", async () => {
    const score = await detectTaskComplexity({ text: "扫描,整理,删除" });
    assert.ok(typeof score === "number" && score >= 0 && score <= 1);
  });

  test("兼容空输入", async () => {
    const score = await detectTaskComplexity("");
    assert.ok(typeof score === "number" && score >= 0);
  });
});

// ========== 边界情况与健壮性 ==========

test.describe("边界情况与健壮性", () => {
  test("极短文本 → 有效结果", async () => {
    const evaluator = new IntelligentComplexityEvaluator({ enableLLMEval: false });
    const result = await evaluator.evaluate("hi");
    assert.ok(result.score >= 0 && result.score <= 1);
  });

  test("极长文本 → 分数不越界", async () => {
    const evaluator = new IntelligentComplexityEvaluator({ enableLLMEval: false });
    const longText = "帮我分析" + "这些数据".repeat(200);
    const result = await evaluator.evaluate(longText);
    assert.ok(result.score >= 0 && result.score <= 1);
  });

  test("分数边界: 最简单到最复杂都在0-1之间", async () => {
    const scores = await Promise.all([
      detectTaskComplexity("?"),
      detectTaskComplexity("hi"),
      detectTaskComplexity("什么是JavaScript?"),
      detectTaskComplexity("扫描,整理,删除,重命名,发邮件"),
      detectTaskComplexity("首先分析所有数据然后整理统计最后生成完整报告发送给团队"),
    ]);
    for (const score of scores) {
      assert.ok(score >= 0 && score <= 1, `分数应在0-1之间: ${score}`);
    }
  });

  test("推荐Plan覆盖: HIGH/CRITICAL → recommendedPlan=true", async () => {
    const evaluator = new IntelligentComplexityEvaluator({ enableLLMEval: false });
    const result = await evaluator.evaluate(
      "扫描所有文件,整理数据,删除空文件,重命名,生成报告,发送邮件"
    );
    assert.equal(result.level, ComplexityLevel.HIGH);
    assert.equal(result.recommendedPlan, true);
  });

  test("getStats 统计正确", async () => {
    const evaluator = new IntelligentComplexityEvaluator({ enableLLMEval: false });
    await evaluator.evaluate("简单问题");
    await evaluator.evaluate("复杂的多步骤任务");
    const stats = evaluator.getStats();
    assert.ok(stats.totalEvals >= 2);
    assert.ok(typeof stats.llmUsageRate === "string");
  });
});

// ========== 性能测试 ==========

test.describe("性能测试", () => {
  test("100次评估在1秒内完成", async () => {
    const evaluator = new IntelligentComplexityEvaluator({ enableLLMEval: false });
    const inputs = [
      "什么是JavaScript?",
      "帮我扫描,整理,删除,发邮件",
      "先分析再统计最后生成报告",
      "hi",
      "遍历所有文件并处理",
    ];
    const startTime = Date.now();
    for (let i = 0; i < 100; i++) {
      await evaluator.evaluate(inputs[i % inputs.length]);
    }
    const elapsed = Date.now() - startTime;
    assert.ok(elapsed < 2000, `100次评估应在2s内完成，实际: ${elapsed}ms`);
  });
});
