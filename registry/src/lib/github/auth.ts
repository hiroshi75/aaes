import { eq } from "drizzle-orm";
import { getD1Db } from "@/lib/db/d1";
import { schema } from "@/lib/db";

export function extractBearerToken(request: Request): string | null {
  const authHeader = request.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;
  return authHeader.slice(7);
}

export interface AuthResult {
  authenticated: boolean;
  githubLogin?: string;
  error?: string;
}

/**
 * Verify a Registry session token and return the authenticated GitHub login.
 * The token is a Registry-issued session token, NOT a GitHub token.
 */
export async function verifySession(token: string): Promise<AuthResult> {
  try {
    const db = await getD1Db();
    const session = await db.query.sessions.findFirst({
      where: eq(schema.sessions.token, token),
    });

    if (!session) {
      return { authenticated: false, error: "Invalid session token" };
    }

    if (new Date(session.expiresAt) < new Date()) {
      // Clean up expired session
      await db.delete(schema.sessions).where(eq(schema.sessions.token, token));
      return { authenticated: false, error: "Session expired" };
    }

    return { authenticated: true, githubLogin: session.githubLogin };
  } catch {
    return { authenticated: false, error: "Session verification failed" };
  }
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

/**
 * Get the service token for server-side GitHub API calls.
 * Falls back to unauthenticated if not configured.
 */
export async function getServiceToken(): Promise<string | null> {
  try {
    const { getCloudflareContext } = await import("@opennextjs/cloudflare");
    const { env } = await getCloudflareContext({ async: true });
    return env.GITHUB_SERVICE_TOKEN || null;
  } catch {
    return null;
  }
}
