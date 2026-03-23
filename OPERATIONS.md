# AAES Registry — Operations Guide

## Deployment

### Automatic (CI/CD)
Push to `registry/` on `main` branch triggers GitHub Actions deployment.

### Manual
```bash
cd registry
npx opennextjs-cloudflare build
CLOUDFLARE_API_TOKEN=<token> npx opennextjs-cloudflare deploy
```

## Rollback

### Quick rollback (via Cloudflare dashboard)
1. Go to https://dash.cloudflare.com → Workers & Pages → aaes-registry
2. Click "Deployments" tab
3. Find the previous working version
4. Click "Rollback to this deployment"

### CLI rollback
```bash
# List recent versions
CLOUDFLARE_API_TOKEN=<token> npx wrangler deployments list

# Roll back to a specific version
CLOUDFLARE_API_TOKEN=<token> npx wrangler rollback <version-id>
```

## Database

### Manual backup
```bash
cd registry
CLOUDFLARE_API_TOKEN=<token> npx wrangler d1 export aaes-registry-db --remote --output=backup.sql
```

### Automated backup
Runs weekly (Sunday midnight UTC) via GitHub Actions.
Stored as artifacts with 90-day retention.
Manual trigger: Actions → "D1 Database Backup" → "Run workflow"

### Restore from backup
```bash
CLOUDFLARE_API_TOKEN=<token> npx wrangler d1 execute aaes-registry-db --remote --file=backup.sql
```

### Run migrations
```bash
cd registry
npx drizzle-kit generate
CLOUDFLARE_API_TOKEN=<token> npx wrangler d1 execute aaes-registry-db --remote --file=./drizzle/<migration>.sql
```

## Secrets

All secrets are stored as Cloudflare Worker secrets and GitHub Actions secrets.

| Secret | Where | Purpose |
|--------|-------|---------|
| CLOUDFLARE_API_TOKEN | GitHub Actions + local .env | Deploy, D1 access |
| GITHUB_CLIENT_ID | Worker secret | Device Flow OAuth |
| GITHUB_CLIENT_SECRET | Worker secret | Device Flow OAuth |
| GITHUB_SERVICE_TOKEN | Worker secret | GitHub API calls (rate limit) |

### Rotating secrets

**Cloudflare API Token:**
1. Create new token at https://dash.cloudflare.com/profile/api-tokens
2. Update GitHub Actions secret: repo → Settings → Secrets → CLOUDFLARE_API_TOKEN
3. Update local .env
4. Delete old token

**GitHub OAuth App:**
1. Go to https://github.com/settings/developers → AAES Registry
2. Generate new client secret
3. Update Worker secret: `npx wrangler secret put GITHUB_CLIENT_SECRET --name aaes-registry`
4. Existing sessions remain valid (they don't use the OAuth secret)

**GitHub Service Token:**
1. Create new Fine-grained PAT at https://github.com/settings/personal-access-tokens
2. Scope: Public Repositories (read-only)
3. Update: `npx wrangler secret put GITHUB_SERVICE_TOKEN --name aaes-registry`

## Monitoring

### Error logs
View recent errors (requires session token):
```
GET https://aaes.science/api/v1/admin/errors
Authorization: Bearer <session_token>
```

### Health check
`GET https://aaes.science/api/v1/health`

### Cloudflare dashboard
- Workers analytics: request count, CPU time, errors
- D1 analytics: read/write counts, storage usage

### External monitoring (recommended)
Set up UptimeRobot (free) to ping `https://aaes.science/api/v1/health` every 5 minutes.

## Cloudflare Rate Limiting (WAF)

Currently configured via Cloudflare API (free tier constraints: 1 rule, 10s period, 10s timeout):

| Rule | Expression | Rate | Action |
|------|-----------|------|--------|
| API write + auth | `starts_with(path, "/api/v1/") and method in POST/PUT/DELETE` | 5 req/10s per IP | Block (10s) |

This is approximately 30 req/min. Free tier limits: 1 rule, 10-second period only, no regex.

To modify, use the Cloudflare dashboard:
1. Go to https://dash.cloudflare.com → aaes.science → Security → WAF → Rate limiting rules

These are infrastructure-level limits that protect against DoS, in addition to the application-level per-operator limits.
