import { COLOR as C, arrow, box, legend, stack, svg, text, title, zone } from "./kit.mjs";

/** The CI/CD pipeline as it is set up: from a developer's change to the live site, with the steps that are not set up marked apart. */
export function cicd() {
  const jobs = stack({
    x: 660, y: 150, w: 480, gap: 12,
    items: [
      { title: "web, lint, tests and build", lines: ["pnpm install (frozen lockfile), ESLint,", "Vitest with a coverage floor, then", "next build"], color: C.ci },
      { title: "web, browser tests", lines: ["Redis service, Chromium, then every", "Playwright test, with axe scans, against", "a fake API. Traces are kept if one fails."], color: C.ci },
      { title: "api, lint and tests", lines: ["Postgres + pgvector service, ruff, import", "check, Alembic migrations, pytest with a", "coverage floor, evaluation thresholds, and", "a check that no commit credits a tool"], color: C.ci },
      { title: "dependency audit: 2 jobs, weekly too", lines: ["pnpm audit (high) and pip-audit, on every", "push and every Monday at 15:00 UTC"], color: C.ci },
    ],
  });
  const zoneBottom = jobs.bottom + 24;
  const afterTop = zoneBottom + 70;
  const parts = [
    title("Brief: CI/CD pipeline", "What happens from a change on a laptop to the live site. Solid boxes are set up. Dashed grey boxes are recommended and not set up."),
    box({ x: 30, y: 150, w: 250, h: 150, title: "1 Developer", lines: ["Works on a short branch", "Pre-commit hooks check", "whitespace, big files,", "merge marks and YAML"], color: C.person }),
    box({ x: 330, y: 150, w: 250, h: 150, title: "2 Pull request", lines: ["Push the branch, open a", "PR into main. main is", "protected: changes come", "in only by pull request"], color: C.person }),
    zone({ x: 640, y: 112, w: 520, h: zoneBottom - 112, label: "3 GitHub Actions: every push and PR", color: C.ci }),
    jobs.svg,
    box({ x: 1200, y: 150, w: 270, h: 200, title: "4 Branch rules on main", lines: ["The 3 CI jobs must pass.", "The audits and 2 Vercel", "checks also run on each", "PR, but are not required.", "No force pushes, no", "deleting main."], color: C.ci }),
    box({ x: 1200, y: 390, w: 270, h: 120, title: "5 Merge", lines: ["Rebase merge only (the", "history stays linear).", "The branch is deleted."], color: C.person }),
    zone({ x: 640, y: afterTop, w: 830, h: 200, label: "6 After the merge to main", color: C.api }),
    box({ x: 660, y: afterTop + 40, w: 250, h: 140, title: "Vercel", lines: ["Builds and deploys the", "website. Pull requests", "get a preview build."], color: C.web }),
    box({ x: 930, y: afterTop + 40, w: 250, h: 140, title: "Render", lines: ["Builds the API image", "from api/Dockerfile and", "deploys it (auto-deploy)."], color: C.api }),
    box({ x: 1200, y: afterTop + 40, w: 250, h: 140, title: "CI again on main", lines: ["The same jobs and the", "audit run on main, so", "the merged result is", "tested as well."], color: C.ci }),
    box({ x: 30, y: afterTop, w: 550, h: 200, title: "7 The live site, watched", lines: ["briefcontracts.com (Vercel) and the API (Render).", "UptimeRobot checks the website and the API's", "/health/ready every 5 minutes and emails on a failure.", "/health/ready answers 200 only when the database", "responds and its migrations are current."], color: C.mon }),
    box({ x: 30, y: 340, w: 250, h: 120, title: "Not set up: staging", lines: ["A staging site to try", "a change before it", "goes live"], color: C.rec, dashed: true }),
    box({ x: 330, y: 340, w: 250, h: 120, title: "Not set up: smoke test", lines: ["A check of the live site", "right after each deploy"], color: C.rec, dashed: true }),
    box({ x: 30, y: 500, w: 250, h: 120, title: "Not set up: rollback", lines: ["Automatic rollback if the", "new version fails its", "health check"], color: C.rec, dashed: true }),
    box({ x: 330, y: 500, w: 250, h: 120, title: "Not set up: backups", lines: ["Database backups and a", "tested restore (listed in", "infra/DEPLOY.md)"], color: C.rec, dashed: true }),
    arrow({ pts: [[280, 225], [330, 225]], color: "#1b1b1f" }),
    arrow({ pts: [[580, 225], [640, 225]], color: "#1b1b1f" }),
    arrow({ pts: [[1160, 245], [1200, 245]], color: C.ci }),
    arrow({ pts: [[1335, 350], [1335, 390]], color: "#1b1b1f", label: "pass", at: [1380, 370], anchor: "start" }),
    arrow({ pts: [[1335, 510], [1335, afterTop]], color: "#1b1b1f", label: "main changes", at: [1380, 580], anchor: "start" }),
    arrow({ pts: [[640, afterTop + 100], [580, afterTop + 100]], color: C.mon, label: "live", at: [610, afterTop + 78] }),
  ];
  return svg(parts.join(""), { height: afterTop + 240 });
}
