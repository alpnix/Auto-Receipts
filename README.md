# Auto-Receipts
Upload your receipts and get instant transcription and Excel in the format you desire

## Local setup (AWS credentials)

This app calls **Amazon Bedrock** from the server route `POST /api/transcribe`. Your browser never talks to AWS directly.

### Important note about “API keys”

For Bedrock Runtime, the supported/authenticated path is **AWS credentials (SigV4)** (SSO/STS/IAM roles/access keys). A `Bearer <API_KEY>` header like your Python snippet is not how the AWS SDK for Bedrock authenticates.

### Recommended: AWS SSO / `aws login`

1) Refresh credentials:

```bash
aws sso login --profile YOUR_PROFILE
# or (for the newer "login" profiles)
aws login --profile YOUR_PROFILE
```

2) Run the dev server with that profile + required env:

```bash
export AWS_PROFILE=YOUR_PROFILE
export AWS_SDK_LOAD_CONFIG=1
export AWS_REGION=us-east-1
export BEDROCK_MODEL_ID=us.anthropic.claude-3-5-haiku-20241022-v1:0
npm run dev
```

If you see “Your session has expired. Please reauthenticate.”, re-run the login command and restart `npm run dev`.

### Access keys (IAM user) / temporary STS keys

```bash
export AWS_ACCESS_KEY_ID=...
export AWS_SECRET_ACCESS_KEY=...
export AWS_SESSION_TOKEN=... # only if using temporary creds
export AWS_REGION=us-east-1
export BEDROCK_MODEL_ID=...
npm run dev
```
