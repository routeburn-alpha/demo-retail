/**
 * SDLC Core — the single source of step text shared by both runtimes.
 *
 * The human `/work-on-task` skill and the managed (headless) prompt both compose their step
 * instructions from these `render*()` functions. Edit a step here (and mirror the prose in
 * `core.md`) and it ripples to both consumers — that is the whole point: no drift.
 *
 * See FRAMEWORK.md (Opinion 1) and sdlc/core.md.
 */

export interface CoreEnv {
  /** Working directory. Human: '.'. Managed: the cloned workspace path. */
  wd: string;
}

const STORE_PATH = "standards"; // where the seeded standards live (see scripts/seed-standards.ts)

export function renderPickUpTask(): string {
  return [
    "Read the task spec, acceptance criteria, and the seeded standards returned with it.",
    "Restate the task name and acceptance criteria in one or two lines before doing anything else.",
  ].join("\n");
}

export function renderSyncDb(): string {
  return [
    "Apply the current schema and seed so the dev server and tests match `main`:",
    "  npm run db:push && npm run db:seed",
    "If either fails, ABORT and report the reason — without a working database the run is invalid,",
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
    "Remove `.only`. Run the full file, then the whole suite:",
    "  npm run test 2>&1 | tee logs/test-full.log",
    "Fix anything that broke.",
  ].join("\n");
}

export function renderPrecommitPipeline(): string {
  return [
    "Rebase on the latest main, then run the full gate — all three must be green:",
    "  npm run check && npm run build && npm run test",
  ].join("\n");
}

export function renderSubmit(): string {
  return [
    "Re-list every seeded standard and confirm the changeset meets it (the `confirmStandards`",
    "gate). Only after confirming all standards: open the PR and submit it for review.",
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
    "If the spec is genuinely ambiguous, STOP and ask rather than guessing. Human: ask the user.",
    "Managed: post a comment on the task and wait.",
  ].join("\n");
}

/** The ordered human-variant render pipeline, for reference / composition. */
export const HUMAN_STEPS = [
  renderPickUpTask,
  renderSyncDb,
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
