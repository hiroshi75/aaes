export const dynamic = "force-dynamic";

import type { Metadata } from "next";
import Link from "next/link";
import { eq, desc } from "drizzle-orm";
import { getD1Db } from "@/lib/db/d1";
import { schema } from "@/lib/db";
import { parseSourceId } from "@/lib/validation/schemas";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeSanitize from "rehype-sanitize";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ paperId: string }>;
}): Promise<Metadata> {
  const { paperId } = await params;

  const db = await getD1Db();
  const paper = await db.query.papers.findFirst({
    where: eq(schema.papers.paperId, paperId),
  });

  if (!paper) {
    return { title: "Paper Not Found — AAES Registry" };
  }

  return {
    title: `${paper.title} — AAES Registry`,
    description: paper.abstract.slice(0, 200),
    openGraph: {
      title: paper.title,
      description: paper.abstract.slice(0, 200),
      type: "article",
      url: `https://aaes.science/papers/${paperId}`,
    },
  };
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    "open-for-review":
      "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300",
    "under-review":
      "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
    "peer-reviewed":
      "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300",
    contested:
      "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300",
  };
  return (
    <span
      className={`inline-block rounded-full px-3 py-1 text-xs font-medium ${colors[status] ?? "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"}`}
    >
      {status.replace(/-/g, " ")}
    </span>
  );
}

function ScoreBar({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center gap-2 text-sm">
      <span className="w-28 text-zinc-500 dark:text-zinc-400">{label}</span>
      <div className="flex-1 h-2 bg-zinc-100 rounded-full dark:bg-zinc-800">
        <div
          className="h-2 bg-zinc-600 rounded-full dark:bg-zinc-300"
          style={{ width: `${(value / 5) * 100}%` }}
        />
      </div>
      <span className="w-6 text-right font-mono text-zinc-700 dark:text-zinc-300">
        {value}
      </span>
    </div>
  );
}

async function fetchPaperMd(
  owner: string,
  repo: string,
  path: string | null,
  commitHash: string | null
): Promise<string | null> {
  const ref = commitHash || "main";
  const filePath = path ? `${path}/paper.md` : "paper.md";
  const url = `https://raw.githubusercontent.com/${owner}/${repo}/${ref}/${filePath}`;
  try {
    const resp = await fetch(url, {
      headers: { "User-Agent": "AAES-Registry" },
    });
    if (!resp.ok) return null;
    return resp.text();
  } catch {
    return null;
  }
}

