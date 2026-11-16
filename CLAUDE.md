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

Parameters: `StageName` (dev|prod), `ApiVersion` (v1), `NodeJsRuntime` (default `nodejs22.x`; not 24.x, which dropped callback handlers), `DomainName` (default `ceseelia.com`; drives the Cognito SES sender `support@<DomainName>` and must be a verified SES identity), `AlarmEmail` (optional; the pipeline passes the `ALARM_EMAIL` repo variable). Most resource names are suffixed with `${StageName}` and Lambdas also with `${ApiVersion}`.

- **Globals**: every function gets both layers, 128 MB, 30 s timeout, plus env vars `STAGE`, `REGION`, `TABLE_NAME` (`ceseelia_<stage>`), `S3_STORAGE_BUCKET`, `SECRET_STORAGE_BUCKET`, `PUBLIC_STORAGE_BUCKET`.
- **Layers**: `NodeModulesLayer` (npm) and `CustomLibrariesLayer` (custom). Lambdas import custom libs as bare modules, e.g. `require('dynamodb/dynamo-entities/user/index')`, `require('environment/index')`.
- **Cognito**: user pool `ceseelia-<stage>` (deletion protection ACTIVE, `Retain`) with email as username, custom attribute `custom:userName`, SES email from `support@ceseelia.com`, a hosted domain `ceseelia-auth-<stage>`, and an app client with code/implicit OAuth that calls back to `comprimefayaceseeliawebviewcallback://` (mobile webview).
- **DynamoDB**: a single `GlobalTable` `ceseelia_<stage>`, pay-per-request, with `pk`/`sk` string keys and a `ttl` attribute. GSIs:
  - `CognitoIdentifierGSI` on `userCognitoId` (ALL)
  - `UserEmailGSI` on `userEmail` (KEYS_ONLY)
  - PITR on and deletion protection on (per replica), `DeletionPolicy: Retain` (9.6).
