# Renovate automerge reproduction

This public minimal reproduction tracks [bacluc-agent/agent-todo#269](https://github.com/bacluc-agent/agent-todo/issues/269).

The repository intentionally pins `ms` to `2.1.2`. Its Renovate configuration uses patch/minor platform automerge and the default `recreateWhen` behavior.

## Current behavior

After Renovate automerges the `ms` patch and that merge is reverted, the next run recreates the PR but disables automerge because a matching PR was automerged previously.

## Expected behavior

Renovate enables automerge again for the newly recreated update.
