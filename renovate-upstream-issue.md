# Suggested issue draft (not yet submitted upstream)

This file is the ready-to-submit draft for
[renovatebot/renovate](https://github.com/renovatebot/renovate).
It is tracked by [bacluc-agent/agent-todo#269](https://github.com/bacluc-agent/agent-todo/issues/269)
and has **not** been posted to `renovatebot/renovate`.

---

## Suggested title

> **Automerge silently disabled for a re-raised update after the previous merge was reverted ("Disabled because a matching PR was automerged previously")**

## Summary

When an update PR is automerged and the same update is later **reverted on the base branch**, the next Renovate run correctly re-raises the PR — but creates it with `🚦 **Automerge**: Disabled because a matching PR was automerged previously.`, so it sits open forever until a human merges it by hand. The suppression is decided purely from PR history (`prAlreadyExisted()` matches *any* previously merged PR with the same branch name/title), never from the current state of the base branch, so a genuinely new update — the dependency is back at `currentValue` after the revert — is treated as a replay of the old one. This is reproducible deterministically in a 3-step sequence on a minimal public repository, is hit repeatedly in production (three complete revert chains on `ecamp/ecamp3`, two of them requiring a manual merge weeks after the revert), and has been reported before ([#44446](https://github.com/renovatebot/renovate/issues/44446), [discussion 41692](https://github.com/renovatebot/renovate/discussions/41692), [discussion 22780](https://github.com/renovatebot/renovate/discussions/22780)).

---

## 1. Minimal reproduction

Repository: **https://github.com/bacluc-agent/renovate-automerge-repro** (public, non-fork, default branch `main`).

Relevant configuration:

- `renovate.json` — `packageRules` with `"automerge": true` for `patch`/`minor`, `"platformAutomerge": true`, `"automergeStrategy": "squash"`, `"prHourlyLimit": 10`, `dependencyDashboard: false`, `ignorePaths: [".github/workflows/renovate.yml"]`. No `recreateWhen` is set, so the default `auto` applies.
- `package.json` — a single pinned dependency, `ms`.
- `.github/workflows/renovate.yml` — `workflow_dispatch` with a required input **`renovate_ref`** ("Renovate branch, tag, or commit SHA", default `main`) plus a nightly `schedule`. It checks out `bacluc-agent/renovate` at `inputs.renovate_ref`, runs `pnpm install && pnpm build`, then `node lib/renovate.ts` with `LOG_LEVEL=debug`, `RENOVATE_PLATFORM: github`, `RENOVATE_TOKEN: ${{ secrets.RENOVATE_TOKEN }}`.

Pre-fix Renovate revision used for every step below:
`94728b88c9be875a00f0f9b28d27729ba312b2b9` — https://github.com/renovatebot/renovate/commit/94728b88c9be875a00f0f9b28d27729ba312b2b9

### Sequence

**Step 1 — first run: automerge works.**
Dispatch `Renovate` with `renovate_ref=94728b88c9be875a00f0f9b28d27729ba312b2b9` while `ms` is pinned to `2.1.2`.

- Run: https://github.com/bacluc-agent/renovate-automerge-repro/actions/runs/36122241743 (Renovate step: https://github.com/bacluc-agent/renovate-automerge-repro/actions/runs/36122241743/job/108030207641#step:7:1)
- PR **#1** https://github.com/bacluc-agent/renovate-automerge-repro/pull/1 — body contains exactly `🚦 **Automerge**: Enabled.`
- Automerged; merge commit `37b7dab3cbb3d49732f3044c47e081645749709c` https://github.com/bacluc-agent/renovate-automerge-repro/commit/37b7dab3cbb3d49732f3044c47e081645749709c (merged `2026-09-25T10:08:52Z`).

**Step 2 — revert the merge with a normal PR.**

- `git revert` of the squash merge, changing only `package.json` / `package-lock.json`, restoring `ms` `2.1.2`.
- PR **#3** https://github.com/bacluc-agent/renovate-automerge-repro/pull/3 — merged `2026-09-25T10:12:09Z`, commit `b8623560c255e273daaae2166db4e20106df8fd0` https://github.com/bacluc-agent/renovate-automerge-repro/commit/b8623560c255e273daaae2166db4e20106df8fd0
- `main` now again has `ms` `2.1.2`, i.e. the update is genuinely pending again.

**Step 3 — second run: automerge is disabled.**
Dispatch `Renovate` again with the *same* `renovate_ref`.

- Run: https://github.com/bacluc-agent/renovate-automerge-repro/actions/runs/36123054384 (Renovate step: https://github.com/bacluc-agent/renovate-automerge-repro/actions/runs/36123054384/job/108032814472#step:7:1)
- Debug log (exact lines):
  - https://github.com/bacluc-agent/renovate-automerge-repro/actions/runs/36123054384/job/108032814472#step:7:511 — `DEBUG: Matching PR #1 was merged previously (repository=bacluc-agent/renovate-automerge-repro, branch=renovate/ms-2.x)`
  - https://github.com/bacluc-agent/renovate-automerge-repro/actions/runs/36123054384/job/108032814472#step:7:512 — `DEBUG: Disabling automerge because PR was merged previously (repository=bacluc-agent/renovate-automerge-repro, branch=renovate/ms-2.x)`
  - The complete log of that run contains **zero** `GitHub-native automerge` lines.
- Recreated PR **#5** https://github.com/bacluc-agent/renovate-automerge-repro/pull/5 — created `2026-09-25T10:17:03Z` with the exact body line
  `🚦 **Automerge**: Disabled because a matching PR was automerged previously.`
  and `autoMergeRequest=null`.
- PR #5 stayed open and unmerged (polled every 30 s from `2026-09-25T10:17:52Z` to `2026-09-25T10:22:57Z`, 11 samples, all open, no auto-merge request).

> Harness note for full honesty: the very first post-revert attempt
> (https://github.com/bacluc-agent/renovate-automerge-repro/actions/runs/36122757059) emitted both
> suppression lines but hit the default `prHourlyLimit: 2` (`Skipping PR - limit reached`) because run 1
> had also raised an incidental pnpm PR. The config was then minimally adjusted (`prHourlyLimit: 10`,
> ignore the workflow file itself) in https://github.com/bacluc-agent/renovate-automerge-repro/pull/4 —
> no `recreateWhen` and no behavior under test was changed — and the accepted retry is run `36123054384`.

### Reproducing it yourself

```bash
gh workflow run Renovate -R <your-fork>/renovate-automerge-repro \
  -f renovate_ref=94728b88c9be875a00f0f9b28d27729ba312b2b9
# wait for the automerged PR, then revert it with a plain `git revert` PR, merge that, then:
gh workflow run Renovate -R <your-fork>/renovate-automerge-repro \
  -f renovate_ref=94728b88c9be875a00f0f9b28d27729ba312b2b9
```

---

## 2. Expected vs actual behavior

**Expected:** the update is a genuinely *new* update — the base branch no longer contains the previously merged version (it is back at `currentValue` `ms@2.1.2`) — so Renovate should raise it with automerge enabled, exactly like step 1, and platform-automerge it.

**Actual:** Renovate re-raises the PR but forces `config.automerge = false` and renders
`🚦 **Automerge**: Disabled because a matching PR was automerged previously.`
PR #5 got no auto-merge request and had to be merged manually.

**Why this is wrong:** the decision is made purely from PR history. The anti-loop protection that was added to avoid re-proposing an already-merged update (https://github.com/renovatebot/renovate/pull/22279, "feat: allow previously merged PRs, but block automerge", merged 2023-05-17) is a good fit for *"the update is already in the base branch"*, but not for *"the update was undone afterwards"*. After the revert the state on the base branch is indistinguishable from "never merged", so there is no loop to protect against — and the user gets a PR that will never merge itself, with a message that does not explain what to do. On a repository with many dependencies this recurs on **every** re-raised update after any revert (see §4).

---

## 3. Root cause

All references are against the base revision `94728b88c9be875a00f0f9b28d27729ba312b2b9`.

1. **`lib/workers/repository/update/branch/check-existing.ts` — `prAlreadyExisted()`**
   https://github.com/renovatebot/renovate/blob/94728b88c9be875a00f0f9b28d27729ba312b2b9/lib/workers/repository/update/branch/check-existing.ts#L12-L24
   - Short-circuits (`return null`) only when `config.recreateClosed` is set:
     `if (config.recreateClosed) { logger.debug('recreateClosed is true. No need to check for closed PR.'); return null; }`
   - Otherwise calls `platform.findPr({ branchName, prTitle, state: '!open', targetBranch })`, so **any** previously merged PR on the same branch/title matches — regardless of whether its change is still present in the base branch.

2. **`lib/workers/repository/update/branch/index.ts` (~lines 196–206)** — the forced disable
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

   The branch itself is still created/updated (only the automerge flag is flipped), which is why the PR appears "normal" apart from the body line.

3. **`lib/workers/repository/update/pr/body/config-description.ts` (~line 26)** — the user-visible message
   https://github.com/renovatebot/renovate/blob/94728b88c9be875a00f0f9b28d27729ba312b2b9/lib/workers/repository/update/pr/body/config-description.ts#L23-L30
   ```ts
   if (config.automerge) {
     prBody += 'Enabled.';
   } else if (config.automergedPreviously) {
     prBody += 'Disabled because a matching PR was automerged previously.';
   } else {
     prBody += 'Disabled by config. Please merge this manually once you are satisfied.';
   }
   ```

4. **`lib/workers/types.ts` (line 165)** — declares `automergedPreviously?: boolean;`
   https://github.com/renovatebot/renovate/blob/94728b88c9be875a00f0f9b28d27729ba312b2b9/lib/workers/types.ts#L165

5. **`lib/workers/repository/updates/generate.ts` (line 222)** — why the documented workaround works
   https://github.com/renovatebot/renovate/blob/94728b88c9be875a00f0f9b28d27729ba312b2b9/lib/workers/repository/updates/generate.ts#L222
   `upg.recreateClosed = upg.recreateWhen === 'always';` — i.e. `recreateWhen: "always"` makes `prAlreadyExisted()` short-circuit, so step 1 above never runs.

---

## 4. Workaround (config-only): `recreateWhen: "always"`

Documented in https://github.com/renovatebot/renovate/blob/94728b88c9be875a00f0f9b28d27729ba312b2b9/docs/usage/configuration-options.md#L4688 (`recreateWhen`, section `## recreateWhen`).

```json
{ "recreateWhen": "always" }
```

- `prAlreadyExisted()` returns `null` immediately (`recreateClosed is true. No need to check for closed PR.`), so `config.automerge` is never forced to `false` and the PR body renders `Automerge: Enabled.` again.
- **Side effects — evaluated as a mitigation only:**
  - It is a *global* (or per-package) change of branch/PR recreation semantics: Renovate will recreate **every** closed PR for the repository, not just reverted ones, overriding the documented default (`auto`) which exists precisely to stop re-proposing updates that were already proposed and rejected/closed.
  - The docs explicitly say: *"We recommend that you stick with the default setting for this option. Only change this setting if you really need to."*
  - It silences the symptom without addressing the root cause: a repository owner must know to set a non-default option to get basic automerge behavior back after any revert, and the misleading body text remains for everyone who does not set it.

So: works as a stopgap, but it trades one documented behavior for another and cannot be recommended as the fix.

---

## 5. Production impact — three complete chains on `ecamp/ecamp3`

`ecamp/ecamp3` runs on the Mend Renovate app (**https://developer.mend.io/github/ecamp/ecamp3**). Every chain below is automerge → revert → re-raise with the disabling body → **manual merge by a human**, which is exactly the labor the suppression creates.

| # | Update | Automerge PR (merged by `renovate[bot]`) | Revert PR | Re-raised PR with `Disabled because a matching PR was automerged previously.` |
|---|---|---|---|---|
| 1 | Node `20.11.0` | [#4420](https://github.com/ecamp/ecamp3/pull/4420) created `2024-01-09T21:13:36Z`, automerge enabled [event 11435697092](https://github.com/ecamp/ecamp3/issues/events/11435697092), merged `2024-01-09T21:34:11Z` ([event 11435906176](https://github.com/ecamp/ecamp3/issues/events/11435906176)), update commit [`cd2f32e9`](https://github.com/ecamp/ecamp3/commit/cd2f32e926a10540a4c8e340f26f5cf04a513b4c) | [#4429](https://github.com/ecamp/ecamp3/pull/4429), commit [`a740d1fb`](https://github.com/ecamp/ecamp3/commit/a740d1fb8d1ed918f9c92cf8eff96b558c7cdd0f), merged `2024-01-10T18:38:22Z` | [#4432](https://github.com/ecamp/ecamp3/pull/4432), manually merged by `BacLuc` `2024-01-14T19:03:20Z` ([event 11481942762](https://github.com/ecamp/ecamp3/issues/events/11481942762)) |
| 2 | `api-platform/core` `3.3.7` | [#5449](https://github.com/ecamp/ecamp3/pull/5449) created `2024-06-28T12:50:02Z`, automerge enabled [event 13331267538](https://github.com/ecamp/ecamp3/issues/events/13331267538), merged `2024-07-01T17:44:30Z` ([event 13354686302](https://github.com/ecamp/ecamp3/issues/events/13354686302)), update commit [`2a4cf818`](https://github.com/ecamp/ecamp3/commit/2a4cf818f0e7dfb158f73679973f7ecbe0ab3b2b) | [#5472](https://github.com/ecamp/ecamp3/pull/5472), merged `2024-07-03T05:25:14Z` ([commit `44b46b89`](https://github.com/ecamp/ecamp3/commit/44b46b892718a146fe9280d828208df1c7cf623f)) | [#5480](https://github.com/ecamp/ecamp3/pull/5480), manually merged by `BacLuc` `2024-07-21T15:44:47Z` ([event 13592994244](https://github.com/ecamp/ecamp3/issues/events/13592994244)) |
| 3 | `@playwright/cli` `0.1.17` | [#10320](https://github.com/ecamp/ecamp3/pull/10320) created `2026-07-17T06:36:26Z`, automerge enabled [event 28106463743](https://github.com/ecamp/ecamp3/issues/events/28106463743), merged `2026-07-17T06:39:45Z` ([event 28106565837](https://github.com/ecamp/ecamp3/issues/events/28106565837)), update commit [`658c2793`](https://github.com/ecamp/ecamp3/commit/658c2793f4f69b0d485cf6efdcc8c40e0bd9e4c3) | [#10345](https://github.com/ecamp/ecamp3/pull/10345), merged by `BacLuc` `2026-07-21T19:11:44Z` ([event 28288060258](https://github.com/ecamp/ecamp3/issues/events/28288060258), commit [`5049c0be`](https://github.com/ecamp/ecamp3/commit/5049c0be37f326753e2028944552e33dc72ad266)) | [#10348](https://github.com/ecamp/ecamp3/pull/10348), manually merged by `BacLuc` `2026-08-09T08:49:31Z` ([event 29178340832](https://github.com/ecamp/ecamp3/issues/events/29178340832)) |

Collateral cases in the same repository:

- [#10350](https://github.com/ecamp/ecamp3/pull/10350) ("Revert pdf changes", merged `2026-07-21T20:50:11Z`) → the re-raised [#10354](https://github.com/ecamp/ecamp3/pull/10354) was **closed unmerged** — i.e. the update silently stayed un-automerged.
- Stale-base rollback [#10402](https://github.com/ecamp/ecamp3/pull/10402) (automerged `2026-07-28T17:19:44Z`, [event 28613461601](https://github.com/ecamp/ecamp3/issues/events/28613461601)) → [#10403](https://github.com/ecamp/ecamp3/pull/10403) ([`cf1de462`](https://github.com/ecamp/ecamp3/commit/cf1de462afb034de210c2ebcc90a4a2c0c8b38be)) rolled Prettier back to 3.9.5 → [#10408](https://github.com/ecamp/ecamp3/pull/10408) re-raised 3.9.6 with the disabling body and was manually merged `2026-07-28T20:52:10Z` ([event 28622969048](https://github.com/ecamp/ecamp3/issues/events/28622969048)). The same "previously merged" detection fires for rollback/revert merges that are not even Renovate reverts.

---

## 6. Related reports

- https://github.com/renovatebot/renovate/issues/44446 — "Automerge: Disabled because a matching MR was automerged previously." (open, created `2026-07-09T14:34:36Z`)
- https://github.com/renovatebot/renovate/discussions/41692 — same symptom on GitLab (created `2026-03-05T10:38:52Z`)
- https://github.com/renovatebot/renovate/discussions/22780 — same symptom, oldest known report (created `2023-06-14T21:20:24Z`)

(All three are linked for context; nothing has been submitted to `renovatebot/renovate` from this work.)

---

## 7. Suggested fix direction

Do not blanket-disable automerge just because a PR with the same branch/title was merged before. The suppression should at least **not apply when the base branch has since been reverted back to `currentValue`**, i.e. when the update is genuinely new again. Concretely, the `existingPr?.state === 'merged'` branch in `lib/workers/repository/update/branch/index.ts` should distinguish

- *the previously merged change is still present on the base branch* → keep the current anti-loop behavior, and
- *the base branch no longer contains it (reverted/rolled back, dependency back at `currentValue`)* → leave `config.automerge` untouched, so `platformAutomerge` proceeds as in the first run.

A reference implementation plus end-to-end proof exists (5 files, strict deletion of the suppression while **keeping** the historical lookup, the `Matching PR #N was merged previously` debug log, and the closed-but-unmerged early return):

- Fix PR: **https://github.com/bacluc-agent/renovate/pull/1** — `fix(branch): keep automerge enabled when a previously merged PR's update was reverted`, branch `issue-269-automerge-revert`, head `cda37f5a4ebfbdcfa0c7657866e6ff9f4c82b934`
  - RED commit `474ed48532eba6784e4f0134b61d0d70f6982448`, GREEN commit [`cda37f5a4ebfbdcfa0c7657866e6ff9f4c82b934`](https://github.com/bacluc-agent/renovate/commit/cda37f5a4ebfbdcfa0c7657866e6ff9f4c82b934)
  - Unit tests: `pnpm vitest lib/workers/repository/update/branch` → 14 files / 523 tests passed; full `pnpm test` → 1046 files / 28090 tests passed (1 expected fail), coverage 99.99% statements.

**E2E proof on the same repro repository** (run with `renovate_ref=cda37f5a4ebfbdcfa0c7657866e6ff9f4c82b934`,
https://github.com/bacluc-agent/renovate-automerge-repro/actions/runs/36127828176/job/108047932746):

- checkout of the fix revision — https://github.com/bacluc-agent/renovate-automerge-repro/actions/runs/36127828176/job/108047932746#step:2:98 (`HEAD is now at cda37f5 fix(branch): preserve automerge after previously merged PR`) and https://github.com/bacluc-agent/renovate-automerge-repro/actions/runs/36127828176/job/108047932746#step:4:8 (`cda37f5a4ebfbdcfa0c7657866e6ff9f4c82b934`)
- the lookup is unchanged and still logged — https://github.com/bacluc-agent/renovate-automerge-repro/actions/runs/36127828176/job/108047932746#step:7:514 (`DEBUG: Matching PR #1 was merged previously`)
- https://github.com/bacluc-agent/renovate-automerge-repro/actions/runs/36127828176/job/108047932746#step:7:591 — `INFO: PR updated (repository=bacluc-agent/renovate-automerge-repro, branch=renovate/ms-2.x)`
- https://github.com/bacluc-agent/renovate-automerge-repro/actions/runs/36127828176/job/108047932746#step:7:622 — `INFO: PR automerged (repository=bacluc-agent/renovate-automerge-repro, branch=renovate/ms-2.x)`
- `Disabling automerge because PR was merged previously`: **0 occurrences** in that run; `Disabled because a matching PR was automerged previously`: **0 occurrences**
- PR [#5](https://github.com/bacluc-agent/renovate-automerge-repro/pull/5) body became `🚦 **Automerge**: Enabled.` and it merged at `2026-09-25T11:10:00Z`, merge commit [`f342cd6fdd29c7d2f0c5b94c28e94a763218c809`](https://github.com/bacluc-agent/renovate-automerge-repro/commit/f342cd6fdd29c7d2f0c5b94c28e94a763218c809)

Alternatives, if maintainers want to keep some protection:

- keep the suppression only when `currentValue` still equals the previously merged `newValue` (i.e. the update is really already applied), or
- gate it behind an explicit opt-in config option instead of unconditionally disabling.

---

## 8. Environment

| item | value |
|---|---|
| Renovate revision (repro, pre-fix) | `94728b88c9be875a00f0f9b28d27729ba312b2b9` — https://github.com/renovatebot/renovate/commit/94728b88c9be875a00f0f9b28d27729ba312b2b9 |
| Renovate revision (repro, fix) | `cda37f5a4ebfbdcfa0c7657866e6ff9f4c82b934` (branch `issue-269-automerge-revert` of https://github.com/bacluc-agent/renovate) |
| Version reported by the built CLI | `0.0.0-semantic-release` (built from source: `pnpm install --frozen-lockfile && pnpm build`, Node 24.21.0, pnpm 11.27.0) |
| Platform | GitHub (`RENOVATE_PLATFORM: github`), repository `bacluc-agent/renovate-automerge-repro` |
| Automerge config | `"platformAutomerge": true`, `automerge: true` for `patch`/`minor`, `automergeStrategy: "squash"` |
| Other config | `prHourlyLimit: 10`, `dependencyDashboard: false`, `ignorePaths: [".github/workflows/renovate.yml"]`, default `recreateWhen: "auto"` |
| Logging | `LOG_LEVEL: debug`, invoked as `node lib/renovate.ts` from `.github/workflows/renovate.yml` |

---

*Draft prepared for https://github.com/bacluc-agent/agent-todo/issues/269. Nothing in this document has been submitted to `renovatebot/renovate`.*
