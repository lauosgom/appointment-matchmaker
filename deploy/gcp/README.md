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

1. Sign up at https://neon.com and create a project. Pick the region
   **AWS US East 1 (N. Virginia)**, which is close to the Cloud Run region
   `us-east1`.
2. On the project dashboard, click **Connect**. Turn **Connection pooling off**, then
   copy the connection string. It looks like
   `postgresql://user:password@ep-….us-east-1.aws.neon.tech/neondb?sslmode=require`.
   Keep it private: it gives full access to the data.

## 3. Email: Brevo

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

Fill in `PROJECT_ID`, `SMTP_USERNAME` (the Brevo SMTP login) and `MAIL_FROM` (the
verified sender). `config.env` is in `.gitignore`, so it isn't committed. It holds no
passwords: the script asks for those.

## 5. Deploy

```sh
./deploy/gcp/deploy.sh
```

The first run:

1. Enables the Cloud Run, Artifact Registry and Secret Manager APIs.
2. Creates the image repository (`appointment-matchmaker`) and the service account
   (`appointment-matchmaker-run`).
3. Asks for the **Neon connection string** and the **Brevo SMTP key**, and stores
   them in Secret Manager.
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

The production database starts empty. From the `backend/` folder, using the Neon
connection string:

```sh
cd backend
DATABASE_URL='postgresql://…neon.tech/neondb?sslmode=require' \
  uv run python -m app.manage create-admin --username ana --full-name "Ana Pérez" --email ana@example.org
```

It asks for the password. The email is used for password recovery. Then open the
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
