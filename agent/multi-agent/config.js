/**
 * Multi-Agent 配置中心
 *
 * 设计目标：
 * 1. 让开源脚手架使用者尽量通过“改配置”而不是“改实现”来定制多 Agent 行为。
 * 2. 把主控调度、子 Agent prompt、默认角色、前端展示文案统一收敛到一个文件。
 * 3. 提供足够详细的就地说明，方便用户直接阅读本文件完成定制。
 *
 * 推荐使用方式：
 * - 想改默认是否开启、多 Agent 上限、重试次数：修改 `DEFAULT_MULTI_AGENT_OPTIONS`
 * - 想改主控如何拆子任务：修改 `MULTI_AGENT_SELECTOR_CONFIG`
 * - 想改子 Agent 的执行约束：修改 `SUB_AGENT_PROMPT_CONFIG`
 * - 想改默认角色、权限、提示词、展示名称：修改 `DEFAULT_SUBAGENT_PROFILES`
 * - 想改前端卡片文案与标签：修改 `MULTI_AGENT_UI_CONFIG`
 *
 * 常见定制示例：
 * 1) 提高默认子任务上限
 *    DEFAULT_MULTI_AGENT_OPTIONS.maxAgents = 8
 *
 * 2) 增加一个新角色
 *    往 DEFAULT_SUBAGENT_PROFILES 里追加一个 profile：
 *    - id: 内部唯一标识
 *    - roleName: 内部角色名称
 *    - displayName: 前端显示名称
 *    - includeTools/includeSkills: 静态能力白名单
 *    - enabledWhen: 是否默认进入候选集合
 *    - buildPrompt: 该角色的基础提示词
 *
 * 3) 强制主控更偏向 tasks 形式
 *    调整 MULTI_AGENT_SELECTOR_CONFIG.systemLines / examples
 *
 * 4) 修改前端展示文案
 *    例如把“主控协同处理中”改成“主控正在协调多路分析”，
 *    或把“来自：xxx Agent”改成“协同来源：xxx”。
 *
 * 注意事项：
 * - `displayName` 是产品化名称，会直接影响前端卡片显示。
 * - `successSummary` / `failureSummary` 是前端结果卡片正文默认文案。
 * - `includeTools` / `includeSkills` 留空数组表示“显式不给能力”，不是“未配置”。
 * - 如果 profile 的 `buildPrompt` 已经内嵌了子任务说明，`buildSubAgentPrompt` 仍会补充统一 guardrails。
 */

function normalizeMultiAgentUserInput(input) {
  if (typeof input === "string") return input;
  if (input && typeof input === "object") return String(input.text || "");
  return String(input || "");
}

function buildScopedTaskClause(taskInstruction = "") {
  if (!taskInstruction) {
    return "";
  }

  return [
    `本次只处理这个子任务：${taskInstruction}`,
    "不要处理其他角度、主题或阶段。",
    "不要完整回答用户原始问题。",
    "如果用户原始问题包含多个维度，只输出与你本次子任务直接相关的部分。",
  ].join("\n");
}

function buildProfilePrompt(roleId, baseInstruction, outputStructure, text, taskInstruction = "") {
  const scopedTaskClause = buildScopedTaskClause(taskInstruction);
  return [
    `你是 ${roleId} subagent。${baseInstruction}`,
    scopedTaskClause,
    `用户原始问题：${text}`,
    "请输出：",
    ...outputStructure.map((item, index) => `${index + 1}. ${item}`),
  ].filter(Boolean).join("\n\n");
}

/**
 * 多 Agent 运行时默认选项。
 *
 * 字段说明：
 * - enabled: 默认是否开启多 Agent 协同
 * - maxAgents: 单次最多允许启动多少个子任务实例
 * - emitSubAgentEvents: 是否向前端发送子任务结果事件
 * - subAgentRetryCount: 子 agent 失败后的重试次数
 * - primaryAgentOrchestrationMode: 主 agent 是否切换到协调者模式
 * - primaryAgentOrchestrationCapabilities: 协调者模式下仍保留的常驻工具/技能
 * - subAgentAlwaysOnCapabilities: 子 agent 默认常驻的工具/技能
 * - dynamicDelegationEnabled: 是否允许主 agent 在 ReAct 循环中动态多轮委派 subagents
 * - maxDelegationRounds: 单次主请求最多允许发起多少轮动态委派
 * - maxDelegatedTasksPerRound: 每轮动态委派最多允许多少个子任务
 */
