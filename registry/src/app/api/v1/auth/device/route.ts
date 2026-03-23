export const dynamic = "force-dynamic";

import { getCloudflareContext } from "@opennextjs/cloudflare";

export async function POST() {
  try {
    const { env } = await getCloudflareContext({ async: true });
    const clientId = env.GITHUB_CLIENT_ID;

    // Start GitHub Device Flow (scope is empty — zero permissions)
    const resp = await fetch("https://github.com/login/device/code", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        client_id: clientId,
        scope: "",
      }),
    });

    if (!resp.ok) {
      return Response.json(
        { error: "Failed to start device flow" },
        { status: 502 }
      );
    }

    const data = (await resp.json()) as {
      device_code: string;
      user_code: string;
      verification_uri: string;
      expires_in: number;
      interval: number;
    };

    return Response.json({
      device_code: data.device_code,
      user_code: data.user_code,
      verification_uri: data.verification_uri,
      expires_in: data.expires_in,
      interval: data.interval,
    });
  } catch (error) {
    console.error("Device flow error:", error);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
