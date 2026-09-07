import { spawn } from "node:child_process";
import { once } from "node:events";
import { resolve } from "node:path";

export default async function setup() {
  const child = spawn(
    process.execPath,
    [resolve("tests/browser/preview-server.mjs")],
    {
      windowsHide: true,
      stdio: ["ignore", "pipe", "inherit"],
      env: process.env,
    },
  );
  await new Promise<void>((resolveReady, reject) => {
    const timeout = setTimeout(
      () => fail(new Error("Preview server did not start within 10 seconds")),
      10000,
    );
    const cleanup = () => {
      clearTimeout(timeout);
      child.off("error", fail);
      child.off("exit", earlyExit);
      child.stdout!.off("data", ready);
    };
    const fail = (error: Error) => {
      cleanup();
      child.kill();
      reject(error);
    };
    const earlyExit = (code: number | null) =>
      fail(new Error(`Preview server exited before readiness (${code})`));
    const ready = () => {
      cleanup();
      resolveReady();
    };
    child.once("error", fail);
    child.once("exit", earlyExit);
    child.stdout!.once("data", ready);
  });
  return async () => {
    if (child.exitCode !== null || child.signalCode !== null) return;
    const closed = once(child, "exit");
    const timeout = setTimeout(() => child.kill("SIGKILL"), 5000);
    child.kill();
    try {
      await closed;
    } finally {
      clearTimeout(timeout);
    }
  };
}
