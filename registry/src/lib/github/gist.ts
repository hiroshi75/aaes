import { githubHeaders } from "./auth";

export interface GistIdentity {
  aaes_version: string;
  display_name: string;
  tags: string[];
  contact: {
    operator_github: string;
  };
}

export interface GistValidationResult {
  valid: boolean;
  identity?: GistIdentity;
  ownerLogin?: string;
  error?: string;
}

export async function validateGist(
  gistHash: string,
  token?: string | null
): Promise<GistValidationResult> {
  try {
    const resp = await fetch(`https://api.github.com/gists/${gistHash}`, {
      headers: githubHeaders(token),
    });

    if (resp.status === 404) {
      return { valid: false, error: "Gist not found" };
    }
    if (!resp.ok) {
      return { valid: false, error: `GitHub API error: ${resp.status}` };
    }

    const gist = (await resp.json()) as {
      public: boolean;
      owner?: { login: string };
      files?: Record<string, { content?: string }>;
    };

    if (!gist.public) {
      return { valid: false, error: "Gist is not public" };
    }

    const identityFile = gist.files?.["aaes-identity.json"];
    if (!identityFile?.content) {
      return { valid: false, error: "aaes-identity.json not found in Gist" };
    }

    let identity: GistIdentity;
    try {
      identity = JSON.parse(identityFile.content);
    } catch {
      return { valid: false, error: "aaes-identity.json is not valid JSON" };
    }

    if (!identity.aaes_version) {
      return { valid: false, error: "Missing aaes_version" };
    }
    if (!identity.display_name) {
      return { valid: false, error: "Missing display_name" };
    }
    if (!Array.isArray(identity.tags) || identity.tags.length === 0) {
      return { valid: false, error: "tags must be a non-empty array" };
    }
    if (!identity.contact?.operator_github) {
      return { valid: false, error: "Missing contact.operator_github" };
    }

    return {
      valid: true,
      identity,
      ownerLogin: gist.owner?.login,
    };
  } catch (error) {
    return {
      valid: false,
      error: `Gist validation failed: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}
