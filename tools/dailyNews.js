import axios from "axios";

export async function getDailyNews(platform = "tenxunwang", limit = 10) {
  try {
    const allowedPlatforms = new Set(["tenxunwang", "weibo"]);
    const inputPlatform = String(platform || "tenxunwang").trim().toLowerCase() || "tenxunwang";
    const p = allowedPlatforms.has(inputPlatform) ? inputPlatform : "tenxunwang";
    const n = Number.isFinite(Number(limit)) ? Math.max(1, Math.min(50, Number(limit))) : 10;

    const url = "https://orz.ai/api/v1/dailynews/";
    const res = await axios.get(url, {
      params: { platform: p },
      timeout: 15000,
    });

    const payload = res?.data;
    const status = payload?.status;
    const list = Array.isArray(payload?.data) ? payload.data : [];

    if (!(status === "200" || status === 200 || res?.status === 200)) {
      const msg = payload?.msg || "unknown error";
      return `今日热点获取失败: ${msg}`;
    }

    const items = list.slice(0, n).map((x) => ({
      title: x?.title ?? "",
      url: x?.url ?? "",
      content: x?.content ?? "",
      source: x?.source ?? "",
      publish_time: x?.publish_time ?? "",
    }));

    return JSON.stringify(
      {
        platform: p,
        count: items.length,
        items,
      },
      null,
      2,
    );
  } catch (error) {
    const status = error?.response?.status;
    const msg = error?.response?.data?.msg || error?.message || "unknown error";
    return `今日热点获取失败: ${status ? `HTTP ${status} ` : ""}${msg}`;
  }
}
