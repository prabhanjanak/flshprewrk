import { execSync } from "child_process";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

try {
  console.log("Building backend bundle...");
  execSync("node ./build.mjs", { 
    stdio: "inherit", 
    cwd: __dirname 
  });

  console.log("Starting backend...");
  execSync("node --watch --enable-source-maps --env-file=.env ./dist/index.mjs", { 
    env: { ...process.env, NODE_ENV: "development" }, 
    stdio: "inherit",
    cwd: __dirname
  });
} catch (e) {
  process.exit(1);
}
