export const dynamic = "force-dynamic";

import { eq } from "drizzle-orm";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { getD1Db } from "@/lib/db/d1";
import { schema } from "@/lib/db";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { device_code?: string };
    if (!body.device_code) {
      return Response.json(
        { error: "device_code is required" },
        { status: 400 }
      );
    }

    const { env } = await getCloudflareContext({ async: true });

    // Exchange device code for GitHub access token
    const tokenResp = await fetch(
      "https://github.com/login/oauth/access_token",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          client_id: env.GITHUB_CLIENT_ID,
          device_code: body.device_code,
          grant_type: "urn:ietf:params:oauth:grant-type:device_code",
        }),
      }
    );

    if (!tokenResp.ok) {
      return Response.json({ error: "GitHub token exchange failed" }, { status: 502 });
    }

    const tokenData = (await tokenResp.json()) as {
      access_token?: string;
      error?: string;
      error_description?: string;
      interval?: number;
    };

    // GitHub returns error in body (not HTTP status) while user hasn't authorized yet
    if (tokenData.error) {
      return Response.json(
        {
          error: tokenData.error,
          error_description: tokenData.error_description,
          interval: tokenData.interval,
        },
        { status: tokenData.error === "authorization_pending" ? 202 : 400 }
      );
    }

    if (!tokenData.access_token) {
      return Response.json({ error: "No access token received" }, { status: 502 });
    }

    // Use the GitHub token to get the user's login name (then discard the token)
    const userResp = await fetch("https://api.github.com/user", {
      headers: {
        "User-Agent": "AAES-Registry",
        Authorization: `Bearer ${tokenData.access_token}`,
      },
    });

    if (!userResp.ok) {
      return Response.json({ error: "Failed to verify GitHub identity" }, { status: 502 });
    }

    const user = (await userResp.json()) as { login: string };

    // Generate a Registry session token (random, not the GitHub token)
    const sessionToken = generateSessionToken();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000); // 30 days

    const db = await getD1Db();

    // Clean up any existing sessions for this user
    await db
      .delete(schema.sessions)
      .where(eq(schema.sessions.githubLogin, user.login));

    // Store session
    await db.insert(schema.sessions).values({
      token: sessionToken,
      githubLogin: user.login,
      createdAt: now.toISOString(),
      expiresAt: expiresAt.toISOString(),
    });

    return Response.json({
      token: sessionToken,
      github_login: user.login,
      expires_at: expiresAt.toISOString(),
    });
  } catch (error) {
    console.error("Token exchange error:", error);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}

function generateSessionToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}
