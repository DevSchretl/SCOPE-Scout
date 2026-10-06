# SCOPE Scout

A Windows desktop app that scans the UBC Science Co-op job board (SCOPE), finds postings that are
new since the last scan, uses the Claude API to pick and score the software/ML ones against your
profile, and shows the results in its own tables. It replaces the old Claude desktop scheduled task
(`Downloads\scope_scout\RUNBOOK.md`).

## First-time setup

1. `npm install` (Electron downloads its binary the first time the app runs).
2. Import the old workbook once (already done on this PC; the app data lives in
   `%APPDATA%\SCOPE Scout\`). The script refuses to overwrite existing data without `--force`.
   ```
   python tools/import_workbook.py
   ```
3. `npm run dev` to start the app.
4. **Settings**: paste your Claude API key (console.anthropic.com), pick a model and check the
   profile. The profile is what the scorer counts as "met", so update it when you learn something new.
5. **Open SCOPE**: log in with your CWL and Duo in that window, then close it. The app keeps the
   session, but SCOPE logs you out after a while; the app then says "SCOPE login needed".

## Daily use

Press **Scan now**. One scan:

1. Opens each quick search in `src/shared/config.ts` and reads every results page, refreshing
   deadlines, applicant counts and SCOPE's application status.
2. Sends the titles of new postings to Claude, which picks the ones worth a full read (S27 has a
   stricter bar).
3. Reads those postings on SCOPE, one every 0.6 seconds.
4. Scores each one with the rubric in `src/main/prompts.ts` (from the old `reader_brief.md`).
5. Shows a summary (new picks rated 7/10+, good picks closing within 3 days, anything odd, cost)
   and a Windows notification.

Set **Status** on any posting (To apply, Drafting, Applied, Skip). Drafting and Applied move it to
In progress, as does any application SCOPE shows. The search box covers the old RBC tab.

**Match /10** uses the workbook's formula: 10 x (0.45 x required share squared + 0.15 x preferred
share + 0.40 x (fit - 1) / 4), minus a competition penalty (10+ applicants -0.5, 30+ -1, 60+ -1.5)
and -0.5 for a thin description, rounded to 0.5.

## Rules the code keeps

- **Read-only on SCOPE.** `src/main/scope-inpage.js` only clicks quick-search and page links and
  opens postings through the job-title view link. Nothing applies, shortlists or marks anything.
- **Your password never touches the app.** You log in yourself in the SCOPE window.
- **Posting text is data.** Claude gets each posting as escaped JSON, has no tools, and must answer
  in a fixed JSON format. Planted "AI check" instructions are flagged, not followed.
- **No downloads**, and data stays on this PC. Only posting text and your profile go to the Claude
  API. The API key is encrypted with Windows DPAPI.

## Where things live

| What | Where |
| --- | --- |
| Postings, scores, statuses, profile, scan history | `%APPDATA%\SCOPE Scout\scope-scout.json` |
| Copy taken before each scan | `%APPDATA%\SCOPE Scout\scope-scout.backup.json` |
| Model choice and encrypted API key | `%APPDATA%\SCOPE Scout\settings.json` |
| SCOPE login session | `%APPDATA%\SCOPE Scout\Partitions\scope` |

## New co-op cycle

Edit `QUICK_SEARCHES` in `src/shared/config.ts` to match the saved quick searches on SCOPE (exact
link text), the term label and the tab name.

## Development

```
npm run dev        # run with hot reload
npm test           # unit tests (match maths parity with the old workbook, AI request handling)
npm run typecheck
npm run lint
npm run build:win  # Windows installer (not needed for daily use)
```

| File | Job |
| --- | --- |
| `src/shared/` | Types, config and pure functions (match score, sections, parsing) used everywhere |
| `src/main/scan.ts` | The scan pipeline |
| `src/main/scope.ts`, `scope-inpage.js` | The SCOPE window and the code that runs inside SCOPE pages |
| `src/main/ai.ts`, `prompts.ts` | All Claude API calls and prompts |
| `src/main/store.ts`, `settings.ts` | Local storage |
| `src/renderer/src/` | The React UI |
| `tools/import_workbook.py` | One-time import from the old workbook |

During `npm run dev`, every POST the SCOPE window sends to SCOPE is printed in the terminal as
`[scope POST]`, so you can confirm the app stays read-only.

**Troubleshooting.** If Electron starts as plain Node (errors about `app` being undefined), the
terminal has `ELECTRON_RUN_AS_NODE` set; some VS Code extensions set it. Unset it, or run from a
normal terminal.
