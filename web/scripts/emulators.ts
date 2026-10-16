/**
 * Starts the Firebase emulators under the demo- project:  npm run emulators
 * The Firebase CLI needs Java 21 or later. If FLOWHUB_JAVA_HOME is set, its
 * bin folder goes first on PATH for this process only, so a per-user JDK 21
 * wins over an older system Java without changing JAVA_HOME for other work.
 */
import { spawn } from "node:child_process";
import path from "node:path";

const env = { ...process.env };
const javaHome = env.FLOWHUB_JAVA_HOME;
if (javaHome) {
  // Windows names it Path; adding a second PATH key would leave the child with both.
  const pathKey = Object.keys(env).find((key) => key.toUpperCase() === "PATH") ?? "PATH";
  env[pathKey] = path.join(javaHome, "bin") + path.delimiter + (env[pathKey] ?? "");
  env.JAVA_HOME = javaHome;
}

const command = "npx --yes firebase-tools@latest emulators:start --project demo-flowhub --config ../firebase.json";
const child = spawn(command, { stdio: "inherit", env, shell: true });
child.on("exit", (code) => process.exit(code ?? 1));
