import { compose } from "./compose";

export default async function globalTeardown() {
  if (process.env.E2E_KEEP) {
    console.log("E2E_KEEP is set: leaving the e2e stack running.");
    return;
  }
  compose(["down", "-v", "--remove-orphans"], { quiet: true });
}
