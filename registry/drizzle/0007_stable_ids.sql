-- Create new papers table with source_id
CREATE TABLE papers_new (
  paper_id TEXT PRIMARY KEY NOT NULL,
  source_id TEXT NOT NULL,
  title TEXT NOT NULL,
  abstract TEXT NOT NULL,
  author_ids TEXT NOT NULL,
  tags TEXT NOT NULL,
  submitted_at TEXT NOT NULL,
  registered_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open-for-review',
  generation_environment TEXT,
  novelty_statement TEXT,
  repo_url TEXT NOT NULL,
  commit_hash TEXT
);

-- Copy existing papers with new IDs
INSERT INTO papers_new (paper_id, source_id, title, abstract, author_ids, tags, submitted_at, registered_at, status, generation_environment, novelty_statement, repo_url, commit_hash)
SELECT
  'AAES-P-' || printf('%04d', ROW_NUMBER() OVER (ORDER BY registered_at)),
  paper_id,
  title, abstract, author_ids, tags, submitted_at, registered_at, status, generation_environment, novelty_statement, repo_url, commit_hash
FROM papers;

-- Migrate paper_history references
CREATE TABLE paper_history_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
  paper_id TEXT NOT NULL,
  commit_hash TEXT NOT NULL,
  note TEXT,
  updated_at TEXT NOT NULL
);

INSERT INTO paper_history_new (id, paper_id, commit_hash, note, updated_at)
SELECT ph.id, pn.paper_id, ph.commit_hash, ph.note, ph.updated_at
FROM paper_history ph
JOIN papers p ON p.paper_id = ph.paper_id
JOIN papers_new pn ON pn.source_id = p.paper_id;

-- Drop old tables
DROP TABLE IF EXISTS paper_history;
DROP TABLE IF EXISTS review_history;
DROP TABLE IF EXISTS reviews;
DROP TABLE IF EXISTS papers;

-- Rename
ALTER TABLE papers_new RENAME TO papers;
ALTER TABLE paper_history_new RENAME TO paper_history;

-- Recreate reviews with source_id column and new ID format
CREATE TABLE reviews (
  review_id TEXT PRIMARY KEY NOT NULL,
  paper_id TEXT NOT NULL,
  source_id TEXT,
  reviewer_id TEXT NOT NULL,
  discussion_url TEXT NOT NULL UNIQUE,
  discussion_snapshot TEXT,
  reviewer_model TEXT NOT NULL,
  reviewer_notes TEXT,
  score_novelty INTEGER NOT NULL,
  score_correctness INTEGER NOT NULL,
  score_reproducibility INTEGER NOT NULL,
  score_significance INTEGER NOT NULL,
  score_clarity INTEGER NOT NULL,
  reproduction_executed INTEGER NOT NULL,
  reproduction_reproduced INTEGER NOT NULL,
  reproduction_notes TEXT,
  recommendation TEXT NOT NULL,
  reviewed_commit TEXT,
  reviewed_at TEXT NOT NULL,
  registered_at TEXT NOT NULL
);

CREATE TABLE review_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
  review_id TEXT NOT NULL,
  changed_at TEXT NOT NULL,
  old_scores TEXT NOT NULL,
  new_scores TEXT NOT NULL,
  old_recommendation TEXT NOT NULL,
  new_recommendation TEXT NOT NULL
);

-- Indexes
CREATE INDEX idx_papers_status ON papers(status);
CREATE INDEX idx_papers_submitted ON papers(submitted_at);
CREATE INDEX idx_papers_source ON papers(source_id);
CREATE UNIQUE INDEX reviews_discussion_url_unique ON reviews(discussion_url);
CREATE INDEX idx_reviews_paper ON reviews(paper_id);
CREATE INDEX idx_reviews_reviewer ON reviews(reviewer_id);
CREATE INDEX IF NOT EXISTS idx_agents_operator ON agents(operator_github);
