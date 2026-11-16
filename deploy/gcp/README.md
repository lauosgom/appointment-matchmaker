# Deploying to Google Cloud Run (free tier)

The setup:

```
Browser ─► Cloud Run (the app's Docker image: frontend + API), https://…run.app
             ├─► Neon (PostgreSQL, free plan)
             └─► Brevo (SMTP, free plan) for password-recovery emails
```

At this app's traffic, this should cost $0. Cloud Run scales to zero when nobody
is using it, so the first visit after a quiet period takes a few seconds while Cloud
Run and Neon wake up.

`deploy.sh` deploys into an **existing** project and leaves everything else in it
alone:

- **Names:** everything it creates starts with `appointment-matchmaker` and has the
  label `app=appointment-matchmaker`.
- **Permissions:** the app runs as its own service account, which can read only the
  app's two secrets.
- **Your gcloud setup:** it passes `--project` on every command and never changes
  your default project.

## 1. Before you start

- **Tools:** the `gcloud` CLI, logged in with `gcloud auth login`, and Docker.
- **Billing:** the project must have billing enabled. Cloud Run requires it, even
  within the free tier.
- **Permissions in the project:** Owner or Editor works. Otherwise you need these
  roles:
  - Cloud Run Admin
  - Artifact Registry Admin
  - Secret Manager Admin
  - Service Account Admin
  - Service Account User
  - Service Usage Admin

## 2. Database: Neon

This repo is already linked to the Neon project `gentle-frost-94428278` (region
AWS us-east-1). Setting that up on another machine:

```sh
npm i -g neon@latest   # or: npm i -g --prefix ~/.local neon@latest
neon login
neon init -y --agent claude-code --org-id org-billowing-grass-26413695 --project-id gentle-frost-94428278
```

`neon init` writes the connection strings to `.env.local` at the repo root, which git
ignores. `deploy.sh` and `make create-admin` read `DATABASE_URL_UNPOOLED` from that
file. They use the direct connection because the app keeps its own connection pool.
Keep `.env.local` private: it gives full access to the data.

`neon init` also adds `neon.ts`, `package.json` and `.neon` for Neon's own tooling.
The Python app doesn't use them.

## 3. Email: Brevo (optional, skipped for now)

> **Deploying without email.** Leave `SMTP_USERNAME` empty in `config.env` and skip
> this step. `deploy.sh` then sets `RESET_LINK_IN_RESPONSE=true`: no emails are sent,
> and the password-recovery page shows the reset link directly. **This is insecure:**
> anyone who knows an account's email (admins included) can reset its password.
> Until email is set up, create users with known emails only, or don't share the
> URL. To switch to email later, do the steps below, fill in `SMTP_USERNAME` and
> `MAIL_FROM`, and run `./deploy/gcp/deploy.sh`. That replaces the flag.

1. Sign up at https://www.brevo.com. The free plan allows 300 emails a day.
2. Go to **Senders, domains & dedicated IPs → Senders**. Add the address the
   emails should come from (for example, one at your organization's domain) and
   verify it.
3. Go to **SMTP & API → SMTP**. Note the **SMTP login**, then generate an
   **SMTP key**.
4. Optional, but it helps keep emails out of spam: authenticate your domain
   (SPF/DKIM) in Brevo. This requires adding DNS records.

## 4. Configure

```sh
cp deploy/gcp/config.env.example deploy/gcp/config.env
```

Fill in `PROJECT_ID` (and, if you set up email, `SMTP_USERNAME` (the Brevo SMTP login) and `MAIL_FROM` (the
verified sender)). `config.env` is in `.gitignore`, so it isn't committed. It holds no
passwords: the script asks for those.

## 5. Deploy

```sh
./deploy/gcp/deploy.sh
```

The first run:

1. Enables the Cloud Run, Artifact Registry and Secret Manager APIs.
2. Creates the image repository (`appointment-matchmaker`) and the service account
   (`appointment-matchmaker-run`).
3. Stores the **Neon connection string** (from `.env.local`) and, if email is on,
   the **Brevo SMTP key** (it asks you for this) in Secret Manager.
4. Builds the image, pushes it and deploys the Cloud Run service.
5. Checks that the app answers.

The service is configured for the free tier and for production:

- **No demo data:** `SEED_DEMO_DATA=false`, so the public demo logins don't exist.
- **Billing mode:** request-based, which is what the free tier covers.
- **Instances:** none when idle, at most 2.
- **Email:** `MAIL_SEND_INLINE=true`, so emails are sent before the response.
  Request-based billing throttles the CPU after a response, so a background send
  might never finish.
- **Links in emails:** `APP_BASE_URL` is the service's address,
  `https://appointment-matchmaker-<project number>.us-east1.run.app`, unless you
  set it in `config.env`.

To deploy new code later, run the same command again. It only rebuilds and
redeploys. To replace the stored database URL or SMTP key, run
`./deploy/gcp/deploy.sh --update-secrets`.

## 6. Create the first administrator

The production database starts empty. From the repo root:

```sh
make create-admin
```

It asks for the username, full name, email (used for password recovery) and
password, and creates the account in the Neon database from `.env.local`. Then open the
app, log in, and go to **Configuración**:

- Set the **letters for the current year**. Appointments can't be confirmed without
  them.
- Check the appointment length.

Then create the departments, areas, specialists, availability and user accounts.

## 7. Watch the cost

Cloud Run's free tier is shared by every project on the billing account. To be told
if this app ever costs anything, go to **Billing → Budgets & alerts → Create
budget**:

- Scope it to this project, and filter by the label `app = appointment-matchmaker`.
- Set the amount to $1, with alerts at 50% and 100%.

Things that could cost money:

- Usage beyond the free tier. At most 2 instances limits how far that can go.
- More than 0.5 GB of stored images. The repository keeps only the 3 newest.
- Network egress beyond the free allowance.

Neon and Brevo don't charge on their free plans. They stop working when you hit
their limits instead.

## 8. Two environments: dev and production

There are two independent copies of the infrastructure in the same Google Cloud
project. Each has its own Cloud Run service, image repository, service accounts,
secrets, GitHub deployer and Neon database:

| | dev | production |
|---|---|---|
| Config | `config.env` | `config.prod.env` |
| Cloud Run service | `appointment-matchmaker` | `appointment-matchmaker-prod` |
| Neon project | `gentle-frost-94428278` (`.env.local`) | `round-cloud-21575563` (`.env.prod.local`) |
| Deployed by | every push to `main`, after the tests pass | manual workflow, with approval |
| GitHub Environment | `dev` | `production` |
| Workload identity pool | `github` | `github-prod` |

The scripts take `--env`: `./deploy/gcp/deploy.sh --env prod` and
`./deploy/gcp/setup-github-oidc.sh --env prod`. Without it they use `config.env`
(dev). The `config*.env` and `.env.*local` files are never committed.

### GitHub Actions

[`.github/workflows/ci.yaml`](../../.github/workflows/ci.yaml) runs the tests and,
on `main`, deploys to **dev** through the reusable
[`deploy.yaml`](../../.github/workflows/deploy.yaml).
[`deploy-prod.yaml`](../../.github/workflows/deploy-prod.yaml) deploys to
**production**: run it by hand from the Actions tab (Run workflow, branch `main`).
Both log in to Google Cloud with GitHub's OIDC token (workload identity
federation), so no key or password is stored in GitHub.

