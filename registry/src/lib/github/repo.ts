import { githubHeaders } from "./auth";

interface MetadataJson {
  aaes_version: string;
  title: string;
  abstract: string;
  author_ids: string[];
  submitted_at: string;
  tags: string[];
  generation_environment: Record<string, unknown>;
  novelty_statement: string;
}

export interface RepoValidationResult {
  valid: boolean;
  metadata?: MetadataJson;
  commitHash?: string;
  error?: string;
}

// Recommended headings (not enforced at validation time).
// Authors are free to structure their paper.md as they see fit;
// the structure below is a suggestion for consistency.
const RECOMMENDED_HEADINGS = [
  "Abstract",
  "Introduction",
  "Methodology",
  "Results",
  "Discussion",
  "References",
];

async function fetchRawFile(
  owner: string,
  repo: string,
  filePath: string,
  token?: string | null
): Promise<string | null> {
  // Use GitHub API (authenticated) for raw content
  const resp = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/contents/${filePath}`,
    {
      headers: {
        ...githubHeaders(token),
        Accept: "application/vnd.github.v3.raw",
      },
    }
  );
  if (!resp.ok) return null;
  return resp.text();
}

export async function validateRepo(
  owner: string,
  repo: string,
  path: string | null,
  token?: string | null
): Promise<RepoValidationResult> {
  const headers = githubHeaders(token);

  // 1. Check repo is public and has discussions enabled
  try {
    const resp = await fetch(`https://api.github.com/repos/${owner}/${repo}`, { headers });

    if (!resp.ok) {
      return { valid: false, error: "Repository not found" };
    }

    const repoData = (await resp.json()) as { private: boolean; has_discussions: boolean };

    if (repoData.private) {
      return { valid: false, error: "Repository is not public" };
    }
    if (!repoData.has_discussions) {
      return { valid: false, error: "GitHub Discussions is not enabled" };
    }
  } catch {
    return { valid: false, error: "Repository not found" };
  }

  const basePath = path ? `${path}/` : "";

  // 2. Check metadata.json
  const metaContent = await fetchRawFile(owner, repo, `${basePath}metadata.json`, token);
  if (metaContent === null) {
    return { valid: false, error: "metadata.json not found" };
  }

  let metadata: MetadataJson;
  try {
    metadata = JSON.parse(metaContent);
  } catch {
    return { valid: false, error: "metadata.json is not valid JSON" };
  }

  // Validate metadata fields
  const requiredFields: (keyof MetadataJson)[] = [
    "aaes_version",
    "title",
    "abstract",
    "author_ids",
    "submitted_at",
    "tags",
    "generation_environment",
    "novelty_statement",
  ];

  for (const field of requiredFields) {
    if (!metadata[field]) {
      return { valid: false, error: `metadata.json missing field: ${field}` };
    }
  }

  if (!Array.isArray(metadata.author_ids) || metadata.author_ids.length === 0) {
    return { valid: false, error: "author_ids must be a non-empty array" };
  }

  const gistPattern = /^gist:[a-f0-9]+$/;
  for (const id of metadata.author_ids) {
    if (!gistPattern.test(id)) {
      return { valid: false, error: `Invalid author_id format: ${id}` };
    }
  }

  if (!Array.isArray(metadata.tags) || metadata.tags.length === 0) {
    return { valid: false, error: "tags must be a non-empty array" };
  }

  // 3. Check paper.md exists (structure is recommended, not enforced)
  const paperContent = await fetchRawFile(owner, repo, `${basePath}paper.md`, token);
  if (paperContent === null) {
    return { valid: false, error: "paper.md not found" };
  }

  // 4. Check reproduction/README.md exists
  const reproContent = await fetchRawFile(owner, repo, `${basePath}reproduction/README.md`, token);
  if (reproContent === null) {
    return { valid: false, error: "reproduction/README.md not found" };
  }

  // 5. Get latest commit hash for immutable reference
  let commitHash: string | undefined;
  try {
    const commitsResp = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/commits?per_page=1`,
      { headers: githubHeaders(token) }
    );
    if (commitsResp.ok) {
      const commits = (await commitsResp.json()) as Array<{ sha: string }>;
      if (commits.length > 0) {
        commitHash = commits[0].sha;
      }
    }
  } catch {
    // Non-fatal: commit hash is best-effort
  }

  return { valid: true, metadata, commitHash };
}
