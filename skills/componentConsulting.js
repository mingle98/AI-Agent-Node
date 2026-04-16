// ========== 前端组件咨询技能 ==========

function buildFocusAreas(question = "", component = "") {
  const text = String(question || "");
  const componentName = String(component || "");
  const focusAreas = [];

  const commonBaseParams = componentName === "ChatPanel"
    ? "`url`、`app-name`、`domain-name` 以及面板显示/关闭相关配置"
    : "`url`、`app-name`、`domain-name` 等基础接入参数";

  const focusRules = [
    {
      test: /(安装|引入|注册|挂载|接入|初始化|启动)/i,
      label: "接入方式",
      guidance: `确认组件安装方式、组件注册方式，以及 ${commonBaseParams} 是否完整。`,
    },
    {
      test: /(流式|stream|sse|websocket|长连接|实时输出)/i,
      label: "请求模式",
      guidance: "确认使用的是普通请求、SSE 流式还是 WebSocket 模式，并检查组件侧的请求模式开关、后端接口返回方式、以及自定义请求参数是否一致。",
    },
    {
      test: /(图片|图像|上传|识别|多模态)/i,
      label: "图片能力",
      guidance: "确认图片上传入口、后端是否支持图片输入、请求体字段格式，以及图片大小/格式限制。",
    },
    {
      test: /(历史|记录|本地存储|localStorage|上下文|记忆)/i,
      label: "上下文与存储",
      guidance: "确认 `enable-context`、`enable-local-storage` 是否开启，并检查会话隔离字段、历史记录读写、上下文拼接逻辑是否符合预期。",
    },
    {
      test: /(样式|主题|皮肤|夜间|暗黑|css|class|图标|头像)/i,
      label: "外观定制",
      guidance: "确认主题切换、自定义图标、头像、样式覆盖方式，以及宿主页面样式是否影响组件渲染。",
    },
    {
      test: /(回调|callback|onUserMessage|onAssistantMessage|onError|事件|close|关闭)/i,
      label: "回调与事件",
      guidance: "确认回调函数是否已正确传入，并检查消息回调、错误回调、关闭事件等触发时机是否符合预期。",
    },
    {
      test: /(自定义接口|请求头|参数|token|鉴权|custom-request-config|接口)/i,
      label: "接口与鉴权",
      guidance: "确认 `url`、请求头、鉴权信息、自定义参数注入方式，以及前后端字段命名是否一致。",
    },
  ];

  for (const rule of focusRules) {
    if (rule.test.test(text)) {
      focusAreas.push({ label: rule.label, guidance: rule.guidance });
    }
  }

  if (focusAreas.length === 0) {
    focusAreas.push(
      {
        label: "基础接入",
        guidance: `先确认组件安装、注册以及 ${commonBaseParams} 是否完整。`,
      },
      {
        label: "核心能力开关",
        guidance: "再确认 `enable-streaming`、`enable-context`、`enable-local-storage`、`enable-voice-input` 等能力开关是否符合场景。",
      },
      {
        label: "回调与请求链路",
        guidance: "最后检查 `callbacks`、自定义请求配置、后端接口字段和响应格式是否匹配。",
      }
    );
  }

  return focusAreas;
}

/**
 * 通用前端组件咨询技能
 * @param {string} question - 咨询问题
 * @param {string} component - 组件名称或功能
 * @returns {Promise<string>} - 组件使用指导
 */
export async function skillComponentConsulting(question, component = "SuspendedBallChat") {
  try {
    console.log(`🔧 组件咨询: ${component} - ${question}`);

    const normalizedComponent = String(component || "SuspendedBallChat").trim() || "SuspendedBallChat";
    const normalizedQuestion = String(question || "").trim();
    const focusAreas = buildFocusAreas(normalizedQuestion, normalizedComponent);

    const consultingContent = {
      component: normalizedComponent,
      question: normalizedQuestion,
      guidance:
        `${normalizedComponent} 组件咨询:\n\n` +
        `组件: ${normalizedComponent}\n` +
        `问题: ${normalizedQuestion || "未提供具体问题"}\n\n` +
        `建议优先从以下方向排查/配置：\n` +
        focusAreas.map((item, index) => `${index + 1}. ${item.label}：${item.guidance}`).join("\n") +
        `\n\n通用检查项：\n` +
        `- 基础参数：\`url\`、\`app-name\`、\`domain-name\`\n` +
        `- 能力开关：\`enable-streaming\`、\`enable-context\`、\`enable-local-storage\`、\`enable-voice-input\`\n` +
        `- 事件回调：\`callbacks.onUserMessage\`、\`callbacks.onAssistantMessage\`、\`callbacks.onError\`\n` +
        `- 自定义请求：\`custom-request-config\`\n\n` +
        `如果需要，我可以继续基于 ${normalizedComponent} 和你当前的问题直接给出对应的组件示例配置。`
    };

    return JSON.stringify(consultingContent, null, 2);
  } catch (error) {
    return `组件咨询执行失败: ${error.message}`;
  }
}

