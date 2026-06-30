const { spawn } = require("node:child_process");
const { existsSync } = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const backendDir = path.join(root, "backend");
const uvicorn = path.join(
  backendDir,
  ".venv",
  process.platform === "win32" ? "Scripts/uvicorn.exe" : "bin/uvicorn",
);
const python = path.join(
  backendDir,
  ".venv",
  process.platform === "win32" ? "Scripts/python.exe" : "bin/python",
);

const command = existsSync(uvicorn) ? uvicorn : existsSync(python) ? python : "python";
const host = process.env.BACKEND_HOST || "127.0.0.1";
const port = process.env.BACKEND_PORT || "8010";
const args = existsSync(uvicorn)
  ? ["app.main:app", "--reload", "--host", host, "--port", port]
  : ["-m", "uvicorn", "app.main:app", "--reload", "--host", host, "--port", port];

const child = spawn(command, args, {
  cwd: backendDir,
  stdio: "inherit",
  shell: false,
});

child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  process.exit(code ?? 0);
});
