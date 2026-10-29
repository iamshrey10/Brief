# Going back to an earlier design

Before the Documents and Profile sections were added (October 29), the website was tagged `design-v1-oct28`, which is commit
`8816720`. It has the rebuilt landing page and the shared signed in top bar, with account deletion in the dashboard footer and no
Profile page. Nothing was deleted: the newer design is ordinary commits on top of it.

## Look at the old design without changing anything

    git checkout design-v1-oct28
    cd web && pnpm install && pnpm dev

Come back to the newest version with `git checkout main`.

## Keep it as its own branch, and run both

    git switch -c old-design design-v1-oct28

## Put the old website back on main

This replaces the website files with the old ones and removes the files that only exist in the new design:

    git checkout design-v1-oct28 -- web
    git rm -r --cached web/app/dashboard/profile web/lib/profile.ts web/lib/profile.test.ts web/lib/document-summary.ts web/lib/document-summary.test.ts web/components/usage-card.tsx web/components/usage-card.test.tsx web/e2e/profile.spec.ts
    rm -r web/app/dashboard/profile web/lib/profile.ts web/lib/profile.test.ts web/lib/document-summary.ts web/lib/document-summary.test.ts web/components/usage-card.tsx web/components/usage-card.test.tsx web/e2e/profile.spec.ts
    scripts/check-all.sh --e2e

Commit only if every check passes. To see what changed on the website since the tag, and pick single changes to undo with
`git revert`:

    git log --oneline design-v1-oct28..main -- web
