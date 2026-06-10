---
title: Leave Touched Files Cleaner
type: standard
---

**Cleaner than you found it (touched files only)** — For each file this changeset modifies, is it as
clean or cleaner than before? Confirm you removed any now-dead code, commented-out blocks, and
unused imports you encountered **in the files you already had to open** for this task.

This applies **only** to files the task already requires you to touch. Do **not** expand scope into
untouched files or speculative refactors — that is a backlog candidate to list in the build report's
learnings, not work to do now. This resolves the tension with the "minimal changes" rule: clean the
campsite you are standing in, do not go tidy the whole forest.

If a file is messier after your change than before (e.g. a deliberate, spec-required complexity),
explain why.
