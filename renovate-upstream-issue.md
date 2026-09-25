# Upstream issue draft for renovatebot/renovate (not submitted)

Ready-to-submit write-up for https://github.com/renovatebot/renovate.
Tracked by https://github.com/bacluc-agent/agent-todo/issues/269.
**Nothing in this file has been posted to `renovatebot/renovate`.**

---

## Suggested title

> **Automerge silently disabled for a re-raised update after the previous merge was reverted ("Disabled because a matching PR was automerged previously")**

## Suggested body

### Summary

When an update PR is automerged and the same update is later **reverted on the base branch**, the next Renovate run correctly re-raises the PR — but creates it with `🚦 **Automerge**: Disabled because a matching PR was automerged previously.`, so it sits open until a human merges it by hand.

The decision is made purely from PR history: `prAlreadyExisted()` matches *any* previously merged PR with the same branch name/title, regardless of whether its change is still present on the base branch. After a revert the base branch is back at `currentValue`, so this is a genuinely new update, not a replay — but Renovate treats it as one.

The behavior is reproduced deterministically end-to-end on a minimal public repository (before and after runs linked below), it recurs on every revert in production (three complete chains on `ecamp/ecamp3`, each ending in a manual merge), and it has been reported before: #44446, discussion 41692, discussion 22780.

---

### 1. Minimal reproduction

Repository: **https://github.com/bacluc-agent/renovate-automerge-repro** (public, non-fork, default branch `main`).

Configuration:

- `renovate.json` — `packageRules` with `"automerge": true` for `patch`/`minor`, `"platformAutomerge": true`, `"automergeStrategy": "squash"`, `"prHourlyLimit": 10`, `dependencyDashboard: false`, `ignorePaths: [".github/workflows/renovate.yml"]`. No `recreateWhen` is set, so the documented default `auto` applies — the mitigation must not be used to hide the bug.
- `package.json` — a single pinned dependency, `ms` `2.1.2`.
- `.github/workflows/renovate.yml` — `workflow_dispatch` with a required input `renovate_ref` (branch/tag/SHA of the Renovate build to run) plus a nightly `schedule`; it checks out the Renovate source, runs `pnpm install && pnpm build`, then `node lib/renovate.ts` with `LOG_LEVEL: debug`.
- `.github/workflows/validate.yml` — required `validate` check on PRs (so native automerge has a status check to wait for).

Pre-fix Renovate revision used for the "before" runs:
`94728b88c9be875a00f0f9b28d27729ba312b2b9` — https://github.com/renovatebot/renovate/commit/94728b88c9be875a00f0f9b28d27729ba312b2b9

#### Step 1 — first run: automerge works

Run: https://github.com/bacluc-agent/renovate-automerge-repro/actions/runs/36122241743
Renovate step: https://github.com/bacluc-agent/renovate-automerge-repro/actions/runs/36122241743/job/108030207641#step:7

- PR #1 https://github.com/bacluc-agent/renovate-automerge-repro/pull/1 — body contains exactly `🚦 **Automerge**: Enabled.`
- Log: `DEBUG: PR is configured for automerge (… branch=renovate/ms-2.x)` and `GitHub-native automerge: success`.
- Merged automatically at `2026-09-25T10:08:52Z`, squash commit `37b7dab3cbb3d49732f3044c47e081645749709c`.

#### Step 2 — revert the merge with a normal PR

- Plain `git revert` of the squash merge, changing only `package.json`/`package-lock.json`, restoring `ms` `2.1.2`.
- PR #3 https://github.com/bacluc-agent/renovate-automerge-repro/pull/3 — merged `2026-09-25T10:12:09Z`, commit `b8623560c255e273daaae2166db4e20106df8fd0`.
- `main` again contains `ms` `2.1.2`, i.e. the update is genuinely pending again.

#### Step 3 — second run, same pre-fix revision: automerge is disabled

Run: https://github.com/bacluc-agent/renovate-automerge-repro/actions/runs/36123054384
Renovate step: https://github.com/bacluc-agent/renovate-automerge-repro/actions/runs/36123054384/job/108032814472#step:7

