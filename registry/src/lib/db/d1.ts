import { getCloudflareContext } from "@opennextjs/cloudflare";
import { getDb } from "./index";

export async function getD1Db() {
  const { env } = await getCloudflareContext({ async: true });
  return getDb(env.DB as unknown as D1Database);
}
