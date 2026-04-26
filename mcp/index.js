// 更多mcp工具可以去阿里云MCP市场(https://bailian.console.aliyun.com/cn-beijing#/mcp-market)获取,注意增加新的MCP需要验证遵循格式(必须有description、keywords等参数)
export const MCP_CONFIG = {
  mcpServers: {
    WebSearch: {
      type: "streamableHttp",
      description: "基于通义实验室 Text-Embedding，GTE-reRank，Query 改写，搜索判定等多种检索模型及语义理解，串接专业搜索工程框架及各类型实时信息检索工具，提供实时互联网全栈信息检索，提升 LLM 回答准确性及时效性。",
      keywords: [
        "搜索",
        "联网搜索",
        "互联网搜索",
        "实时搜索",
        "实时信息",
        "实时资讯",
        "网页搜索",
        "网络检索",
        "信息检索",
        "查询资料",
        "最新消息",
        "新闻",
        "查询",
        "查找",
        "检索",
        "WebSearch",
      ],
      isActive: true, // 是否激活使用
      name: "AliyunBailianMCP_WebSearch",
      baseUrl: "https://dashscope.aliyuncs.com/api/v1/mcps/WebSearch/mcp",
      headers: {
        Authorization: `Bearer ${process.env.DASHSCOPE_API_KEY || ""}`,
      },
    },
    WebParser: {
      type: "sse",
      description: "网页解析（WebParser）MCP 服务，一个专用于网页内容解析的工具包。",
      keywords: [
        "网页解析",
        "网页内容解析",
        "网页提取",
        "网页抓取",
        "网页读取",
        "链接解析",
        "URL解析",
        "HTML解析",
        "正文提取",
        "内容提取",
        "文章提取",
        "网页转文本",
        "网页摘要",
        "页面分析",
        "读取",
        "解析",
        "查看",
        "网站",
        "网页",
        "页面",
        "爬取",
        "提取",
        "链接",
        "WebParser",
      ],
      isActive: true,
      name: "AliyunBailianMCP_WebParser",
      baseUrl: "https://dashscope.aliyuncs.com/api/v1/mcps/WebParser/sse",
      headers: {
        "Authorization":  `Bearer ${process.env.DASHSCOPE_API_KEY || ""}`,
      }
    }
  },
};
