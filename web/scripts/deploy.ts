/**
 * Builds the image with Cloud Build and deploys it to Cloud Run:  npm run deploy
 * Reads .env.deploy (gitignored). Needs gcloud on PATH, signed in as a project
 * Owner. The service runs as flowhub-run and calls Gemini and Firestore with
 * that identity, so no key or secret is passed here (invariant 9).
 */
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";

const REGION = "asia-southeast1";
const SERVICE = "flowhub";

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
const image = `${REGION}-docker.pkg.dev/${project}/flowhub/web:${tag}`;

const substitutions = {
  _IMAGE: image,
  _FIREBASE_API_KEY: required("NEXT_PUBLIC_FIREBASE_API_KEY"),
  _FIREBASE_AUTH_DOMAIN: required("NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN"),
  _FIREBASE_PROJECT_ID: required("NEXT_PUBLIC_FIREBASE_PROJECT_ID"),
  _FIREBASE_APP_ID: required("NEXT_PUBLIC_FIREBASE_APP_ID"),
};
run(
  `gcloud builds submit . --project=${project} --region=${REGION} --config=cloudbuild.yaml ` +
    `--substitutions=${Object.entries(substitutions).map(([key, value]) => `${key}=${value}`).join(",")}`,
);

const runtimeEnv = [
  "GOOGLE_CLOUD_PROJECT",
  "GOOGLE_CLOUD_LOCATION",
  "FIREBASE_PROJECT_ID",
  "STORAGE_BUCKET",
  "TASKS_LOCATION",
  "TASKS_QUEUE",
  "TASKS_INVOKER_SA",
  "APP_BASE_URL",
];
// Scale to zero, at most 2 instances (the cost ceiling), and a 15-minute
// timeout so a stage run keeps its CPU for the whole Cloud Tasks call (ADR-0010).
run(
  `gcloud run deploy ${SERVICE} --project=${project} --region=${REGION} --image=${image} ` +
    `--service-account=flowhub-run@${project}.iam.gserviceaccount.com --allow-unauthenticated ` +
    `--min-instances=0 --max-instances=2 --cpu=1 --memory=1Gi --concurrency=20 --timeout=900 --cpu-boost ` +
    `--set-env-vars=${runtimeEnv.map((key) => `${key}=${required(key)}`).join(",")}`,
);
