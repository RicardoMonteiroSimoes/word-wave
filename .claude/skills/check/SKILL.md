---
name: check
description: Run all CI checks (typecheck, lint, format, knip, duplication, tests) and auto-fix formatting/lint issues. Use before committing or when a PR is failing.
allowed-tools: Bash(npm run format), Bash(npm run lint_fix), Bash(npm run check)
---

# CI checks and auto-fix

Run the full CI check suite. Auto-fix what you can, report what you can't.

## Steps

1. **Auto-fix** formatting and lint issues first:
   ```bash
   npm run format
   npm run lint:fix
   ```

2. **Run all checks** to verify everything passes:
   ```bash
   npm run check
   ```
   This runs: `tsc --noEmit && eslint && prettier --check && knip && jscpd && vitest run`

3. **Report results.** If any check still fails after auto-fix, show the failure output and suggest what to fix.

4. **If files were modified** by auto-fix, list them so the user knows what changed.
