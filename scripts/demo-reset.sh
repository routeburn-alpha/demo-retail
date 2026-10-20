#!/usr/bin/env bash
#
# demo-reset.sh — return the repo to the "before" state of a demo.
#
# Two demos, each pinned to its own baseline tag:
#   fuzzy search (default)  — type a typo ("jckt" / "jaket") into storefront search, get zero
#                             results, watch the agent build typo tolerance. "Before" means search
#                             is EXACT-MATCH ONLY: tag demo-baseline/search-exact.
#   cart → checkout         — (--checkout, docs/DEMO-CHECKOUT.md) the storefront has no way to buy
#                             anything. "Before" means src/ has no cart/checkout/orders code:
#                             tag demo-baseline/checkout.
#
# This is deliberately repeatable — the feature is meant to be built and reset
# over and over, so "reset" must not depend on nobody having shipped it.
#
# Four kinds of state are in play:
#   1. Code     — current branch pinned to origin/main, then the demo's files forced
#                 back to the baseline tag, and any file the baseline does not have
#                 removed. Self-healing: if the feature ever lands on main — inline
#                 or as a new module — this still restores "before".
#   2. Branches — optionally delete a throwaway demo branch (local + remote),
#                 which drops its Vercel preview.
#   3. DB       — optionally reseed a LOCAL database (--seed) so the low-stock badge
#                 renders, or undo one checkout run (--db-since) on any database.
#   4. Studio   — reset through demo-reset-studio.ts (MCP); prints a manual
#                 checklist when Studio can't be reached.
#
# Usage:
#   scripts/demo-reset.sh                       # per-run reset (code + verify)
#   scripts/demo-reset.sh <branch>              # also delete that demo branch + its preview
#   scripts/demo-reset.sh --checkout            # reset the cart → checkout demo instead
#   scripts/demo-reset.sh --checkout --db-since <RUN_START>
#                                               # also undo that run's stock, orders and carts
#   scripts/demo-reset.sh --seed [<branch>]     # pre-flight: also reseed DB + low-stock (local DB only)
#   scripts/demo-reset.sh --check               # verify only, change nothing (exit 1 if not baseline)
#   scripts/demo-reset.sh --force               # proceed even if unrelated files are dirty
#   scripts/demo-reset.sh --no-verify           # skip the test-based verification (faster)
#   scripts/demo-reset.sh --no-studio           # leave the Studio idea/task state alone

set -euo pipefail

# This script runs `git reset --hard`, which can rewrite THIS FILE while bash is
# still reading it — bash reads scripts incrementally, so a length change mid-run
# makes it resume at the wrong byte offset. Re-exec from an immutable snapshot.
if [ "${DEMO_RESET_REEXEC:-0}" != "1" ]; then
  SNAPSHOT="$(mktemp -t demo-reset.XXXXXX)"
  cp "$0" "$SNAPSHOT"
  export DEMO_RESET_REEXEC=1
  bash "$SNAPSHOT" "$@"
  STATUS=$?
  rm -f "$SNAPSHOT"
  exit $STATUS
fi

BASELINE_BRANCH="origin/main"
BASELINE_TAG="demo-baseline/search-exact"
CHECKOUT_TAG="demo-baseline/checkout"

# Checkout touches files all over src/ — new routes, a Mailer port, the header's cart count, the
# product page's add-to-cart — so it is restored by diffing ALL of src/ against its tag rather than
# by a list of paths. The cost: real work that lands on main after the tag is reverted too, so the
# tag must be re-pointed when it does (docs/DEMO-CHECKOUT.md, pre-flight).
CHECKOUT_DIR=src

# The demo's blast radius: the only files whose "before" state the demo depends on.
SEARCH_FILES=(
  src/lib/storefront/search.ts
  src/lib/storefront/search.test.ts
)

# The directory those files live in. A hardcoded file list can only ever check files someone
# remembered to add to it, so a capability arriving as a NEW file is invisible to it — that is
# how src/lib/storefront/fuzzy.ts survived two clean resets (#1128). The directory is watched for
# *added* paths only; diffing the whole of it would also flag unrelated modules that legitimately
# change (category.ts, reorder.ts) and the reset would revert real work.
SEARCH_DIR=src/lib/storefront

