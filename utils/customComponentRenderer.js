export function buildCustomComponents(toolExcResults) {
  try {
    if (!Array.isArray(toolExcResults) || toolExcResults.length === 0) {
      return {};
    }

    const customComponents = {};

    const newsToolRes = toolExcResults.find((item) => item?.toolName === "daily_news");
    if (newsToolRes?.result) {
      let dataJSON = {};
      try {
        dataJSON = JSON.parse(newsToolRes.result || "{}");
      } catch (e) {
        dataJSON = {};
      }

      const items = Array.isArray(dataJSON?.items) ? dataJSON.items : [];
      customComponents["1"] = {
        type: "sl-card-group",
        data: {
          id: "1",
          items: items
            .filter(Boolean)
            .map((li) => ({
              imageUrl: "https://random-pictures.shifeiyu.cn/random",
              title: li?.title || "暂无标题",
              description: li?.content,
              jumpLink: li?.url || "",
            })),
        },
      };
    }

    return customComponents;
  } catch (error) {
    console.log("buildCustomComponents err", error);
    return {};
  }
}

export function ensureAnswerHasCustomComponentPlaceholders(answer, customComponents) {
  try {
    let text = typeof answer === "string" ? answer : "";
    const ids = Object.keys(customComponents || {}).sort((a, b) => Number(a) - Number(b));
    for (const id of ids) {
      const placeholder = `[[~${id}]]`;
      if (!text.includes(placeholder)) {
        text = text ? `${text}\n\n${placeholder}` : placeholder;
      }
    }
    return text;
  } catch (error) {
    console.log("ensureAnswerHasCustomComponentPlaceholders err", error);
    return typeof answer === "string" ? answer : "";
  }
}

export async function renderCustomComponents(toolExcResults, sendChunk, options = {}) {
  const sleepMs = Number.isFinite(Number(options.sleepMs)) ? Number(options.sleepMs) : 0;
  const sleepFn = (time) => new Promise((resolve) => setTimeout(resolve, time));

  try {
    const customComponents = buildCustomComponents(toolExcResults);
    const ids = Object.keys(customComponents);
    for (const id of ids) {
      const component = customComponents[id];
      if (!component) continue;
      sendChunk({
        code: 0,
        result: `[[~${id}]]`,
        type: "custom-component",
        is_end: false,
        props: component,
      });
      if (sleepMs > 0) {
        await sleepFn(sleepMs);
      }
    }
  } catch (error) {
    console.log("renderCustomComponents err", error);
  }
}
