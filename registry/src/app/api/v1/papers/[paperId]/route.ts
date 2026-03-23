export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { getD1Db } from "@/lib/db/d1";
import { schema } from "@/lib/db";
import {
  extractBearerToken,
  verifySession,
  getServiceToken,
  githubHeaders,
} from "@/lib/github/auth";
import { validateGist } from "@/lib/github/gist";
import { parseSourceId, parseGistId } from "@/lib/validation/schemas";

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ paperId: string }> }
) {
  try {
    const { paperId } = await params;

    const token = extractBearerToken(request);
    if (!token) {
      return Response.json(
        { error: "Authorization header with Bearer token is required" },
        { status: 401 }
      );
    }

    const auth = await verifySession(token);
    if (!auth.authenticated) {
      return Response.json({ error: auth.error }, { status: 401 });
    }

    const db = await getD1Db();

    // Look up the paper
    const paper = await db.query.papers.findFirst({
      where: eq(schema.papers.paperId, paperId),
    });
    if (!paper) {
      return Response.json({ error: "Paper not found" }, { status: 404 });
    }

    // Verify authenticated user is an author of the paper
    const authorIds: string[] = JSON.parse(paper.authorIds);
    const serviceToken = await getServiceToken();
    let authenticatedUserIsAuthor = false;

    for (const authorId of authorIds) {
      const gistHash = parseGistId(authorId);
      const gistResult = await validateGist(gistHash, serviceToken);
      if (
        gistResult.valid &&
        gistResult.identity!.contact.operator_github.toLowerCase() ===
          auth.githubLogin!.toLowerCase()
      ) {
        authenticatedUserIsAuthor = true;
        break;
      }
    }

    if (!authenticatedUserIsAuthor) {
      return Response.json(
        { error: "Authenticated user is not an author of this paper" },
        { status: 403 }
      );
    }

    // Parse request body
    const body = (await request.json()) as { note?: string };
    const note: string | null = body.note || null;

    // Fetch current HEAD commit from GitHub
    const { owner, repo } = parseSourceId(paper.sourceId);
    const commitRes = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/commits?per_page=1`,
      { headers: githubHeaders(serviceToken) }
    );

    if (!commitRes.ok) {
      return Response.json(
        { error: "Failed to fetch latest commit from GitHub" },
        { status: 502 }
      );
    }

    const commits = await commitRes.json();
    if (!Array.isArray(commits) || commits.length === 0) {
      return Response.json(
        { error: "No commits found in repository" },
        { status: 400 }
      );
    }

    const latestCommit = commits[0].sha as string;

    // If commit hash is the same, no update needed
    if (paper.commitHash === latestCommit) {
      return Response.json({
        paper_id: paperId,
        message: "no changes detected",
        commit_hash: latestCommit,
      });
    }

    const now = new Date().toISOString();

    // Save old hash to paper_history
    if (paper.commitHash) {
      await db.insert(schema.paperHistory).values({
        paperId,
        commitHash: paper.commitHash,
        note,
        updatedAt: now,
      });
    }

    // Update paper's commit hash (and un-retract if retracted)
    const wasRetracted = paper.status === "retracted";
    const updateFields: Record<string, string> = { commitHash: latestCommit };
    if (wasRetracted) {
      updateFields.status = "open-for-review";
    }

    await db
      .update(schema.papers)
      .set(updateFields)
      .where(eq(schema.papers.paperId, paperId));

    return Response.json({
      paper_id: paperId,
      previous_commit: paper.commitHash,
      new_commit: latestCommit,
      note,
      updated_at: now,
      ...(wasRetracted ? { status_changed: "open-for-review", message: "Paper un-retracted and reopened for review" } : {}),
    });
  } catch (error) {
    console.error("Paper update error:", error);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ paperId: string }> }
) {
  try {
    const { paperId } = await params;

    const token = extractBearerToken(request);
    if (!token) {
      return Response.json(
        { error: "Authorization header with Bearer token is required" },
        { status: 401 }
      );
    }

    const auth = await verifySession(token);
    if (!auth.authenticated) {
      return Response.json({ error: auth.error }, { status: 401 });
    }

    const db = await getD1Db();

    // Look up the paper
    const paper = await db.query.papers.findFirst({
      where: eq(schema.papers.paperId, paperId),
    });
    if (!paper) {
      return Response.json({ error: "Paper not found" }, { status: 404 });
    }

    // Verify authenticated user is an author of the paper
    const authorIds: string[] = JSON.parse(paper.authorIds);
    const serviceToken = await getServiceToken();
    let authenticatedUserIsAuthor = false;

    for (const authorId of authorIds) {
      const gistHash = parseGistId(authorId);
      const gistResult = await validateGist(gistHash, serviceToken);
      if (
        gistResult.valid &&
        gistResult.identity!.contact.operator_github.toLowerCase() ===
          auth.githubLogin!.toLowerCase()
      ) {
        authenticatedUserIsAuthor = true;
        break;
      }
    }

    if (!authenticatedUserIsAuthor) {
      return Response.json(
        { error: "Authenticated user is not an author of this paper" },
        { status: 403 }
      );
    }

    // Set paper status to retracted
    await db
      .update(schema.papers)
      .set({ status: "retracted" })
      .where(eq(schema.papers.paperId, paperId));

    return Response.json({
      paper_id: paperId,
      status: "retracted",
    });
  } catch (error) {
    console.error("Paper retraction error:", error);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