DO_SEED=0
DO_CHECK=0
DO_VERIFY=1
DO_STUDIO=1
DO_CHECKOUT=0
DB_SINCE=""
FORCE=0
DEMO_BRANCH=""

while [ $# -gt 0 ]; do
  case "$1" in
    --seed)      DO_SEED=1 ;;
    --check)     DO_CHECK=1 ;;
    --checkout)  DO_CHECKOUT=1 ;;
    --db-since)  DB_SINCE="${2:?--db-since needs the run start time, e.g. 2026-10-20T09:00:00Z}"; shift ;;
    --no-verify) DO_VERIFY=0 ;;
    --no-studio) DO_STUDIO=0 ;;
    --force)     FORCE=1 ;;
    -h|--help)   sed -n '2,38p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    --*)         echo "Unknown flag: $1" >&2; exit 2 ;;
    *)           DEMO_BRANCH="$1" ;;
  esac
  shift
done

if [ -n "$DB_SINCE" ] && [ "$DO_CHECKOUT" -eq 0 ]; then
  echo "✗ --db-since undoes a checkout run; use it with --checkout" >&2
  exit 2
fi

if [ "$DO_CHECKOUT" -eq 1 ]; then
  BASELINE_TAG="$CHECKOUT_TAG"
  DEMO_NAME="checkout demo"
  DEMO_PATHS=("$CHECKOUT_DIR")
else
  DEMO_NAME="fuzzy-search demo"
  DEMO_PATHS=("${SEARCH_FILES[@]}")
fi

cd "$(git rev-parse --show-toplevel)"
CURRENT_BRANCH="$(git rev-parse --abbrev-ref HEAD)"

# The DATABASE_URL db:seed will actually use: the environment first, then .env.local, then .env —
# the same precedence as the dotenv calls in scripts/seed.ts.
database_url() {
  if [ -n "${DATABASE_URL:-}" ]; then
    echo "$DATABASE_URL"
    return
  fi
  local f line
  for f in .env.local .env; do
    line="$(grep -m1 '^DATABASE_URL=' "$f" 2>/dev/null || true)"
    if [ -n "$line" ]; then
      line="${line#DATABASE_URL=}"
      line="${line%\"}"; line="${line#\"}"
      echo "$line"
      return
    fi
  done
}