Exact debug log lines (both present in that step's log):

- https://github.com/bacluc-agent/renovate-automerge-repro/actions/runs/36123054384/job/108032814472#step:7:511 — `DEBUG: Matching PR #1 was merged previously (repository=bacluc-agent/renovate-automerge-repro, branch=renovate/ms-2.x)`
- https://github.com/bacluc-agent/renovate-automerge-repro/actions/runs/36123054384/job/108032814472#step:7:512 — `DEBUG: Disabling automerge because PR was merged previously (repository=bacluc-agent/renovate-automerge-repro, branch=renovate/ms-2.x)`
- The complete log of that run contains **zero** `GitHub-native automerge` lines.

Outcome:

- PR #5 https://github.com/bacluc-agent/renovate-automerge-repro/pull/5 created `2026-09-25T10:17:03Z` with the exact body line
  `🚦 **Automerge**: Disabled because a matching PR was automerged previously.`
  and `autoMergeRequest=null` (body re-confirmed while the PR was still open in https://github.com/bacluc-agent/agent-todo/issues/269#issuecomment-5831371140).
- The PR stayed open and unmerged while the required `validate` check was green.

> Harness note: the very first post-revert attempt (https://github.com/bacluc-agent/renovate-automerge-repro/actions/runs/36122757059) emitted both suppression lines but hit the default `prHourlyLimit: 2` (`Skipping PR - limit reached`) because run 1 had also raised an incidental pnpm PR. The config was then minimally adjusted (`prHourlyLimit: 10`, ignore the workflow file itself) in https://github.com/bacluc-agent/renovate-automerge-repro/pull/4 — no `recreateWhen` and nothing under test was changed — and the accepted run is `36123054384`.

#### Step 4 — the fix, same sequence: automerge works again

Run with `renovate_ref=cda37f5a4ebfbdcfa0c7657866e6ff9f4c82b934` (branch `issue-269-automerge-revert` of https://github.com/bacluc-agent/renovate):
https://github.com/bacluc-agent/renovate-automerge-repro/actions/runs/36127828176
Renovate step: https://github.com/bacluc-agent/renovate-automerge-repro/actions/runs/36127828176/job/108047932746#step:7

- https://github.com/bacluc-agent/renovate-automerge-repro/actions/runs/36127828176/job/108047932746#step:2 — `HEAD is now at cda37f5 fix(branch): preserve automerge after previously merged PR`
- https://github.com/bacluc-agent/renovate-automerge-repro/actions/runs/36127828176/job/108047932746#step:4 — `cda37f5a4ebfbdcfa0c7657866e6ff9f4c82b934`
- https://github.com/bacluc-agent/renovate-automerge-repro/actions/runs/36127828176/job/108047932746#step:7:514 — `DEBUG: Matching PR #1 was merged previously` (the historical lookup is **kept** and still logged)
- https://github.com/bacluc-agent/renovate-automerge-repro/actions/runs/36127828176/job/108047932746#step:7:595 — `DEBUG: PR is configured for automerge`
- https://github.com/bacluc-agent/renovate-automerge-repro/actions/runs/36127828176/job/108047932746#step:7:609 — `DEBUG: Automerging #5 with strategy squash`
- https://github.com/bacluc-agent/renovate-automerge-repro/actions/runs/36127828176/job/108047932746#step:7:622 — `INFO: PR automerged`
- `Disabling automerge because PR was merged previously`: **0 occurrences**; `Disabled because a matching PR was automerged previously`: **0 occurrences**
- PR #5 body became `🚦 **Automerge**: Enabled.` and it merged automatically at `2026-09-25T11:10:00Z`, merge commit `f342cd6fdd29c7d2f0c5b94c28e94a763218c809`. (The merge was performed by Renovate's own automerge code path, proven by the `INFO: PR automerged` log line above; the recorded merge actor is the PAT user `bacluc-agent` used to run the workflow, not `renovate[bot]`.)

---

### 2. Expected vs actual

**Expected:** the base branch no longer contains the previously merged version (it is back at `currentValue` `ms@2.1.2`), so the re-raised PR is a genuinely new update and should be created with automerge enabled exactly like step 1.

**Actual:** Renovate forces `config.automerge = false` and renders `🚦 **Automerge**: Disabled because a matching PR was automerged previously.`; the PR gets no auto-merge request and must be merged manually.

**Why this is wrong:** the anti-loop guard added by https://github.com/renovatebot/renovate/pull/22279 is a good fit for *"the update is already in the base branch"*, but not for *"the update was undone afterwards"*. After a revert there is no loop to protect against — the branch must be recreated anyway — yet the user gets a PR that will never merge itself, with a message that does not say what to do.

---

### 3. Root cause

All references are against base revision `94728b88c9be875a00f0f9b28d27729ba312b2b9`.

1. `lib/workers/repository/update/branch/check-existing.ts` — `prAlreadyExisted()`
   https://github.com/renovatebot/renovate/blob/94728b88c9be875a00f0f9b28d27729ba312b2b9/lib/workers/repository/update/branch/check-existing.ts#L8-L50
   - Returns `null` immediately when `config.recreateClosed` is set (`recreateClosed is true. No need to check for closed PR.`).
   - Otherwise calls `platform.findPr({ branchName, prTitle, state: '!open', targetBranch })`, so **any** previously merged PR on the same branch/title matches, regardless of whether its change is still present on the base branch.

2. `lib/workers/repository/update/branch/index.ts` (lines ~196–206) — the forced disable
   https://github.com/renovatebot/renovate/blob/94728b88c9be875a00f0f9b28d27729ba312b2b9/lib/workers/repository/update/branch/index.ts#L196-L206

   ```ts
   const existingPr =
     !branchPr || config.automerge
       ? await prAlreadyExisted(config)
       : undefined;
   if (existingPr?.state === 'merged') {
     logger.debug(`Matching PR #${existingPr.number} was merged previously`);
     if (config.automerge) {
       logger.debug('Disabling automerge because PR was merged previously');
       config.automerge = false;
       config.automergedPreviously = true;
     }
   }
   ```

   Only the automerge flag is flipped; the branch/PR is still created, which is why the PR looks normal apart from the body line.

3. `lib/workers/repository/update/pr/body/config-description.ts` (line ~26) — the user-visible message
   https://github.com/renovatebot/renovate/blob/94728b88c9be875a00f0f9b28d27729ba312b2b9/lib/workers/repository/update/pr/body/config-description.ts#L23-L31
   ```ts
   if (config.automerge) {
     prBody += 'Enabled.';
   } else if (config.automergedPreviously) {
     prBody += 'Disabled because a matching PR was automerged previously.';
   } else {
     prBody += 'Disabled by config. Please merge this manually once you are satisfied.';
   }
   ```

4. `lib/workers/types.ts` (line ~165) — declares `automergedPreviously?: boolean`
   https://github.com/renovatebot/renovate/blob/94728b88c9be875a00f0f9b28d27729ba312b2b9/lib/workers/types.ts#L162-L166

5. `lib/workers/repository/updates/generate.ts` (line ~222) — the `recreateClosed` / `recreateWhen` short-circuit
   https://github.com/renovatebot/renovate/blob/94728b88c9be875a00f0f9b28d27729ba312b2b9/lib/workers/repository/updates/generate.ts#L197-L247
   `upg.recreateClosed = upg.recreateWhen === 'always';` — this is what makes the config-only mitigation below work.

---

### 4. Config-only mitigation: `recreateWhen: "always"` (not a real fix)

Documented at https://github.com/renovatebot/renovate/blob/94728b88c9be875a00f0f9b28d27729ba312b2b9/docs/usage/configuration-options.md (`recreateWhen`).

```json
{ "recreateWhen": "always" }
```

- `prAlreadyExisted()` short-circuits to `null`, so the `state === 'merged'` branch never runs, `config.automerge` is never forced to `false`, and the body renders `Automerge: Enabled.` again. It does fix the symptom.
- **Why it is only a workaround:**
  - It changes *recreation* semantics globally (or per package), i.e. Renovate will recreate **every** closed PR in the repository — not only the reverted ones — overriding the documented default `auto`, which exists precisely to stop re-proposing updates that were already proposed and closed/rejected.
  - The docs explicitly recommend keeping the default: *"We recommend that you stick with the default setting for this option. Only change this setting if you really need to."*
  - It silences the symptom without addressing the root cause: every repository owner has to discover and set a non-default option to get basic automerge back after any revert, and the misleading body text stays for everyone who does not.
  - It also removes an unrelated protection (closed-unmerged PRs are no longer respected), so it trades one documented behavior for another.

So: usable as a stopgap, not recommendable as the fix.

---

### 5. Production impact — three complete chains on `ecamp/ecamp3`

`ecamp/ecamp3` runs on the Mend Renovate app (**https://developer.mend.io/github/ecamp/ecamp3**), so this affects it today. Every chain is: automerge → revert on `main` → re-raise with the disabling body → **manual merge by a human** (weeks later in two of the three cases).

| # | Update | Automerge PR (merged by `renovate[bot]`) | Revert PR | Re-raised PR with `Disabled because a matching PR was automerged previously.` |
|---|---|---|---|---|
| 1 | `@playwright/cli` `0.1.15` → `0.1.17` | [#10320](https://github.com/ecamp/ecamp3/pull/10320) created `2026-07-17T06:36:26Z`, `auto_merge_enabled` [event 28106463743](https://github.com/ecamp/ecamp3/issues/events/28106463743), merged `2026-07-17T06:39:45Z` by `renovate[bot]` ([event 28106565837](https://github.com/ecamp/ecamp3/issues/events/28106565837)), update commit [`658c2793`](https://github.com/ecamp/ecamp3/commit/658c2793f4f69b0d485cf6efdcc8c40e0bd9e4c3) | [#10345](https://github.com/ecamp/ecamp3/pull/10345) merged by `BacLuc` `2026-07-21T19:11:44Z` ([event 28288060258](https://github.com/ecamp/ecamp3/issues/events/28288060258), commit [`5049c0be`](https://github.com/ecamp/ecamp3/commit/5049c0be37f326753e2028944552e33dc72ad266) — `0.1.17` back to `0.1.15`) | [#10348](https://github.com/ecamp/ecamp3/pull/10348) created `2026-07-21T19:17:17Z` (5m33s later), no `auto_merge_enabled` event ever, manually merged by `BacLuc` `2026-08-09T08:49:31Z` ([event 29178340832](https://github.com/ecamp/ecamp3/issues/events/29178340832)) |
| 2 | `api-platform/core` `3.3.6` → `3.3.7` | [#5449](https://github.com/ecamp/ecamp3/pull/5449) created `2024-06-28T12:50:02Z`, `auto_merge_enabled` [event 13331267538](https://github.com/ecamp/ecamp3/issues/events/13331267538), merged `2024-07-01T17:44:30Z` by `renovate[bot]` ([event 13354686302](https://github.com/ecamp/ecamp3/issues/events/13354686302)), update commit [`2a4cf818`](https://github.com/ecamp/ecamp3/commit/2a4cf818f0e7dfb158f73679973f7ecbe0ab3b2b) | [#5472](https://github.com/ecamp/ecamp3/pull/5472) merged `2024-07-03T05:25:14Z` (commit [`44b46b89`](https://github.com/ecamp/ecamp3/commit/44b46b892718a146fe9280d828208df1c7cf623f) — `3.3.7` back to `3.3.6`) | [#5480](https://github.com/ecamp/ecamp3/pull/5480) created `2024-07-03T15:12:24Z`, manually merged by `BacLuc` `2024-07-21T15:44:47Z` ([event 13592994244](https://github.com/ecamp/ecamp3/issues/events/13592994244)) after a human re-enabled automerge by hand |
| 3 | Node `20.9.0` → `20.11.0` | [#4420](https://github.com/ecamp/ecamp3/pull/4420) created `2024-01-09T21:13:36Z`, `auto_merge_enabled` [event 11435697092](https://github.com/ecamp/ecamp3/issues/events/11435697092), merged `2024-01-09T21:34:11Z` by `renovate[bot]` ([event 11435906176](https://github.com/ecamp/ecamp3/issues/events/11435906176)), update commit [`cd2f32e9`](https://github.com/ecamp/ecamp3/commit/cd2f32e926a10540a4c8e340f26f5cf04a513b4c) | [#4429](https://github.com/ecamp/ecamp3/pull/4429) merged `2024-01-10T18:38:22Z` (commit [`a740d1fb`](https://github.com/ecamp/ecamp3/commit/a740d1fb8d1ed918f9c92cf8eff96b558c7cdd0f)) | [#4432](https://github.com/ecamp/ecamp3/pull/4432) created `2024-01-10T21:21:15Z`, no auto-merge event ever, manually merged by `BacLuc` `2024-01-14T19:03:20Z` ([event 11481942762](https://github.com/ecamp/ecamp3/issues/events/11481942762)) |

Collateral cases in the same repository:

- [#10350](https://github.com/ecamp/ecamp3/pull/10350) ("Revert pdf changes") → re-raised [#10354](https://github.com/ecamp/ecamp3/pull/10354) carried the disabling body and was **closed unmerged** `2026-07-26T09:00:11Z` — the update silently stayed un-automerged.
- Rollback [#10402](https://github.com/ecamp/ecamp3/pull/10402) (automerged `2026-07-28T17:19:44Z`) → [#10403](https://github.com/ecamp/ecamp3/pull/10403) rolled Prettier back to 3.9.5 → re-raised [#10408](https://github.com/ecamp/ecamp3/pull/10408) got the disabling body and was manually merged `2026-07-28T20:52:10Z`. The same detection fires for rollbacks that are not even Renovate reverts.

A search for `in:body "Disabled because a matching PR was automerged previously"` returns 100+ PRs in `ecamp/ecamp3` since 2025-04.

---

### 6. Related reports

- https://github.com/renovatebot/renovate/issues/44446 — "Automerge: Disabled because a matching MR was automerged previously."
- https://github.com/renovatebot/renovate/discussions/41692 — same symptom on GitLab
- https://github.com/renovatebot/renovate/discussions/22780 — same symptom, oldest known report

---

### 7. Proposed fix

Keep automerge enabled when the base branch has been reverted back to `currentValue`, instead of blanket-disabling it whenever a matching PR was merged before. The regenerated branch already proves the update is needed — Renovate only re-creates it when the current base branch does not contain the update.

Concretely, in the `existingPr?.state === 'merged'` branch of `lib/workers/repository/update/branch/index.ts`:

- *previously merged change still present on the base branch* → keep the current anti-loop behavior (automerge off);
- *base branch no longer contains it (reverted/rolled back, dependency back at `currentValue`)* → leave `config.automerge` untouched so `platformAutomerge` proceeds exactly as in the first run.

A reference implementation with end-to-end proof exists in a fork (5 files, a strict deletion of the suppression that **keeps** the historical lookup, the `Matching PR #N was merged previously` debug log, and the closed-but-unmerged early return; the now-dead `automergedPreviously` field and its body text are dropped):

- https://github.com/bacluc-agent/renovate/pull/1 — branch `issue-269-automerge-revert`, head `1b3ea61858d4f1777435876ba7caed76c5c18114`
  - RED commit `474ed48532eba6784e4f0134b61d0d70f6982448`, fix commit `cda37f5a4ebfbdcfa0c7657866e6ff9f4c82b934`, spec commit `faa1f5754b523fed629c6005b421104590b1c2ae`, restore commit `1b3ea61858d4f1777435876ba7caed76c5c18114`
  - `pnpm vitest run lib/workers/repository/update/branch` → `Test Files 25 passed (25)`, `Tests 617 passed (617)`
  - E2E proof: run `36127828176` above, PR #5 automerged with `🚦 **Automerge**: Enabled.`

Alternatives if some protection must be kept:

- keep the suppression only when `currentValue` still equals the previously merged `newValue` (the update really is already applied), or
- gate the whole behavior behind an explicit opt-in config option instead of unconditionally disabling.

---

### 8. Environment

| item | value |
|---|---|
| Renovate revision (before) | `94728b88c9be875a00f0f9b28d27729ba312b2b9` |
| Renovate revision (after) | `cda37f5a4ebfbdcfa0c7657866e6ff9f4c82b934` (branch `issue-269-automerge-revert` of https://github.com/bacluc-agent/renovate) |
| Built CLI version | `0.0.0-semantic-release` (built from source: `pnpm install --frozen-lockfile && pnpm build`, Node 24, pnpm 11.27.0) |
| Platform | GitHub (`RENOVATE_PLATFORM: github`), repository `bacluc-agent/renovate-automerge-repro` |
| Automerge config | `"platformAutomerge": true`, `automerge: true` for `patch`/`minor`, `automergeStrategy: "squash"` |
| Other config | `prHourlyLimit: 10`, `dependencyDashboard: false`, default `recreateWhen: "auto"` |
| Logging | `LOG_LEVEL: debug`, invoked as `node lib/renovate.ts` from `.github/workflows/renovate.yml` |

---

*Draft prepared for https://github.com/bacluc-agent/agent-todo/issues/269. Nothing in this document has been submitted to `renovatebot/renovate`.*
