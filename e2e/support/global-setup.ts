import { compose, waitForApp } from "./compose";
import { BASE_URL } from "./env";

export default async function globalSetup() {
  // Start from an empty database so the demo data is seeded fresh.
  if (!process.env.E2E_KEEP) compose(["down", "-v", "--remove-orphans"], { quiet: true });
  const build = process.env.E2E_NO_BUILD ? [] : ["--build"];
  console.log(`Starting docker-compose.yaml stack on ${BASE_URL} …`);
  compose(["up", "-d", "--wait", ...build]);
  await waitForApp();
}