# ---------------------------------------------------------------------------
# verify_baseline — is the working tree actually in the "before" state?
#
# Compares against the pinned tag and greps for fuzzy symbols, then (unless
# --no-verify) runs two behavioural checks: the search unit tests and the
# security standards.
#
# The tests are the real check: the baseline suite asserts that search('jaket')
# returns [], so a green run proves typo tolerance is genuinely absent, rather
# than just proving a particular identifier is missing. The security check does
# the same job for a leak, and is the only check here NOT scoped to $SEARCH_DIR
# — which is exactly why it exists (#1131).
# ---------------------------------------------------------------------------
verify_baseline() {
  local failed=0

  # 0. Residue, and ONLY in --check mode. The behavioural checks below cannot see dead code: it
  #    never runs, so nothing leaks and every test stays green. It still ruins the demo — an agent
  #    asked to build the capability finds it already half-written and just wires it up, which is
  #    how #1149 collapsed the beat. This is git-level, so it sees residue anywhere in the repo
  #    without a list of locations to keep up to date.
  #
  #    Gated on --check deliberately: after a FULL reset the tree is legitimately dirty in the
  #    self-healing cases below (files restored from the tag, added files git rm'd), and failing
  #    the post-reset verification for that would be wrong.
  if [ "$DO_CHECK" -eq 1 ]; then
    local dirty
    # -uall: without it git collapses a wholly-untracked directory to "?? src/lib/server/", which
    # hides the filename that tells a presenter what was actually left behind.
    dirty="$(git status --porcelain --untracked-files=all)"
    if [ -n "$dirty" ]; then
      echo "✗ working tree is not clean — residue from a previous run:" >&2
      echo "$dirty" | sed 's/^/    /' >&2
      echo "  Dead code left behind still collapses the demo, even though nothing leaks." >&2
      echo "  Run: scripts/demo-reset.sh$([ "$DO_CHECKOUT" -eq 1 ] && echo ' --checkout')" >&2
      failed=1
    else
      echo "✓ working tree clean (no residue from a previous run)"
    fi

    # 0b. Tag drift. --check never fetches, so a baseline tag re-pointed on origin leaves this clone
    #     comparing against the OLD commit and calling it Ready. Read-only: ls-remote, no fetch.
    #     Offline is not a failure — the comparison is simply skipped.
    local remote_tag local_tag
    # Annotated tags list twice (tag object, then the peeled ^{} commit); the commit sorts last.
    remote_tag="$(git ls-remote --tags origin "$BASELINE_TAG" 2>/dev/null | sort -k2 | tail -1 | cut -f1 || true)"
    local_tag="$(git rev-parse --verify --quiet "$BASELINE_TAG^{commit}" || true)"
    if [ -n "$remote_tag" ] && [ "$remote_tag" != "$local_tag" ]; then
      echo "✗ local $BASELINE_TAG is stale — the tag moved on origin" >&2
      echo "  Run: git fetch origin --tags --force" >&2
      failed=1
    fi
  fi

  # 1c. Checkout: the whole of src/ must match its baseline — added, edited and deleted paths alike.
  if [ "$DO_CHECKOUT" -eq 1 ]; then
    local changed
    changed="$(git diff --name-only "$BASELINE_TAG" -- "$CHECKOUT_DIR" 2>/dev/null || echo "(tag $BASELINE_TAG missing)")"
    if [ -n "$changed" ]; then
      echo "✗ $CHECKOUT_DIR differs from $BASELINE_TAG — checkout residue:" >&2
      echo "$changed" | sed 's/^/    /' >&2
      failed=1
    else
      echo "✓ $CHECKOUT_DIR matches $BASELINE_TAG (no cart/checkout/orders code)"
    fi
  fi

  # 1–3 are the fuzzy-search demo's own checks.
  if [ "$DO_CHECKOUT" -eq 0 ]; then
    # 1. Strongest check: the demo's files must match the pinned baseline byte for byte.
    #    This is what catches a shipped feature — fuzzy matching arrives WITH its own
    #    passing tests, so "the suite is green" proves nothing on its own.
    if git rev-parse --verify --quiet "refs/tags/$BASELINE_TAG" >/dev/null; then
      if git diff --quiet "$BASELINE_TAG" -- "${SEARCH_FILES[@]}"; then
        echo "✓ search files match baseline $BASELINE_TAG"
      else
        echo "✗ search files differ from baseline $BASELINE_TAG:" >&2
        git diff --stat "$BASELINE_TAG" -- "${SEARCH_FILES[@]}" | sed 's/^/    /' >&2
        failed=1
      fi
    fi

    # 1b. Check (1) can only see files it already names. A capability can also arrive as a NEW
    #     file, which no list entry covers — so ask git which paths exist here but not in the tag.
    #     Added paths only, deliberately: a full directory diff would also fire on unrelated
    #     modules and the reset would revert work that has nothing to do with the demo.
    if git rev-parse --verify --quiet "refs/tags/$BASELINE_TAG" >/dev/null; then
      local added
      added="$(git diff --diff-filter=A --name-only "$BASELINE_TAG" -- "$SEARCH_DIR")"
      if [ -n "$added" ]; then
        echo "✗ files added to $SEARCH_DIR since $BASELINE_TAG:" >&2
        echo "$added" | sed 's/^/    /' >&2
        failed=1
      else
        echo "✓ no files added to $SEARCH_DIR since $BASELINE_TAG"
      fi
    fi

    # 2. Defence in depth, and the only check available if the tag is missing: no edit-distance
    #    machinery anywhere under the matcher directory. Scoped to search.ts alone this missed
    #    fuzzy.ts entirely, and it is also the only check that sees an UNTRACKED file, which git
    #    diff cannot.
    if grep -rnE 'levenshtein|tokenMatches|MAX_EDIT_DIST|editDistance' "$SEARCH_DIR" >/dev/null 2>&1; then
      echo "✗ fuzzy matching still present under $SEARCH_DIR:" >&2
      grep -rlE 'levenshtein|tokenMatches|MAX_EDIT_DIST|editDistance' "$SEARCH_DIR" | sed 's/^/    /' >&2
      failed=1
    else
      echo "✓ $SEARCH_DIR is exact-match only"
    fi

    # 3. Behaviour: the baseline suite asserts search('jaket') returns []. Green here
    #    means typo tolerance is genuinely absent — but only meaningful alongside (1),
    #    since a shipped feature would replace these tests with ones that expect fuzzy.
    if [ "$DO_VERIFY" -eq 1 ]; then
      if npm run --silent test:baseline >/tmp/demo-reset-verify.log 2>&1; then
        echo "✓ search unit tests green"
      else
        echo "✗ search tests failed — repo is NOT at the demo baseline" >&2
        tail -25 /tmp/demo-reset-verify.log >&2
        failed=1
      fi
    fi
  fi

  # 4. Behaviour: the SECURITY standards. Checks (1)-(3) all look only at $SEARCH_DIR, but the
  #    security demo's blast radius is src/lib/server/db/ and src/routes/ — a leak there passed
  #    every check above and still reported "ready" (#1131). Rather than watch a second directory,
  #    assert the behaviour: `test:security` runs the whole `security` vitest project, so a leak
  #    fails this check wherever it lives, and a future security standard is covered the moment it
  #    is added. Enumerating locations is what failed in #1128 and again in #1129.
  if [ "$DO_VERIFY" -eq 1 ]; then
    if npm run --silent test:security >/tmp/demo-reset-security.log 2>&1; then
      # vitest exits 0 when every test SKIPS (no DATABASE_URL). Calling that a pass would be a
      # quieter version of this very bug — for a pre-flight, "could not verify" is not "ready".
      if grep -qE '[0-9]+ skipped' /tmp/demo-reset-security.log; then
        echo "✗ security standards NOT VERIFIED — the tests skipped, so nothing was proven" >&2
        grep -E 'Test Files|Tests ' /tmp/demo-reset-security.log | sed 's/^/    /' >&2
        echo "  Almost certainly a missing DATABASE_URL. Set it and re-run before demoing." >&2
        failed=1
      else
        echo "✓ security standards hold"
      fi
    else
      echo "✗ security standards FAILED — a not-for-sale product can reach the storefront" >&2
      tail -30 /tmp/demo-reset-security.log >&2
      failed=1
    fi
  fi

  return $failed
}

