export function extractBearerToken(request: Request): string | null {
  const authHeader = request.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;
  return authHeader.slice(7);
}

export function githubHeaders(token?: string | null): Record<string, string> {
  const headers: Record<string, string> = {
    "User-Agent": "AAES-Registry",
    Accept: "application/vnd.github.v3+json",
  };
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }
  return headers;
}
