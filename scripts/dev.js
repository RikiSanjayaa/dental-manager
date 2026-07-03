const { spawn } = require("node:child_process");
const path = require("node:path");

const localWranglerConfig = path.join(process.cwd(), ".wrangler-config");

const commands = [
  {
    name: "worker",
    command: process.platform === "win32" ? "npm.cmd" : "npm",
    args: ["run", "dev:worker"],
    env: { XDG_CONFIG_HOME: localWranglerConfig },
  },
  {
    name: "frontend",
    command: process.platform === "win32" ? "npm.cmd" : "npm",
    args: ["run", "dev:frontend"],
    env: { VITE_DEV_API_TARGET: "http://127.0.0.1:8787" },
  },
];

const children = [];
let shuttingDown = false;

function prefixOutput(name, stream, chunk) {
  const lines = chunk.toString().split(/\r?\n/);
  for (const line of lines) {
    if (line) stream.write(`[${name}] ${line}\n`);
  }
}

function shutdown(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const child of children) {
    if (!child.killed) child.kill(process.platform === "win32" ? "SIGTERM" : "SIGINT");
  }
  setTimeout(() => process.exit(code), 300);
}

for (const item of commands) {
  const useShell = process.platform === "win32";
  const child = spawn(
    useShell ? [item.command, ...item.args].join(" ") : item.command,
    useShell ? [] : item.args,
    {
    cwd: process.cwd(),
    env: { ...process.env, ...item.env },
    stdio: ["inherit", "pipe", "pipe"],
    shell: useShell,
  });

  children.push(child);
  child.stdout.on("data", (chunk) => prefixOutput(item.name, process.stdout, chunk));
  child.stderr.on("data", (chunk) => prefixOutput(item.name, process.stderr, chunk));
  child.on("exit", (code) => {
    if (!shuttingDown && code) {
      console.error(`[${item.name}] exited with code ${code}`);
      shutdown(code);
    }
  });
}

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));