# --check: report and exit without touching anything.
if [ "$DO_CHECK" -eq 1 ]; then
  echo "▸ Checking demo baseline (read-only)…"
  if verify_baseline; then
    if [ "$DO_CHECKOUT" -eq 1 ]; then
      echo "✓ Repo is at the checkout demo baseline. Ready to run the checkout demo."
    else
      echo "✓ Repo is at the fuzzy-search demo baseline. Ready to run the demo."
    fi
    exit 0
  fi
  echo "✗ Repo is NOT at the baseline. Run: scripts/demo-reset.sh$([ "$DO_CHECKOUT" -eq 1 ] && echo ' --checkout')" >&2
  exit 1
fi

# --force on tags: a baseline tag re-pointed on origin otherwise makes this fetch fail with "would
# clobber existing tag", and under set -e + --quiet the script exits right here, silently, with
# nothing reset. origin is the source of truth for the baselines.
echo "▸ Fetching origin…"
git fetch --quiet --tags --force origin

# ---------------------------------------------------------------------------
# 1. Code: pin the branch to baseline, then force the demo's files back to the baseline tag.
# ---------------------------------------------------------------------------

# Guard real work. Dirty demo files are expected (that IS the demo output); dirty
# anything-else is probably work someone cares about, so stop unless --force.
#
# Untracked files are checked too, not just tracked ones: `git diff` cannot see them,
# but the `git clean -fd` below deletes them — so a tracked-only guard would let this
# script silently destroy brand-new work it never warned about.
EXCLUDE_DEMO=()
for path in "${DEMO_PATHS[@]}"; do EXCLUDE_DEMO+=(":(exclude)$path"); done
UNRELATED="$(
  {
    git diff --name-only HEAD -- . "${EXCLUDE_DEMO[@]}"
    git ls-files --others --exclude-standard -- . "${EXCLUDE_DEMO[@]}"
  } | sort -u
)"
if [ -n "$UNRELATED" ]; then
  if [ "$FORCE" -eq 0 ]; then
    echo "✗ Uncommitted or untracked changes outside the $DEMO_NAME's files:" >&2
    echo "$UNRELATED" | sed 's/^/    /' >&2
    echo "  These would be destroyed by 'git reset --hard' + 'git clean -fd'." >&2
    echo "  Commit/stash them, or re-run with --force to discard them." >&2
    exit 1
  fi
  echo "▸ Discarding unrelated changes on $CURRENT_BRANCH (--force)"