export const DEFAULT_MULTI_AGENT_OPTIONS = {
  enabled: true,
  maxAgents: 6,
  emitSubAgentEvents: true,
  subAgentRetryCount: 1,
  primaryAgentOrchestrationMode: true,
  primaryAgentOrchestrationCapabilities: ["search_knowledge", "search_tools"],
  subAgentAlwaysOnCapabilities: ["search_knowledge", "search_tools"],
  dynamicDelegationEnabled: true,
  maxDelegationRounds: 3,
  maxDelegatedTasksPerRound: 4,
};

/**
 * 主控 agent 的“子任务选择器”配置。
 *
 * 可改内容：
 * - systemLines: 控制主控如何理解“何时选子 agent、如何拆任务”
 * - examples: 给主控 few-shot 示例，建议优先保留 tasks 示例
 */
export const MULTI_AGENT_SELECTOR_CONFIG = {
  noSelectionFallback: [],
  systemLines: [
    "你是主控 agent 的子 agent 选择器。",
    "请根据用户问题，判断当前是否真的需要启动 subagents，以及应该启动哪些。",
    "允许按需要重复选择同一个角色；每一次重复选择都会作为独立子任务实例执行。",
    "当用户明确要求多个独立角度、维度、阶段或主题时，优先返回 tasks 数组，而不是只返回 profileIds。",
    "每个 tasks[i].task 必须只描述一个独立子任务，不要让多个子任务重复处理完整问题。",
    "原则：宁缺毋滥，只选择真正有帮助的角色；如果不需要任何 subagent，就返回空数组。",
  ],
  examples: [
    '{"profileIds":["information_gatherer","information_gatherer"],"reason":"一句话说明"}',
    '{"tasks":[{"profileId":"information_gatherer","task":"调研背景"},{"profileId":"information_gatherer","task":"补充竞品资料"}],"reason":"一句话说明"}',
    '{"tasks":[{"profileId":"risk_reviewer","task":"只审查安全风险"},{"profileId":"risk_reviewer","task":"只审查成本风险"},{"profileId":"risk_reviewer","task":"只审查性能风险"},{"profileId":"risk_reviewer","task":"只审查工程复杂度风险"}],"reason":"用户要求四个独立风险维度"}',
  ],
};

/**
 * 子 Agent 通用 prompt 约束配置。
 *
 * 用途：
 * - 防止一个子 Agent 把整道大题全做掉
 * - 保证“单实例只做单任务”
 * - 让多实例重复调度更稳定
 */
export const SUB_AGENT_PROMPT_CONFIG = {
  fallbackBasePrompt: "请围绕以下用户问题执行你的子任务，并只输出与该子任务相关的结果。",
  scopedTaskPrefix: "本次你只允许处理以下子任务：",
  scopedTaskGuardrails: [
    "不要处理其他角度、主题或阶段。",
    "不要完整回答用户原始问题。",
    "如果用户原始问题包含多个维度，只输出与你本次子任务直接相关的部分。",
  ],
};

/**
 * 前端展示配置。
 *
 * 这里负责统一多 Agent 相关 UI 文案，避免这些产品化文字散落在渲染逻辑里。
 *
 * 你可以改：
 * - 卡片标签：如 MULTI-AGENT / 协同结果 / 协同任务
 * - 主控状态标题：如“主控协同处理中”
 * - 主控状态正文：如“正在进行协同分析”
 * - 子 Agent 结果来源标签：如“来自：风险审查 Agent”
 * - 子 Agent 结果标题：如“风险审查 · 已完成”
 */
export const MULTI_AGENT_UI_CONFIG = {
  labels: {
    multiAgentStatus: "MULTI-AGENT",
    subAgentStatus: "协同任务",
    subAgentResultFallback: "协同结果",
  },
  titles: {
    multiAgentStatus: "主控协同处理中",
  },
  content: {
    multiAgentStatus: "正在进行协同分析",
  },
  formatters: {
    subAgentResultLabel: (agentLabel) => agentLabel ? `来自：${agentLabel} Agent` : "协同结果",
    subAgentResultTitle: (agentLabel, status) => `${agentLabel || "协同任务"} · ${status === "done" ? "已完成" : "执行异常"}`,
    subTaskTitle: (taskTitle) => taskTitle ? `子任务：${taskTitle}` : "",
  },
};

/**
 * 默认子 Agent profiles。
 *
 * profile 字段说明：
 * - id: 内部唯一标识，用于调度与日志追踪
 * - roleName: 内部角色名称
 * - displayName: 前端展示名称
 * - successSummary/failureSummary: 前端卡片正文默认文案
 * - roleDescription: 供主控理解该角色职责
 * - includeTools/includeSkills: 静态能力白名单
 * - enabledWhen: 该角色何时默认进入候选集合
 * - buildPrompt: 该角色的基础 prompt
 */