- **S3**: `ceseelia-storage-<stage>`, private (public access block), versioned (old versions expire after 30 days, `ExpireOldVersions`), `Retain`, CORS GET/PUT/POST from `*` (the backend's image uploads are presigned POSTs). Lifecycle rule `ExpireUnsavedUploads` deletes objects tagged `ceseelia-upload=pending` after 1 day; the backend tags every upload and clears the tag when a store, category or item saves it.
- **Lambdas**: currently only `OnUserRegister` (Cognito `PostConfirmation`), with `DynamoDBCrudPolicy` on this stage's table only.
- **Logs & alarms (9.6)**: log group `/ceseelia/<stage>/api` (30 days; the API server's Docker `awslogs` driver writes to it), metric filter `{ $.level >= 50 }` → `Ceseelia/<stage>` `ApiErrors`; SNS topic `ceseelia-alarms-<stage>` (email subscription only if `AlarmEmail`); alarms: API errors ≥ 5 in 5 min, DynamoDB throttles and system errors, sign-up trigger errors, and (prod only, account-wide) SES bounce > 3% and complaint > 0.05%.
- **Webapp hosting (L.9):** private bucket `ceseelia-webapp-<stage>` (OAC, bucket policy for this distribution only), CloudFront `WebappDistribution` at `app.<DomainName>` (prod) / `dev.<DomainName>` (dev), pay as you go, `PriceClass_200` (Asia edges for the `id` locale), HTTP/2+3, IPv6, managed `CachingOptimized` + `WebappSecurityHeadersPolicy` (HSTS, nosniff, `X-Frame-Options: DENY`, referrer policy and the Content-Security-Policy, S.14: scripts only from the site, network only to the API, Cognito and the stage's upload bucket, images from `<stage>.storage`; also on the custom-domain distribution. A new external host the webapp calls must be added there), Route53 A/AAAA aliases. Parameters `HostedZoneId` and `CertificateArn` default to the hand-made `ceseelia.com` zone and `*.ceseelia.com` certificate. The CloudFront function `WebappRouterFunction` (viewer request, `cloudfront-js-2.0`) sends app routes to `/index.html`, refuses `/api/*`, and sends link-preview bots asking for `/s/<slug>[?item=<id>]` to the `api` origin's `/api/v1/store/public/preview/<slug>[/<id>]` (`cf.selectRequestOriginById`; the rewritten path is the cache key, so bots and people never share a copy). Outputs `WebappBucketName`, `WebappDistributionId`, `WebappUrl`, used by the webapp's `tools/deploy-s3.sh`. **Store subdomains (prod, backend 9.8 phase 1):** the distribution also answers `*.<DomainName>` (wildcard alias + `WebappStoresDnsA`/`AAAA`, prod only; names with their own records win), and the router function gives bots the preview for `/` on `<slug>.<DomainName>` (`AppHost` / `StoreSuffix` substituted in; `StoreSuffix` empty in dev, since the certificate doesn't cover `*.dev`).
- **Custom domains (prod only, backend 9.8 phase 2):** `CustomDomainDistribution` is a separate multi-tenant (`ConnectionMode: tenant-only`) distribution with the webapp's bucket, origins, caching and headers, on `CustomDomainConnectionGroup` (IPv6 there; no aliases or price class on a multi-tenant distribution). The API creates one distribution tenant per store domain (`shop.theirbrand.com`) with a CloudFront-managed certificate. Merchants CNAME to `domains.<DomainName>`, a plain CNAME (not an alias, so CloudFront can follow the chain) to the connection group's routing endpoint, plus `_cf-challenge.domains.<DomainName>` TXT. `CustomDomainRouterFunction` gives link-preview bots `/api/v1/store/public/preview-domain/<host>`. `CustomDomainServerPolicy` (managed policy attached to the hand-made `CeseeliaServerRole`) lets the API manage tenants and their ACM certificates. Outputs `CustomDomainDistributionId`, `CustomDomainConnectionGroupId` (the API's env) and `CustomDomainRoutingEndpoint`.
- **Not in the template (made by hand):** the `Admins` Cognito group, the `ceseelia/<stage>` secrets, `CeseeliaServerRole` (policy in `../ceseelia_backend/iam/`), the SES identity, the Route53 zone, the `*.ceseelia.com` certificate and the two storage distributions (`dev.storage` E8SFI5FKFAVHN, `prod.storage` E289Z2HUNRVP02, OAC, `PriceClass_All`). Adding them here would fail on "already exists" unless they're imported first.

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
- CI: pushing to `dev_v1.0.0` deploys dev and pushing to `prod_v1.0.0` deploys prod, after `cfn-lint` passes (errors fail; warnings allowed). CI runs `npm install` in `lambda/layers/npm/nodejs` before `sam deploy` (SAM CLI pinned to 1.140.0).
- Run `sam validate` / `sam build` to check template changes.

## Conventions & gotchas

- New Lambdas follow `CodeUri: ./lambda/...`, `Handler: app.lambdaHandler`, `FunctionName: !Sub <Name>-ceseelia-${StageName}-${ApiVersion}`. The README's snippets for HTTP/WebSocket lambdas were copied from the "ReserveXpress" project. `lambda/api/...`, `HttpApi` and `WebsocketApi` **do not exist yet** in this repo, so adapt the names (`ReserveXpress` → `ceseelia`) and add the API resources first.
- Code is CommonJS JavaScript with the AWS SDK v3 (`@aws-sdk/*`). Add shared constants to `environment/index.js` instead of hardcoding them.
- `environment/index.js` still contains values from other Primefaya projects (e.g. `SES_DEFAULT_FROM_ADDRESS` = expeerium, `rx_` product ids). Check before relying on them.
- `.gitignore` excludes `**/npm/nodejs/node_modules/` but not the custom layer's `node_modules`, which is intentional.
- Never commit credentials. The README currently contains a plaintext test-account password that should be removed.