**Set up once per environment**, after its first `./deploy/gcp/deploy.sh`, with a
project admin logged in to `gcloud`:

```sh
./deploy/gcp/setup-github-oidc.sh             # dev
./deploy/gcp/setup-github-oidc.sh --env prod  # production
```

Each prints five values: `GCP_PROJECT_ID`, `GCP_REGION`, `GCP_SERVICE`,
`GCP_WORKLOAD_IDENTITY_PROVIDER` and `GCP_DEPLOYER_SERVICE_ACCOUNT`. None is secret.
Add them as **variables of the GitHub Environment** (Settings → Environments). For
`dev` the repository variables you already set keep working, because an
environment variable only overrides a repository variable of the same name.
For `production`, also add **Required reviewers** to the environment, so each
production deploy needs an approval.

**What each pipeline can do.** It acts as its own deployer service account
(`appointment-matchmaker-deploy` for dev, `am-prod-deploy` for production), which
has only this, each on one resource of its own environment:

| Permission | On | Why |
|---|---|---|
| `roles/artifactregistry.writer` | the environment's image repository | push the image |
| `roles/run.developer` | the environment's Cloud Run service | roll out a new revision |
| `roles/iam.serviceAccountUser` | the environment's runtime service account | a revision runs as that account |

Each environment has its own pool, because a grant matches every token of a pool.
The accounts can't read secrets, change IAM policies, create or delete services,
or touch the other environment. Only `main` of this repository can use them, and
the production one also requires the job to run in the `production` GitHub
Environment: pull requests, forks and the dev pipeline can't deploy to production.

**How it deploys.** It builds and pushes the image, deploys it as a new revision
with no traffic, and calls `/api/health` on that revision's own tagged URL. Only if
that answers `200 {"status":"ok"}` (the app is up and reaches its database) does it
send traffic to the revision, and then it checks `/api/health` on the live URL
again. If the check fails, the job fails and users stay on the previous revision.
Settings and secrets are not touched: change those with `./deploy/gcp/deploy.sh`.

## Troubleshooting

- **Error mentioning `allUsers` or `iam.allowedPolicyMemberDomains` while
  deploying:** your organization blocks public services. An organization admin can
  make an exception for the project. Otherwise, the app can only be opened by
  signed-in Google accounts.
- **Logs:**
  `gcloud run services logs read appointment-matchmaker --project=PROJECT_ID --region=us-east1`
- **Reset emails don't arrive:** look for `Could not send email` in the logs. Check
  that the sender is verified in Brevo and that the SMTP login and key are correct.

## Removing it

```sh
P=PROJECT_ID; R=us-east1; S=appointment-matchmaker
gcloud run services delete $S --project=$P --region=$R
gcloud artifacts repositories delete $S --project=$P --location=$R
gcloud secrets delete $S-database-url --project=$P
gcloud secrets delete $S-smtp-password --project=$P
gcloud iam service-accounts delete $S-run@$P.iam.gserviceaccount.com --project=$P
```

The Neon project and Brevo account are deleted from their own websites.