export const DEFAULT_SUBAGENT_PROFILES = [
  {
    id: "information_gatherer",
    roleName: "Information Gatherer SubAgent",
    displayName: "背景整理",
    successSummary: "背景信息整理已完成",
    failureSummary: "背景信息整理失败",
    roleDescription: "专注于收集背景信息、补充事实依据与整理关键上下文。",
    includeTools: ["search_knowledge"],
    includeSkills: [],
    enabledWhen: (text) => /什么|为什么|背景|资料|介绍|说明|调研|research|信息|情况/i.test(text),
    buildPrompt: (text, _userInput, taskInstruction = "") => buildProfilePrompt(
      "information gatherer",
      [
        "请只做信息收集、背景补充与关键事实整理，不要直接替代主 agent 给出最终回答。",
        "优先基于你当前已具备的技能与上下文完成方案设计。",
        "除非任务明确要求额外能力支持，否则不要为了泛化探索去寻找新工具。",
        "如果发现缺少关键前提，请在输出中明确标记假设、缺口与取舍，而不是扩展为无关的工具探索。",
      ].join(""),
      ["关键背景", "已知事实/线索", "仍需确认的信息"],
      text,
      taskInstruction
    ),
  },
  {
    id: "solution_designer",
    roleName: "Solution Designer SubAgent",
    displayName: "方案分析",
    successSummary: "方案分析已完成",
    failureSummary: "方案分析失败",
    roleDescription: "专注于提出候选方案、拆分思路与比较不同路径。",
    includeTools: [],
    includeSkills: ["ai_agent_teaching"],
    enabledWhen: (text) => /怎么做|如何|方案|设计|规划|步骤|架构|实现|优化|改造/i.test(text),
    buildPrompt: (text, _userInput, taskInstruction = "") => buildProfilePrompt(
      "solution designer",
      [
        "请聚焦提出通用可行的方案与执行路径，不要直接替代主 agent 给出最终回答。",
        "优先基于你当前已具备的技能与上下文完成方案设计。",
        "除非任务明确要求额外能力支持，否则不要为了泛化探索去寻找新工具。",
        "如果发现缺少关键前提，请在输出中明确标记假设、缺口与取舍，而不是扩展为无关的工具探索。",
      ].join(""),
      ["候选方案", "推荐路径", "取舍点"],
      text,
      taskInstruction
    ),
  },
  {
    id: "risk_reviewer",
    roleName: "Risk Reviewer SubAgent",
    displayName: "风险审查",
    successSummary: "风险审查已完成",
    failureSummary: "风险审查失败",
    roleDescription: "专注于审查风险、边界条件、潜在遗漏与验证建议。",
    includeTools: [],
    includeSkills: [],
    enabledWhen: () => true,
    buildPrompt: (text, _userInput, taskInstruction = "") => buildProfilePrompt(
      "risk reviewer",
      [
        "请审查任务中的风险、边界条件与验证建议，不要直接替代主 agent 给出最终回答。",
        "默认基于当前上下文进行审查，优先指出风险、前提缺口与验证建议。",
        "除非任务明确要求，否则不要主动扩展到额外能力探索或无关工具调用。",
        "如果信息不足，请明确指出缺失前提，而不是把风险审查扩展成方案设计或信息收集。",
      ].join(""),
      ["主要风险", "缺失前提/边界条件", "验证建议"],
      text,
      taskInstruction
    ),
  },
];

export function buildMultiAgentSelectorPrompt({ candidateProfiles, maxAgents, userInput }) {
  return [
    ...MULTI_AGENT_SELECTOR_CONFIG.systemLines,
    `最多选择 ${maxAgents} 个子任务实例。`,
    "你只能从以下候选角色中选择：",
    ...candidateProfiles.map((profile) => `- ${profile.id}: ${profile.roleDescription || profile.roleName || profile.id}`),
    "请只返回 JSON，格式如下二选一：",
    ...MULTI_AGENT_SELECTOR_CONFIG.examples,
    "用户问题：",
    userInput,
  ].join("\n");
}

export function buildSubAgentPrompt(profile, userInput) {
  const text = normalizeMultiAgentUserInput(userInput);
  const basePrompt = typeof profile?.buildPrompt === "function"
    ? profile.buildPrompt(text, userInput, profile?.taskInstruction || "")
    : `你是 ${profile?.id || "subagent"}。${SUB_AGENT_PROMPT_CONFIG.fallbackBasePrompt}\n\n用户原始问题：${text}`;

  if (!profile?.taskInstruction) {
    return basePrompt;
  }

  return [
    basePrompt,
    `${SUB_AGENT_PROMPT_CONFIG.scopedTaskPrefix}${profile.taskInstruction}`,
    ...SUB_AGENT_PROMPT_CONFIG.scopedTaskGuardrails,
  ].join("\n\n");
}
