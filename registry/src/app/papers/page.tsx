"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

type AvgScores = {
  novelty: number;
  correctness: number;
  reproducibility: number;
  significance: number;
  clarity: number;
} | null;

type Paper = {
  paper_id: string;
  title: string;
  abstract: string;
  author_ids: string[];
  tags: string[];
  status: string;
  submitted_at: string;
  review_count: number;
  avg_scores: AvgScores;
};

type PapersResponse = {
  total: number;
  page: number;
  per_page: number;
  papers: Paper[];
};

function paperIdToGithubUrl(paperId: string): string {
  const withoutPrefix = paperId.replace("github:", "");
  const parts = withoutPrefix.split("/");
  if (parts.length > 2) {
    // has path: owner/repo/path → github.com/owner/repo/tree/main/path
    const owner = parts[0];
    const repo = parts[1];
    const path = parts.slice(2).join("/");
    return `https://github.com/${owner}/${repo}/tree/main/${path}`;
  }
  // no path: owner/repo → github.com/owner/repo
  return `https://github.com/${withoutPrefix}`;
}

const STATUSES = [
  { value: "", label: "All statuses" },
  { value: "open-for-review", label: "Open for review" },
  { value: "under-review", label: "Under review" },
  { value: "peer-reviewed", label: "Peer reviewed" },
  { value: "contested", label: "Contested" },
];

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
      className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${colors[status] ?? "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"}`}
    >
      {status.replace(/-/g, " ")}
    </span>
  );
}

function ScorePill({ label, value }: { label: string; value: number }) {
  return (
    <span className="inline-flex items-center gap-1 rounded bg-zinc-100 px-1.5 py-0.5 text-xs text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
      <span className="font-medium">{label}</span>
      <span>{value}</span>
    </span>
  );
}

export default function PapersPage() {
  const [papers, setPapers] = useState<Paper[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [perPage] = useState(20);
  const [status, setStatus] = useState("");
  const [tag, setTag] = useState("");
  const [tagInput, setTagInput] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchPapers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      params.set("page", String(page));
      params.set("per_page", String(perPage));
      if (status) params.set("status", status);
      if (tag) params.set("tag", tag);

      const res = await fetch(`/api/v1/papers?${params.toString()}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: PapersResponse = await res.json();
      setPapers(data.papers);
      setTotal(data.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load papers");
    } finally {
      setLoading(false);
    }
  }, [page, perPage, status, tag]);

  useEffect(() => {
    fetchPapers();
  }, [fetchPapers]);

  const totalPages = Math.max(1, Math.ceil(total / perPage));

  function handleTagSearch(e: React.FormEvent) {
    e.preventDefault();
    setPage(1);
    setTag(tagInput.trim());
  }

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      <div className="mx-auto max-w-5xl px-4 py-12 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-8">
          <Link
            href="/"
            className="text-sm text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
          >
            &larr; Home
          </Link>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100">
            Papers
          </h1>
          <p className="mt-1 text-zinc-500 dark:text-zinc-400">
            Browse papers submitted to the AAES Registry.
          </p>
        </div>

        {/* Filters */}
        <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end">
          <div>
            <label
              htmlFor="status-filter"
              className="block text-sm font-medium text-zinc-700 dark:text-zinc-300"
            >
              Status
            </label>
            <select
              id="status-filter"
              value={status}
              onChange={(e) => {
                setStatus(e.target.value);
                setPage(1);
              }}
              className="mt-1 block w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
            >
              {STATUSES.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>
          <form onSubmit={handleTagSearch} className="flex gap-2">
            <div>
              <label
                htmlFor="tag-filter"
                className="block text-sm font-medium text-zinc-700 dark:text-zinc-300"
              >
                Tag
              </label>
              <input
                id="tag-filter"
                type="text"
                placeholder="e.g. machine-learning"
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                className="mt-1 block w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
              />
            </div>
            <button
              type="submit"
              className="mt-auto rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
            >
              Search
            </button>
          </form>
        </div>

        {/* Results */}
        {loading ? (
          <p className="py-12 text-center text-zinc-500 dark:text-zinc-400">
            Loading...
          </p>
        ) : error ? (
          <p className="py-12 text-center text-red-600 dark:text-red-400">
            {error}
          </p>
        ) : papers.length === 0 ? (
          <p className="py-12 text-center text-zinc-500 dark:text-zinc-400">
            No papers found.
          </p>
        ) : (
          <>
            <p className="mb-4 text-sm text-zinc-500 dark:text-zinc-400">
              {total} paper{total !== 1 ? "s" : ""} found
            </p>
            <div className="space-y-4">
              {papers.map((paper) => (
                <article
                  key={paper.paper_id}
                  className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm transition-shadow hover:shadow-md dark:border-zinc-800 dark:bg-zinc-900"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <a
                        href={`/papers/${paper.paper_id}`}
                        className="text-lg font-semibold text-zinc-900 hover:underline dark:text-zinc-100"
                      >
                        {paper.title}
                      </a>
                      <a
                        href={paperIdToGithubUrl(paper.paper_id)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
                      >
                        GitHub →
                      </a>
                    </div>
                    <StatusBadge status={paper.status} />
                  </div>

                  <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
                    {paper.author_ids
                      .map((id) => id.replace("gist:", "").slice(0, 8))
                      .join(", ")}
                  </p>

                  {paper.tags.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {paper.tags.map((t) => (
                        <span
                          key={t}
                          className="rounded-full border border-zinc-200 px-2 py-0.5 text-xs text-zinc-600 dark:border-zinc-700 dark:text-zinc-400"
                        >
                          {t}
                        </span>
                      ))}
                    </div>
                  )}

                  <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-zinc-500 dark:text-zinc-400">
                    <span>
                      Submitted{" "}
                      {new Date(paper.submitted_at).toLocaleDateString()}
                    </span>
                    <span>
                      {paper.review_count} review
                      {paper.review_count !== 1 ? "s" : ""}
                    </span>
                    {paper.avg_scores && (
                      <div className="flex flex-wrap gap-1">
                        <ScorePill label="N" value={paper.avg_scores.novelty} />
                        <ScorePill
                          label="C"
                          value={paper.avg_scores.correctness}
                        />
                        <ScorePill
                          label="R"
                          value={paper.avg_scores.reproducibility}
                        />
                        <ScorePill
                          label="S"
                          value={paper.avg_scores.significance}
                        />
                        <ScorePill
                          label="Cl"
                          value={paper.avg_scores.clarity}
                        />
                      </div>
                    )}
                  </div>
                </article>
              ))}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="mt-8 flex items-center justify-center gap-2">
                <button
                  disabled={page <= 1}
                  onClick={() => setPage((p) => p - 1)}
                  className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-40 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
                >
                  Previous
                </button>
                <span className="text-sm text-zinc-600 dark:text-zinc-400">
                  Page {page} of {totalPages}
                </span>
                <button
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => p + 1)}
                  className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-40 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
                >
                  Next
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
