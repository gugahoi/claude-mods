export type PrBarChecks = { passed: number; failed: number; pending: number }

/** One check run or status, bucketed as `gh pr checks` does. */
export type PrBarCheck = { name: string; result: keyof PrBarChecks; url: string }

/** An unresolved review thread and its first comment's first line. */
export type PrBarThread = { path: string; line: number | null; author: string; body: string; url: string }

export type PrBarPr = {
  number: number
  title: string
  url: string
  state: 'draft' | 'open' | 'merged' | 'closed'
  checks: PrBarChecks
  /** every check, failed first, then pending, then passed */
  checkRuns: PrBarCheck[]
  /** reviewDecision in words ("review required"), '' when GitHub has none */
  review: string
  threads: PrBarThread[]
}

/** null: draw nothing (not a repo, detached, default branch, gh failing) */
export type PrBarSnapshot = { branch: string; isDirty: boolean; pr: PrBarPr | null }

declare module 'claude-code' {
  interface PluginState {
    'pr-bar': { snapshot: PrBarSnapshot | null }
  }
}
