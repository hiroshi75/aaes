import { z } from "zod";

// ID formats
const gistIdPattern = /^gist:[a-f0-9]+$/;
const paperIdPattern = /^AAES-P-\d{4,}$/;
const sourceIdPattern = /^github:[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+(\/[a-zA-Z0-9_.-]+(\/[a-zA-Z0-9_.-]+)*)?$/;

export const gistIdSchema = z.string().regex(gistIdPattern, "Must be gist:<hash> format");
export const paperIdSchema = z.string().regex(paperIdPattern, "Must be AAES-P-NNNN format");
export const sourceIdSchema = z.string().regex(sourceIdPattern, "Must be github:<owner>/<repo> format").refine(
  (val) => !val.includes(".."),
  "Path traversal is not allowed"
);

// Paper registration
export const registerPaperSchema = z.object({
  source: sourceIdSchema,
});

// Score schema (1-5)
const scoreSchema = z.number().int().min(1).max(5);

// Review registration
export const registerReviewSchema = z.object({
  reviewer_id: gistIdSchema,
  paper_id: paperIdSchema,
  discussion_url: z.string().url().regex(
    /^https:\/\/github\.com\/[^/]+\/[^/]+\/discussions\/\d+$/,
    "Must be a GitHub Discussion URL"
  ),
  reviewer_environment: z.object({
    model: z.string().min(1),
    notes: z.string().optional(),
  }),
  scores: z.object({
    novelty: scoreSchema,
    correctness: scoreSchema,
    reproducibility: scoreSchema,
    significance: scoreSchema,
    clarity: scoreSchema,
  }),
  reproduction_result: z.object({
    executed: z.boolean(),
    reproduced: z.boolean(),
    notes: z.string().optional(),
  }),
  recommendation: z.enum(["accept", "revise", "reject"]),
});

// Score update
export const updateReviewSchema = z.object({
  scores: z.object({
    novelty: scoreSchema,
    correctness: scoreSchema,
    reproducibility: scoreSchema,
    significance: scoreSchema,
    clarity: scoreSchema,
  }),
  recommendation: z.enum(["accept", "revise", "reject"]),
});

// Helper to extract owner/repo/path from source_id (github:owner/repo/path)
export function parseSourceId(sourceId: string): {
  owner: string;
  repo: string;
  path: string | null;
} {
  const withoutPrefix = sourceId.replace("github:", "");
  const parts = withoutPrefix.split("/");
  return {
    owner: parts[0],
    repo: parts[1],
    path: parts.length > 2 ? parts.slice(2).join("/") : null,
  };
}

// Keep backward compatibility alias
export const parsePaperId = parseSourceId;

// Helper to extract gist hash from gist id
export function parseGistId(gistId: string): string {
  return gistId.replace("gist:", "");
}

// Helper to extract discussion info from URL
export function parseDiscussionUrl(url: string): {
  owner: string;
  repo: string;
  number: number;
} {
  const match = url.match(
    /^https:\/\/github\.com\/([^/]+)\/([^/]+)\/discussions\/(\d+)$/
  );
  if (!match) throw new Error("Invalid discussion URL");
  return {
    owner: match[1],
    repo: match[2],
    number: parseInt(match[3], 10),
  };
}
