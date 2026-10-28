# DiplomaChain Workspace Rules

## Preserve the project

- Keep source code, migrations, automated tests, reusable scripts, dependencies,
  configuration, project documentation, original workbooks, and documented demo
  inputs. A file is not disposable just because Git reports it as untracked.
- Never treat `.data`, database dumps, ledger files, wallets, signing keys,
  certificates, environment files, stored diploma PDFs, or audit evidence as
  garbage. Do not reset business data or regenerate signed documents to clean up.
- Preserve existing user changes. Do not use `git clean`, `git reset --hard`, or
  broad recursive deletion to tidy the workspace.

## Temporary artifacts

- Use a uniquely named task directory under the operating system temporary
  directory for screenshots, PDF page renders, debug output, test fixtures, and
  one-off helper scripts. Do not create new root `tmp`, `output`, or `outputs`
  folders for routine agent work.
- Keep temporary paths in memory. Delete task-owned temporary files and stop
  task-owned helper processes in `finally`, including on failure.
- Do not leave dependency junctions, symlinks, preview images, inspection dumps,
  copied PDFs, test logs, or throwaway scripts after verification.
- Keep reusable regression tests in `scripts` or the existing test directories;
  keep fixtures in memory or roll back their database transaction. Test source
  files are part of the project, not temporary output.
- Generate sample PDFs, exported workbooks, or evidence reports only when the
  user explicitly requests them or a documented integration test requires them.
  Never silently remove retained evidence from a real blockchain transaction.

## Safe cleanup

- Preview standard cleanup with `npm run clean`. Apply reviewed cleanup with
  `npm run clean -- -Apply`. Add `-Builds` only when removing rebuildable bundles
  is intentional and the application is stopped.
- Default cleanup keeps production builds and dependencies so the app can still
  start. Disposable process logs may be removed only after services stop; the
  database activity/audit records must stay intact. Do not rebuild solely for a
  cleanup-only task and recreate the clutter.
- Before deleting recursively, verify the resolved absolute target stays under
  the workspace and does not contain tracked files or protected runtime data.
  Do not traverse junctions or symlinks. Remove an obsolete link itself only,
  never the directory it points to.
- Do not stop user services, delete outside the workspace, or remove ambiguous
  files without asking. Do not run cleanup concurrently with a build or tests.
- Before finishing a task, review its new files, remove task-owned artifacts,
  confirm protected data is unchanged, and report any deliberately retained
  deliverables or evidence. Do not create cleanup logs or manifests as new junk.
