import { githubHeaders } from "./auth";

export interface DiscussionValidationResult {
  valid: boolean;
  authorLogin?: string;
  error?: string;
}

const DISCUSSION_QUERY = `
  query($owner: String!, $name: String!, $number: Int!) {
    repository(owner: $owner, name: $name) {
      discussion(number: $number) {
        author {
          login
        }
        category {
          name
        }
      }
    }
  }
`;

export async function validateDiscussion(
  owner: string,
  repo: string,
  discussionNumber: number,
  token?: string | null
): Promise<DiscussionValidationResult> {
  try {
    const headers = githubHeaders(token);
    headers["Content-Type"] = "application/json";

    const resp = await fetch("https://api.github.com/graphql", {
      method: "POST",
      headers,
      body: JSON.stringify({
        query: DISCUSSION_QUERY,
        variables: { owner, name: repo, number: discussionNumber },
      }),
    });

    if (!resp.ok) {
      return { valid: false, error: `GraphQL API error: ${resp.status}` };
    }

    const result = (await resp.json()) as {
      data?: {
        repository?: {
          discussion?: {
            author: { login: string };
            category: { name: string };
          };
        };
      };
      errors?: Array<{ message: string }>;
    };

    if (result.errors?.length) {
      return { valid: false, error: result.errors[0].message };
    }

    const discussion = result.data?.repository?.discussion;
    if (!discussion) {
      return { valid: false, error: "Discussion not found" };
    }

    if (discussion.category.name !== "AAES-Review") {
      return {
        valid: false,
        error: `Discussion is in category "${discussion.category.name}", expected "AAES-Review"`,
      };
    }

    return {
      valid: true,
      authorLogin: discussion.author.login,
    };
  } catch {
    return { valid: false, error: "Failed to fetch discussion" };
  }
}
