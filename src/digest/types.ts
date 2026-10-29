// Plan morning-digest § 1. The contract every part of § 2 builds on.

export type RunStatus = 'ok' | 'retry' | 'fail';

// One line of runs/<night>.jsonl, after parsing.
export type RunLine = {
  at: string;
  job: string;
  status: RunStatus;
  owner: string | null;
  error?: string;
};

// One row per job. Times keep the offset from the log.
export type DigestRow = {
  job: string;
  owner: string | null;
  runs: number;
  retries: number;
  lastStatus: RunStatus;
  lastError: string | null;
  firstAt: string;
  lastAt: string;
};

export type StatusCounts = Record<RunStatus, number>;

export type Night = {
  night: string;
  // Sorted by job. The page and the JSON both show them in this order (ADR 0001).
  rows: DigestRow[];
  // Lines per status, over the whole night.
  counts: StatusCounts;
  // Lines that did not parse. Counted, never thrown.
  badLines: number;
};

// null: no file for that night (or not a YYYY-MM-DD night).
export type ReadNight = (runsDir: string, night: string) => Night | null;
