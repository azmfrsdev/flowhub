/**
 * Builds and deploys the rehearsal relay, flowhub-live (ADR-0017 D1):  npm run deploy:live
 * Reads .env.deploy (gitignored), like `npm run deploy`. The main service is
 * untouched. Afterwards, set NEXT_PUBLIC_LIVE_URL in .env.deploy to the wss://
 * URL printed here and redeploy the app to show "Rehearse out loud".
 */
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";

const REGION = "asia-southeast1";
const SERVICE = "flowhub-live";

const values = Object.fromEntries(
  readFileSync(".env.deploy", "utf8")
    .split(/\r?\n/)
    .filter((line) => /^[A-Z0-9_]+=/.test(line))
    .map((line) => [line.slice(0, line.indexOf("=")), line.slice(line.indexOf("=") + 1).trim()]),
);

function required(key: string): string {
  const value = values[key];
  if (!value) throw new Error(`Set ${key} in .env.deploy first.`);
  return value;
}

function run(command: string) {
  console.log(`\n> ${command}\n`);
  execSync(command, { stdio: "inherit" });
}

const project = required("GOOGLE_CLOUD_PROJECT");
const tag = new Date().toISOString().slice(0, 19).replace(/[-:]/g, "").replace("T", "-");
const image = `${REGION}-docker.pkg.dev/${project}/flowhub/live:${tag}`;

run(`gcloud builds submit . --project=${project} --region=${REGION} --config=cloudbuild.live.yaml --substitutions=_IMAGE=${image}`);

const env = {
  GOOGLE_CLOUD_PROJECT: project,
  FIREBASE_PROJECT_ID: required("FIREBASE_PROJECT_ID"),
  LIVE_LOCATION: values.LIVE_LOCATION || "us-central1",
  LIVE_ALLOWED_ORIGINS: required("APP_BASE_URL"),
};
// Scale to zero, at most 2 instances, 10 calls each. A call is capped at 10
// minutes in code; the 20-minute timeout leaves room for connecting and ending.
run(
  `gcloud run deploy ${SERVICE} --project=${project} --region=${REGION} --image=${image} ` +
    `--service-account=flowhub-run@${project}.iam.gserviceaccount.com --allow-unauthenticated ` +
    `--min-instances=0 --max-instances=2 --cpu=1 --memory=512Mi --concurrency=10 --timeout=1200 --cpu-boost ` +
    `--set-env-vars=${Object.entries(env).map(([key, value]) => `${key}=${value}`).join(",")}`,
);
