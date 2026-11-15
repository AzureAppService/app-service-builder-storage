# Configure FileVault with CLI or ARM

Run from your fork's root. Use a dedicated DEV/TEST group, approved prices/capacity and explicit subscription.
The [README](../README.md) remains authoritative for network boundaries, visitor sign-in and file verification.
Do not run creation templates over an existing configured app.

## Provision resources and identity with Bicep

Set `SUBSCRIPTION`, `RG`, unique new `APP` and `STORAGE` names. Sign in with Azure CLI and create the dedicated group in West US 2.

```bash
az deployment group create --subscription "$SUBSCRIPTION" -g "$RG" \
  --name filevault-storage --template-file infra/main.bicep \
  --parameters storageAccountName="$STORAGE" location=westus2
az deployment group create --subscription "$SUBSCRIPTION" -g "$RG" \
  --name filevault-app --template-file infra/app.bicep --parameters appName="$APP"
```

Wait for terminal success and committed identity; `builder app identity show --name "$APP" -s "$SUBSCRIPTION" -g "$RG"` shows its principal ID.
For the ARM-only path, GET the app ARM URL below and inspect `identity` and `properties.identityUpdate` instead.
Check `builder app status` if an identity operation is pending. Grant only the selected container:

```bash
PRINCIPAL="<committed-app-principal-id>"
az deployment group create --subscription "$SUBSCRIPTION" -g "$RG" \
  --name filevault-app-role --template-file infra/role.bicep \
  --parameters storageAccountName="$STORAGE" principalId="$PRINCIPAL"
```

Configure required visitor sign-in/allowed testers before code deployment. The template sets `APP_ACCESS_MODE=builder`; it does not authorize visitors.
Copy root `connection.json` to ignored `.local/connection.json` and replace the account resource ID, endpoint and container with deployment outputs.
Prepare the private workspace with `umask 077; mkdir -p .local; cp connection.json .local/connection.json`.
Keep `AZURE_STORAGE_BLOB_ENDPOINT` and `AZURE_STORAGE_CONTAINER`; no credential or `AZURE_CLIENT_ID` is needed.

## Add with native Builder CLI

Requires a release whose `builder app connections --help` lists these commands; older archives require the ARM path below.

```bash
builder login
builder app connections list --name "$APP" -s "$SUBSCRIPTION" -g "$RG" --json
builder app connections add --name "$APP" -s "$SUBSCRIPTION" -g "$RG" --connection-json '@.local/connection.json'
builder app connections status --name "$APP" -s "$SUBSCRIPTION" -g "$RG" --connection-name blob
```

The Bicep role grant above already supplies Contributor. Alternatively, `add --grant-access --write-access` explicitly requests that same container-scoped grant with confirmation; do not repeat it unnecessarily.
`update --connection-json` replaces one complete object; `remove --connection-name blob` removes pending configuration only. Neither deploys or removes external grants.

## Add with ARM instead

Use Bash and `jq`; keep `.local/` private and out of Git/screenshots. Review the complete resulting list before PATCH.

```bash
APP_ARM="https://management.azure.com/subscriptions/$SUBSCRIPTION/resourceGroups/$RG/providers/Microsoft.Web/builderApps/$APP"
APP_URL="$APP_ARM?api-version=2026-09-01-preview"
az rest --method get --url "$APP_URL" > .local/app.json
ETAG="$(jq -er .etag .local/app.json)"
jq --slurpfile next .local/connection.json '
  {properties:{versionConfiguration:{connections:
    ((.properties.versionConfiguration.connections // [] |
      map(select((.name|ascii_downcase) != ($next[0].name|ascii_downcase)))) + $next)}}}
' .local/app.json > .local/update.json
az rest --method patch --url "$APP_URL" --headers "If-Match=$ETAG" --body @.local/update.json
az rest --method get --url "$APP_URL" --query properties.versionConfiguration.connections
```

On 412 refresh/reconcile; never remove the ETag guard. Variables, source, scaling and unrelated connections are preserved.
For existing variable-based apps, remove conflicting routing entries without deploying before saving the connection; do not reconstruct secret values from ordinary GET metadata.

## Deploy and verify

Use the chosen GitHub source, or create `git archive --format=zip --output=../filevault-source.zip HEAD` and deploy with `builder app deploy --name "$APP" -s "$SUBSCRIPTION" -g "$RG" --source-archive ../filevault-source.zip --manifest ./builder.yaml --json`.
Saving does not deploy. Do not use retained `--version`/`--previous`.
Wait for success and use the README's authenticated upload/list/byte-exact-download/delete checks.
The diagram displays registered Connections, not variables-only dependencies or access proof.