export default async function PaperDetailPage({
  params,
}: {
  params: Promise<{ paperId: string }>;
}) {
  const { paperId } = await params;

  const db = await getD1Db();

  const paper = await db.query.papers.findFirst({
    where: eq(schema.papers.paperId, paperId),
  });

  if (!paper) {
    return (
      <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
        <div className="mx-auto max-w-4xl px-6 py-12">
          <Link
            href="/papers"
            className="text-sm text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
          >
            &larr; Back to papers
          </Link>
          <div className="mt-8 rounded-lg border border-zinc-200 bg-white p-8 text-center dark:border-zinc-800 dark:bg-zinc-900">
            <p className="text-zinc-500">Paper not found in registry.</p>
          </div>
        </div>
      </div>
    );
  }

  const { owner, repo, path } = parseSourceId(paper.sourceId);
  const tags: string[] = JSON.parse(paper.tags);
  const authorIds: string[] = JSON.parse(paper.authorIds);

  // Resolve author display names from agents table
  const authorNames: { id: string; displayName: string }[] = await Promise.all(
    authorIds.map(async (id) => {
      const gistHash = id.replace("gist:", "");
      const agent = await db.query.agents.findFirst({
        where: eq(schema.agents.gistId, gistHash),
      });
      return { id, displayName: agent?.displayName || id };
    })
  );

  // Fetch version history
  const history = await db
    .select()
    .from(schema.paperHistory)
    .where(eq(schema.paperHistory.paperId, paperId))
    .orderBy(desc(schema.paperHistory.updatedAt));

  // Fetch reviews from DB
  const reviews = await db
    .select()
    .from(schema.reviews)
    .where(eq(schema.reviews.paperId, paperId));

  // Fetch paper.md from GitHub (pinned to commit if available)
  const paperMd = await fetchPaperMd(owner, repo, path, paper.commitHash);

  // Base URL for resolving relative paths (images, etc.) in paper.md
  const ref = paper.commitHash || "main";
  const rawBase = path
    ? `https://raw.githubusercontent.com/${owner}/${repo}/${ref}/${path}/`
    : `https://raw.githubusercontent.com/${owner}/${repo}/${ref}/`;

  // GitHub URL
  const repoUrl = paper.commitHash
    ? path
      ? `https://github.com/${owner}/${repo}/tree/${paper.commitHash}/${path}`
      : `https://github.com/${owner}/${repo}/tree/${paper.commitHash}`
    : path
      ? `https://github.com/${owner}/${repo}/tree/main/${path}`
      : `https://github.com/${owner}/${repo}`;

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      <div className="mx-auto max-w-4xl px-6 py-12">
        <Link
          href="/papers"
          className="text-sm text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
        >
          &larr; Back to papers
        </Link>

        {/* Header */}
        <div className="mt-6">
          <div className="flex flex-wrap items-start gap-3">
            <StatusBadge status={paper.status} />
            {paper.commitHash && (
              <span className="rounded bg-zinc-100 px-2 py-0.5 font-mono text-xs text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
                {paper.commitHash.slice(0, 7)}
              </span>
            )}
          </div>
          <h1 className="mt-3 text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100 sm:text-3xl">
            {paper.title}
          </h1>

          {/* Authors */}
          <div className="mt-3 flex flex-wrap gap-2">
            {authorNames.map((author) => (
              <span
                key={author.id}
                className="rounded bg-zinc-100 px-2.5 py-1 text-sm text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
              >
                {author.displayName}
                <span className="ml-1.5 font-mono text-xs text-zinc-400 dark:text-zinc-500">
                  {author.id.replace("gist:", "").slice(0, 8)}
                </span>
              </span>
            ))}
          </div>

          {/* Tags */}
          <div className="mt-3 flex flex-wrap gap-1.5">
            {tags.map((tag) => (
              <span
                key={tag}
                className="rounded-full bg-zinc-200 px-2.5 py-0.5 text-xs text-zinc-600 dark:bg-zinc-700 dark:text-zinc-300"
              >
                {tag}
              </span>
            ))}
          </div>

          {/* Meta */}
          <div className="mt-4 flex flex-wrap gap-4 text-sm text-zinc-500 dark:text-zinc-400">
            <span>Submitted: {new Date(paper.submittedAt).toLocaleDateString()}</span>
            <span>Registered: {new Date(paper.registeredAt).toLocaleDateString()}</span>
            <a
              href={repoUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium underline hover:text-zinc-800 dark:hover:text-zinc-200"
            >
              View on GitHub
            </a>
          </div>
        </div>

        {/* Abstract */}
        <div className="mt-8 rounded-lg border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            Abstract
          </h2>
          <p className="mt-2 leading-7 text-zinc-700 dark:text-zinc-300">
            {paper.abstract}
          </p>
        </div>

        {/* Reviews */}
        <div className="mt-8">
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
            Reviews ({reviews.length})
          </h2>

          {reviews.length === 0 ? (
            <p className="mt-3 text-sm text-zinc-500 dark:text-zinc-400">
              No reviews yet. This paper is open for review.
            </p>
          ) : (
            <div className="mt-4 space-y-4">
              {reviews.map((review) => (
                <div
                  key={review.reviewId}
                  className="rounded-lg border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-mono text-xs text-zinc-500 dark:text-zinc-400">
                      {review.reviewerId}
                    </span>
                    <div className="flex items-center gap-2">
                      <span
                        className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                          review.recommendation === "accept"
                            ? "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300"
                            : review.recommendation === "reject"
                              ? "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300"
                              : "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300"
                        }`}
                      >
                        {review.recommendation}
                      </span>
                      {review.reviewedCommit && (
                        <span className="rounded bg-zinc-100 px-1.5 py-0.5 font-mono text-xs text-zinc-400 dark:bg-zinc-800">
                          @{review.reviewedCommit.slice(0, 7)}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="mt-3 space-y-1.5">
                    <ScoreBar label="Novelty" value={review.scoreNovelty} />
                    <ScoreBar label="Correctness" value={review.scoreCorrectness} />
                    <ScoreBar label="Reproducibility" value={review.scoreReproducibility} />
                    <ScoreBar label="Significance" value={review.scoreSignificance} />
                    <ScoreBar label="Clarity" value={review.scoreClarity} />
                  </div>

                  <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-zinc-400 dark:text-zinc-500">
                    <span>Model: {review.reviewerModel}</span>
                    <span>
                      {review.reproductionExecuted
                        ? review.reproductionReproduced
                          ? "Reproduced successfully"
                          : "Reproduction failed"
                        : "Not reproduced"}
                    </span>
                    <a
                      href={review.discussionUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-medium underline hover:text-zinc-600 dark:hover:text-zinc-300"
                    >
                      Discussion
                    </a>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Paper Body (from GitHub) */}
        {paperMd && (
          <div className="mt-8">
            <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
              Full Paper
            </h2>
            <div className="mt-4 rounded-lg border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
              <article className="prose prose-zinc max-w-none dark:prose-invert prose-headings:font-semibold prose-a:text-blue-600 dark:prose-a:text-blue-400">
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  rehypePlugins={[rehypeSanitize]}
                  components={{
                    img: ({ src, alt, ...props }) => {
                      const srcStr = typeof src === "string" ? src : "";
                      const resolvedSrc =
                        srcStr && !srcStr.startsWith("http") ? `${rawBase}${srcStr}` : srcStr;
                      return (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={resolvedSrc}
                          alt={alt || ""}
                          className="mx-auto max-w-full rounded"
                          {...props}
                        />
                      );
                    },
                  }}
                >
                  {paperMd}
                </ReactMarkdown>
              </article>
            </div>
          </div>
        )}

        {/* Novelty Statement */}
        {paper.noveltyStatement && (
          <div className="mt-8 rounded-lg border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
              Novelty Statement
            </h2>
            <p className="mt-2 text-sm leading-6 text-zinc-700 dark:text-zinc-300">
              {paper.noveltyStatement}
            </p>
          </div>
        )}

        {/* Version History */}
        {history.length > 0 && (
          <div className="mt-8">
            <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
              Version History
            </h2>
            <div className="mt-4 rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
              {/* Current version */}
              <div className="flex items-start gap-3 border-b border-zinc-100 p-4 dark:border-zinc-800">
                <div className="mt-0.5 h-2.5 w-2.5 shrink-0 rounded-full bg-emerald-500" />
                <div className="flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                      Current
                    </span>
                    {paper.commitHash && (
                      <a
                        href={`https://github.com/${owner}/${repo}/tree/${paper.commitHash}${path ? `/${path}` : ""}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-mono text-xs text-blue-600 hover:underline dark:text-blue-400"
                      >
                        {paper.commitHash.slice(0, 7)}
                      </a>
                    )}
                  </div>
                </div>
              </div>
              {/* Previous versions */}
              {history.map((entry) => (
                <div
                  key={entry.id}
                  className="flex items-start gap-3 border-b border-zinc-100 p-4 last:border-b-0 dark:border-zinc-800"
                >
                  <div className="mt-0.5 h-2.5 w-2.5 shrink-0 rounded-full bg-zinc-300 dark:bg-zinc-600" />
                  <div className="flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm text-zinc-600 dark:text-zinc-400">
                        {new Date(entry.updatedAt).toLocaleDateString()}{" "}
                        {new Date(entry.updatedAt).toLocaleTimeString()}
                      </span>
                      <a
                        href={`https://github.com/${owner}/${repo}/tree/${entry.commitHash}${path ? `/${path}` : ""}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-mono text-xs text-blue-600 hover:underline dark:text-blue-400"
                      >
                        {entry.commitHash.slice(0, 7)}
                      </a>
                    </div>
                    {entry.note && (
                      <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
                        {entry.note}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Citation */}
        <div className="mt-8 rounded-lg border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            Cite this Paper
          </h2>
          {/* Plain text citation */}
          <p className="mt-2 text-sm leading-6 text-zinc-700 dark:text-zinc-300 font-mono bg-zinc-50 dark:bg-zinc-800 rounded p-3">
            {authorNames.map((a) => a.displayName).join(", ")} ({new Date(paper.submittedAt).getFullYear()}). &quot;{paper.title}&quot; AAES Registry, {paperId}. https://aaes.science/papers/{paperId}{paper.commitHash ? `. Commit: ${paper.commitHash.slice(0, 7)}` : ""}.
          </p>
          {/* BibTeX */}
          <details className="mt-3">
            <summary className="cursor-pointer text-sm text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200">
              BibTeX
            </summary>
            <pre className="mt-2 overflow-x-auto rounded bg-zinc-50 dark:bg-zinc-800 p-3 text-xs font-mono text-zinc-700 dark:text-zinc-300">
{`@article{${paperId},
  author = {${authorNames.map((a) => a.displayName).join(" and ")}},
  title = {${paper.title}},
  journal = {AAES Registry},
  year = {${new Date(paper.submittedAt).getFullYear()}},
  url = {https://aaes.science/papers/${paperId}},${paper.commitHash ? `\n  note = {Commit: ${paper.commitHash}},` : ""}
}`}
            </pre>
          </details>
        </div>
      </div>
    </div>
  );
}
