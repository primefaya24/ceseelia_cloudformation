# CLAUDE.md

AWS SAM (CloudFormation) backend for **Ceseelia**: a Primefaya Computer Services app. It deploys Cognito auth, a single-table DynamoDB database, an S3 storage bucket and Node.js Lambdas into `us-east-1`.

## Layout

```
template.yaml                         # SAM template — all infrastructure lives here
samconfig.toml                        # deploy configs: [dev] -> stack ceseelia-dev, [prod] -> ceseelia-prod
run.sh <env>                          # sam deploy --config-env <env>   (dev | prod)
run_local.sh                          # sam local start-api
.github/workflows/pipeline.yaml       # CI deploy on push
lambda/
  triggers/cognito/on-user-register/  # Cognito PostConfirmation trigger (app.js)
  layers/npm/nodejs/                  # npm dependency layer (package.json; node_modules gitignored)
  layers/custom/nodejs/node_modules/  # shared in-house libs, committed to git (NOT third-party)
    environment/index.js              # constants: entity names, GSI names, status/error codes, S3 keys, etc.
    dynamodb/dynamo-batch-ops/        # batched write/get helpers with retry of unprocessed items
    dynamodb/dynamo-entities/user/    # registerUser / peekUserByEmail
```

## Infrastructure (template.yaml)

Parameters: `StageName` (dev|prod), `ApiVersion` (v1), `NodeJsRuntime` (default `nodejs18.x`), `DomainName` (default `ceseelia.com`; drives the Cognito SES sender `support@<DomainName>` and must be a verified SES identity). Most resource names are suffixed with `${StageName}` and Lambdas also with `${ApiVersion}`.

- **Globals**: every function gets both layers, 128 MB, 30 s timeout, plus env vars `STAGE`, `REGION`, `TABLE_NAME` (`ceseelia_<stage>`), `S3_STORAGE_BUCKET`, `SECRET_STORAGE_BUCKET`, `PUBLIC_STORAGE_BUCKET`.
- **Layers**: `NodeModulesLayer` (npm) and `CustomLibrariesLayer` (custom). Lambdas import custom libs as bare modules, e.g. `require('dynamodb/dynamo-entities/user/index')`, `require('environment/index')`.
- **Cognito**: user pool `ceseelia-<stage>` with email as username, custom attribute `custom:userName`, SES email from `support@ceseelia.com`, a hosted domain `ceseelia-auth-<stage>`, and an app client with code/implicit OAuth that calls back to `comprimefayaceseeliawebviewcallback://` (mobile webview).
- **DynamoDB**: a single `GlobalTable` `ceseelia_<stage>`, pay-per-request, with `pk`/`sk` string keys and a `ttl` attribute. GSIs:
  - `CognitoIdentifierGSI` on `userCognitoId` (ALL)
  - `UserEmailGSI` on `userEmail` (KEYS_ONLY)
  - PITR must be enabled manually.
- **S3**: `ceseelia-storage-<stage>`, private, CORS GET/PUT from `*`.
- **Lambdas**: currently only `OnUserRegister` (Cognito `PostConfirmation`).

## Data model (single-table)

Keys are built from the `DYNAMO_ENTITY_*` constants in `environment/index.js`, joined with `#`:

| pk | sk | contents |
|---|---|---|
| `USER#<ulid>` | `PROFILE#INFO` | name, email, avatar, locale, plan, `isProfileComplete`, `userCreatedAt` |
| `USER#<ulid>` | `PROFILE#COGNITO_DATA#<cognitoSub>` | `userCognitoId`, `userEmail`, social provider info, `userDeactivated` |
| `USER#<ulid>` | `PROFILE#NOTIFICATION_SETTINGS` | `userFcmToken` |

On registration, a user with a known email but a new Cognito sub (e.g. a social login) gets an extra `COGNITO_DATA` item under the existing user. Otherwise a new ULID user is created with all three items in one batch.

## Deploy

- Local: `./run.sh dev` or `./run.sh prod` (uses AWS profile `default` and `samconfig.toml`). The artifacts bucket is `ceseelia-sam-artifacts`.
- CI: pushing to `dev_v1.0.0` deploys dev and pushing to `prod_v1.0.0` deploys prod. CI runs `npm install` in `lambda/layers/npm/nodejs` before `sam deploy` (SAM CLI pinned to 1.140.0).
- Run `sam validate` / `sam build` to check template changes.

## Conventions & gotchas

- New Lambdas follow `CodeUri: ./lambda/...`, `Handler: app.lambdaHandler`, `FunctionName: !Sub <Name>-ceseelia-${StageName}-${ApiVersion}`. The README's snippets for HTTP/WebSocket lambdas were copied from the "ReserveXpress" project. `lambda/api/...`, `HttpApi` and `WebsocketApi` **do not exist yet** in this repo, so adapt the names (`ReserveXpress` → `ceseelia`) and add the API resources first.
- Code is CommonJS JavaScript with the AWS SDK v3 (`@aws-sdk/*`). Add shared constants to `environment/index.js` instead of hardcoding them.
- `environment/index.js` still contains values from other Primefaya projects (e.g. `SES_DEFAULT_FROM_ADDRESS` = expeerium, `rx_` product ids). Check before relying on them.
- `.gitignore` excludes `**/npm/nodejs/node_modules/` but not the custom layer's `node_modules`, which is intentional.
- Runtime `nodejs18.x` is past AWS end-of-support, so consider bumping `NodeJsRuntime`.
- Never commit credentials. The README currently contains a plaintext test-account password that should be removed.
