import Link from "next/link";

export default async function PaperDetailPage({
  params,
}: {
  params: Promise<{ paperId: string }>;
}) {
  const { paperId } = await params;

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      <div className="mx-auto max-w-4xl px-4 py-12 sm:px-6 lg:px-8">
        {/* Back link */}
        <div className="mb-8">
          <Link
            href="/papers"
            className="text-sm text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
          >
            &larr; Back to papers
          </Link>
        </div>

        {/* Placeholder content */}
        <div className="rounded-lg border border-zinc-200 bg-white p-8 dark:border-zinc-800 dark:bg-zinc-900">
          <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100">
            Paper detail page
          </h1>
          <p className="mt-3 text-zinc-600 dark:text-zinc-400">
            Paper ID:{" "}
            <code className="rounded bg-zinc-100 px-1.5 py-0.5 font-mono text-sm dark:bg-zinc-800">
              {decodeURIComponent(paperId)}
            </code>
          </p>
          <p className="mt-4 text-sm text-zinc-500 dark:text-zinc-400">
            Full paper metadata, reviews, and scores will be displayed here once
            the server-side data fetching is implemented.
          </p>
        </div>
      </div>
    </div>
  );
}
