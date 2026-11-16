# Deployment

The app runs on Google Cloud Run at
https://appointment-matchmaker-42649326635.us-east1.run.app/ with a Neon
PostgreSQL database. The steps are in [deploy/gcp/README.md](../deploy/gcp/README.md).

- `./deploy/gcp/deploy.sh` builds the Docker image, pushes it and deploys it.
  Running it again redeploys new code.
- Pushes to `main` deploy automatically after the tests pass, through a GitHub OIDC
  role with minimal permissions and a check of `/api/health`
  (see section 8 of the deploy README).
- Secrets live in Secret Manager. `deploy/gcp/config.env` and `.env.local` are
  never committed.
- Production has no demo data (`SEED_DEMO_DATA=false`). Create the first admin with
  `make create-admin`.
- Email is not set up yet. Password recovery shows the reset link on the page
  (`RESET_LINK_IN_RESPONSE`), which is insecure; see the deploy README for how to
  switch to email.
