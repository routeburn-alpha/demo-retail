/**
 * SDLC Core — the single source of step text.
 *
 * ONE sequence, for whoever is working the task: a person driving Claude Code in a checkout, or an
 * agent launched into a cloud sandbox. It used to be two — a "human variant" and a "managed
 * variant" — and the split was the problem, not a feature. The managed variant was described in
 * prose but never existed in code (there was no `MANAGED_STEPS` and nothing imported this file),
 * so a launched agent read the human one and was told to claim a task it had already been given,
 * to abort unless HEAD was an agent branch, to resolve its identity from a worktree settings file,
 * and to wait for a human approval that was never coming. The runs that worked did so by
 * disobeying those steps.
 *
 * Where the environment genuinely differs, the step says so in one line. It does not fork.
 *
 * See FRAMEWORK.md (Opinion 1) and sdlc/core.md.
 */

export interface CoreEnv {
  /** Working directory: '.' in a local checkout, the workspace path in a sandbox. */
  wd: string;
}

const STORE_PATH = "standards"; // where the seeded standards live (see scripts/seed-standards.ts)

export function renderPickUpTask(): string {
  return [
    "If you were given a task number, that is your task: read it with `get_task`. Only if you were",
    "not given one, claim the oldest ready task with `work_on_next_task`.",
    "Read the spec, acceptance criteria, and the seeded standards returned with it.",
    "Restate the task name and acceptance criteria in one or two lines before doing anything else.",
  ].join("\n");
}

/**
 * The storefront reads its catalogue from Postgres, so a run without a database serves 500s and
 * silently SKIPS 20 tests — the whole `security` project among them, which then reports green
 * having verified nothing. One command owns getting there.
 *
 * No "is it already done?" check here. Every run starts on a fresh machine — there is nothing to
 * have already done it. (A prior version checked for a marker file first, copied from a different
 * deployment shape where a sandbox really is reused across tasks. Here it never existed to find,
 * so the check always failed and the agent always fell through to running warm.sh anyway — a dead
 * branch that cost a turn asking a question with one answer.)
 */
export function renderPrepareEnvironment({ wd }: CoreEnv): string {
  return [
    `Run the one entry point: \`bash ${wd}/.studio-ai/warm.sh\``,
    "If it fails, ABORT and report the reason — without a working database the run is invalid,",
    "regardless of how small the change is.",
  ].join("\n");
}

export function renderReadArchitecture({ wd }: CoreEnv): string {
  return [
    `Read the relevant section of ${wd}/ARCHITECTURE.md for the feature you are changing.`,
    'State in one sentence: "This task changes {what} in {where}. The user-visible outcome is {what}."',
  ].join("\n");
}

export function renderSizeTheTask(): string {
  return [
    "Classify the task: `size: small` (single-file fix, copy tweak, isolated change) or",
    "`size: non-trivial` (multiple files, new route/handler, schema change, server+UI coordination).",
    "If unsure, treat as non-trivial.",
  ].join("\n");
}

export function renderPlanAndSelfChallenge(): string {
  return [
    "Produce a one-paragraph test plan: file path, test level (component / server-db / pure unit),",
    "the single assertion that proves the user-visible outcome, and setup/teardown.",
    "",
    `Then self-challenge the plan against EVERY seeded standard (source: ${STORE_PATH}/). One row per`,
    "standard — this is a mandatory gate, not a formality:",
    "",
    "| Standard | Plan respects it? | Adjustment if not |",
    "|----------|-------------------|-------------------|",
    "| {title}  | yes / no / N/A    | {how the plan changes, or '—'} |",
    "",
    "Apply every adjustment. If the plan changed materially, restate it. Do NOT write production",
    "code until this table is complete.",
  ].join("\n");
}

export function renderBehaviorChangeBranch(): string {
  return [
    "If the change is docs-only, config-only, or a pure rename: state explicitly",
    '"No behavior change — skipping test." with a one-line reason, and skip to check + build.',
  ].join("\n");
}