elif ! git diff --quiet || ! git diff --cached --quiet; then
  echo "▸ Discarding demo changes on $CURRENT_BRANCH"
fi

git reset --hard "$BASELINE_BRANCH" --quiet
git clean -fd --quiet
echo "✓ $CURRENT_BRANCH reset to $BASELINE_BRANCH ($(git rev-parse --short HEAD))"

# Force the demo's files to the pinned baseline. In the healthy case main is already at
# baseline and this is a no-op. If someone merged the feature to main, this is what still
# gets you a replayable demo.
if git rev-parse --verify --quiet "refs/tags/$BASELINE_TAG" >/dev/null; then
  # `git checkout <tag> -- <dir>` copies files OUT of the tag; it never deletes one the tag does
  # not have. A capability that landed as a new file would survive it, which is exactly how
  # fuzzy.ts stayed on disk through a reset that reported success (#1128) — so added files are
  # found first, from the diff, and removed after the restore.
  ADDED_DIR="$SEARCH_DIR"
  [ "$DO_CHECKOUT" -eq 1 ] && ADDED_DIR="$CHECKOUT_DIR"
  ADDED_FILES="$(git diff --diff-filter=A --name-only "$BASELINE_TAG" -- "$ADDED_DIR")"

  git checkout "$BASELINE_TAG" -- "${DEMO_PATHS[@]}"
  if git diff --cached --quiet -- "${DEMO_PATHS[@]}"; then
    echo "✓ $DEMO_NAME files already at $BASELINE_TAG on $BASELINE_BRANCH"
  else
    RESTORED="$(git diff --cached --name-only -- "${DEMO_PATHS[@]}")"
    git reset --quiet -- "${DEMO_PATHS[@]}"
    echo "⚠ $BASELINE_BRANCH CONTAINS $DEMO_NAME CODE — restored from $BASELINE_TAG:"
    echo "$RESTORED" | sed 's/^/    /'
    echo "  The working tree is now correct for the demo, but it is dirty."
    echo "  Fix the root cause by reverting the feature's commits on main."
  fi

  if [ -n "$ADDED_FILES" ]; then
    echo "$ADDED_FILES" | while IFS= read -r f; do
      [ -n "$f" ] && git rm --quiet --force -- "$f"
    done
    echo "⚠ $BASELINE_BRANCH ADDS FILES the baseline does not have — removed them:"
    echo "$ADDED_FILES" | sed 's/^/    /'
    echo "  The working tree is now correct for the demo, but it is dirty."
    echo "  Fix the root cause by reverting the commit that added them on main."
  fi
else
  echo "⚠ Baseline tag '$BASELINE_TAG' not found — relying on $BASELINE_BRANCH alone."
  echo "  Create it with: git tag $BASELINE_TAG <baseline-commit> && git push origin $BASELINE_TAG"
