import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const q = process.argv.slice(2).join(" ");
if (!q) {
  console.error("Usage: node run_query.js <question>");
  process.exit(1);
}

const { spawn } = await import("node:child_process");

const child = spawn(
  process.execPath,
  [path.resolve(__dirname, "./query.js"), "--q", q],
  { stdio: "inherit" }
);

child.on("exit", (code) => process.exit(code ?? 0));