export function renderImpactPass({ wd }: CoreEnv): string {
  return [
    "For contract changes (add/remove a required field, rename an exported symbol, change a",
    "signature, remove a query/handler): grep ALL callsites BEFORE writing the test.",
    `  grep -rn "<symbol>" --include="*.ts" --include="*.svelte" ${wd}/src`,
    "Second pass when the symbol crosses a boundary: naming-convention shifts (DB snake_case →",
    "TS camelCase, URL kebab-case) and service-layer wrappers. Edit all affected files in one batch",
    "during Implement. Skipping this turns one precommit round into N.",
  ].join("\n");
}

export function renderWriteFailingTest(): string {
  return [
    "Write the test as planned. Add `.only`. Run it and pipe to a file:",
    "  npm run test 2>&1 | tee logs/test-output.log",
    "Read the log and paste the failure VERBATIM. A green run here means the test is broken —",
    "redesign it.",
  ].join("\n");
}

export function renderImplement(): string {
  return [
    "Write the minimum code to make the test pass. Iterate against the test.",
    "Edit any callsites identified in the impact pass in the same change.",
  ].join("\n");
}

export function renderBroadenTests(): string {
  return [
    "Remove `.only`. Do NOT run the whole suite here — the ship script runs it with check and",
    "build as one gate. Running it in both places is the same suite twice for no new information.",
  ].join("\n");
}

export function renderPrecommitPipeline({ wd }: CoreEnv): string {
  return [
    "One command commits, rebases on main, runs check + build + test, and pushes — failing closed:",
    `  bash ${wd}/scripts/precommit.sh "<commit message>"`,
    "",
    "It prints one line per phase; full output goes to logs/precommit-<phase>.log. A non-zero exit names",
    "the phase that failed with the tail of its log — fix it and run again. Re-running amends, so",
    "the branch keeps one commit however many rounds it takes.",
    "",
    "Do not hand-run the three commands first, and never push by hand. The sequence is fixed and",
    "has no judgement in it, which is exactly why it is a script and not eight of your turns.",
  ].join("\n");
}

export function renderSubmit(): string {
  return [
    "Re-list every seeded standard and confirm the changeset meets it (the `confirmStandards`",
    "gate). Use the standards returned with the task — do not re-read them off disk, you have them.",
    "Only after confirming all standards: ship, then call `finalize_task` with the branch, which",
    "opens the PR and moves the task to review.",
    "",
    "You do not merge. Review and merge belong to a person, whether or not one is watching now, so",
    "the run ends at `finalize_task` — there is nothing to wait for.",
  ].join("\n");
}

export function renderBuildReport(): string {
  return [
    "Post a build report with three sections:",
    "  - How did we implement it? (one short paragraph — the actual shape of the change)",
    "  - Decisions made that weren't in the spec (judgement calls, defaults chosen)",
    "  - Learnings (SDLC / UX / tech-design / tech-debt)",
    "Omit any section with no real content. NEVER create follow-on tasks autonomously — list",
    "candidates as bullets in the learnings section.",
  ].join("\n");
}

export function renderAmbiguity(): string {
  return [
    "If the spec is genuinely ambiguous, STOP and ask rather than guessing: post the question as a",
    "comment on the task with `create_comment`. Say it in the session too, in case someone is",
    "watching — but the comment is what reaches whoever answers.",
  ].join("\n");
}

/** The ordered step sequence. One pipeline, whoever is working the task. */
export const STEPS = [
  renderPickUpTask,
  renderPrepareEnvironment,
  renderReadArchitecture,
  renderSizeTheTask,
  renderPlanAndSelfChallenge,
  renderBehaviorChangeBranch,
  renderImpactPass,
  renderWriteFailingTest,
  renderImplement,
  renderBroadenTests,
  renderPrecommitPipeline,
  renderSubmit,
  renderBuildReport,
  renderAmbiguity,
] as const;
