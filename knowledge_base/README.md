# 📚 知识库目录

这个目录用于存放 RAG（检索增强生成）知识库的原始文档。

## 支持的文件格式

- **`.txt`** - 纯文本文件
- **`.md`** - Markdown 文档
- **`.pdf`** - PDF 文档
- **`.epub`** - 电子书

## 使用方法

1. **添加文档**：将你的文档文件放入此目录
2. **构建向量库**：运行 `npm run build:rag`
3. **启动 Agent**：运行 `npm run dev`

## 示例文档

当前目录包含以下示例文档：

- `README.md` - LangChain 知识库说明
- `Preface.md` - 前言
- `agent_guide.md` - Agent 指南
- 更多...

## 知识库更新

当你添加或修改文档后，需要重新构建向量库：

```bash
# 重建向量库（会删除旧的）
npm run rebuild:rag

# 首次构建向量库
npm run build:rag
```

## 文档建议

- 建议至少添加 3-5 个相关文档
- 文档内容应该与你的业务领域相关
- 文档质量越高，RAG 检索效果越好
- 每个文档会被切分成 1000 字符的文本块（带 200 字符重叠）

## 技术细节

- **文本切分**：RecursiveCharacterTextSplitter
- **向量化模型**：text-embedding-v4 (阿里云)
- **向量数据库**：FAISS
- **存储位置**：`../vector_db/`
