interface CloudflareEnv {
  DB: D1Database;
  GITHUB_CLIENT_ID: string;
  GITHUB_CLIENT_SECRET: string;
  GITHUB_SERVICE_TOKEN?: string; // PAT for server-side GitHub API calls (rate limit: 5000/hr)
}
