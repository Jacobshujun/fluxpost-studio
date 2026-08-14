import { spawn } from "node:child_process";
import path from "node:path";

const options = parseArguments(process.argv.slice(2));
const nextBin = path.join(process.cwd(), "node_modules", "next", "dist", "bin", "next");
const developmentWorkersEnabled = process.env.FLUXPOST_DEVELOPMENT_WORKERS === "1";
const child = spawn(process.execPath, [nextBin, "dev", "-H", options.host, "-p", String(options.port)], {
  stdio: "inherit",
  env: {
    ...process.env,
    FLUXPOST_RUNTIME_MODE: "development",
    FLUXPOST_RELEASE_SHA: "",
    FLUXPOST_DISABLE_BACKGROUND_WORKERS: developmentWorkersEnabled ? "0" : "1",
  },
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => child.kill(signal));
}

child.on("error", (error) => {
  console.error(`Failed to start the development server: ${error.message}`);
  process.exitCode = 1;
});
child.on("exit", (code, signal) => {
  process.exitCode = signal ? 1 : (code ?? 1);
});

function parseArguments(args) {
  const result = { host: "127.0.0.1", port: 3000 };
  for (let index = 0; index < args.length; index += 1) {
    const option = args[index];
    const value = args[index + 1];
    if (option === "--host" && value) {
      if (!/^(?:localhost|127\.0\.0\.1|0\.0\.0\.0)$/.test(value)) throw new Error("Unsupported development host");
      result.host = value;
      index += 1;
      continue;
    }
    if (option === "--port" && value) {
      const port = Number(value);
      if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error("Development port must be between 1024 and 65535");
      result.port = port;
      index += 1;
      continue;
    }
    throw new Error(`Unsupported development option: ${option}`);
  }
  return result;
}
