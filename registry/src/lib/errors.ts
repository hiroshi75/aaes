import { getD1Db } from "./db/d1";
import { schema } from "./db";

export async function logError(endpoint: string, method: string, error: unknown): Promise<void> {
  try {
    const db = await getD1Db();
    const message = error instanceof Error ? error.message : String(error);
    await db.insert(schema.errorLogs).values({
      endpoint,
      method,
      errorMessage: message.slice(0, 1000), // truncate to prevent huge entries
      occurredAt: new Date().toISOString(),
    });
  } catch {
    // Don't throw from error logger
    console.error("Failed to log error:", error);
  }
}