fi

# ---------------------------------------------------------------------------
# 2. Branch + preview: delete the throwaway demo branch (drops its Vercel preview).
# ---------------------------------------------------------------------------
if [ -n "$DEMO_BRANCH" ]; then
  if [ "$DEMO_BRANCH" = "$CURRENT_BRANCH" ]; then
    echo "✗ Refusing to delete the branch you're on ($DEMO_BRANCH). Switch away first." >&2
  else
    git branch -D "$DEMO_BRANCH" 2>/dev/null && echo "✓ Deleted local branch $DEMO_BRANCH" || true
    if git ls-remote --exit-code --heads origin "$DEMO_BRANCH" >/dev/null 2>&1; then
      git push origin --delete "$DEMO_BRANCH" --quiet \
        && echo "✓ Deleted remote branch $DEMO_BRANCH (Vercel preview will drop)"
    fi
  fi
fi

# ---------------------------------------------------------------------------
# 3. DB.
#
# --seed (pre-flight): reseed and force a low-stock spread so the badge renders. LOCAL ONLY —
# db:seed rewrites every product, and DATABASE_URL is usually the shared Neon database that
# other people and agents depend on.
#
# --db-since (checkout): undo exactly one run — restock what its orders consumed, then delete
# its orders and carts — in one transaction. Safe on the shared database; never seeds or pushes.
# ---------------------------------------------------------------------------
if [ "$DO_SEED" -eq 1 ]; then
  case "$(database_url)" in
    *@localhost[:/]*|*@127.0.0.1[:/]*) ;;
    *)
      echo "✗ Refusing to reseed: DATABASE_URL is not a local database." >&2
      echo "  db:seed would rewrite shared state other people and agents depend on." >&2
      [ "$DO_CHECKOUT" -eq 1 ] && echo "  To undo a checkout run, use --db-since <RUN_START> instead." >&2
      exit 1
      ;;
  esac
  echo "▸ Reseeding catalogue…"
  npm run --silent db:seed
  echo "▸ Applying low-stock demo state…"
  npm run --silent db:seed:lowstock
fi

if [ -n "$DB_SINCE" ]; then
  echo "▸ Undoing the checkout run's database changes since ${DB_SINCE}…"
  npm run --silent demo:reset:db -- --since "$DB_SINCE"
fi

# ---------------------------------------------------------------------------
# 4. Verify we actually landed in the "before" state.
# ---------------------------------------------------------------------------
echo "▸ Verifying demo baseline…"
if ! verify_baseline; then
  echo "" >&2
  echo "✗ Reset did NOT reach the demo baseline. Do not start the demo." >&2
  exit 1
fi

# ---------------------------------------------------------------------------
# 5. Studio: soft-delete the ideas/tasks this demo run created.
#
# Never fails the reset — demo-reset-studio.ts exits 0 and prints a manual
# checklist when the token is missing or Studio is unreachable, so a flaky
# network can't block a demo that is otherwise ready to run.
# ---------------------------------------------------------------------------
if [ "$DO_STUDIO" -eq 1 ]; then
  echo "▸ Resetting Studio state…"
  if [ "$DO_CHECKOUT" -eq 1 ]; then
    npx tsx scripts/demo-reset-studio.ts --checkout --apply || true
  else
    npx tsx scripts/demo-reset-studio.ts --apply || true
  fi
else
  echo "▸ Skipping Studio reset (--no-studio)"
fi

if [ "$DO_CHECKOUT" -eq 1 ]; then
  cat <<'EOF'

✓ Reset complete. src/ has no cart, checkout or orders code.

Remaining manual check:
  • Confirm the praxaai Vercel production storefront (main) has no Add to cart button.
EOF
else
  cat <<'EOF'

✓ Reset complete. Search is exact-match only — "jckt" and "jaket" return nothing.

Remaining manual check:
  • Confirm the praxaai Vercel production storefront (main) is unchanged.
EOF
fi
