# Deployment

The app runs on Google Cloud Run with a Neon PostgreSQL database, in two
independent environments (separate service, image repository, service accounts,
secrets, deployer and database):

- **Production:** https://appointment-matchmaker-prod-42649326635.us-east1.run.app/
- **Dev:** https://appointment-matchmaker-42649326635.us-east1.run.app/ The steps are in [deploy/gcp/README.md](../deploy/gcp/README.md).

- `./deploy/gcp/deploy.sh` (dev) or `./deploy/gcp/deploy.sh --env prod` builds the
  Docker image, pushes it and deploys it. Running it again redeploys new code.
- Pushes to `main` build the image once (tag `YYYYMMDD-HHMMSS-shortsha`), push it to
  Artifact Registry and deploy it to **dev** automatically after the tests pass.
  Production is deployed by running the `Deploy to production` workflow by hand, with
  an approval: it deploys the image dev is currently serving, without rebuilding. Both use a GitHub OIDC role of their own with minimal permissions, and
  check `/api/health` before taking traffic (see section 8 of the deploy README).
- Secrets live in Secret Manager. `deploy/gcp/config*.env` and `.env*local` are
  never committed.
- Neither environment has demo data (`SEED_DEMO_DATA=false`). Create the first admin with
  `make create-admin`.
- Email is not set up yet. Password recovery shows the reset link on the page
  (`RESET_LINK_IN_RESPONSE`), which is insecure; see the deploy README for how to
  switch to email.
