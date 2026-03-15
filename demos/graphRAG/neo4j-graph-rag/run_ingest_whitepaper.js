import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const pdfPath = path.resolve(
  __dirname,
  "../../knowledge_base/[译] AI Agent（智能体）技术白皮书（Google，2024）.pdf"
);

const { spawn } = await import("node:child_process");

const child = spawn(
  process.execPath,
  [path.resolve(__dirname, "./ingest.js"), "--pdf", pdfPath],
  { stdio: "inherit" }
);

child.on("exit", (code) => process.exit(code ?? 0));
