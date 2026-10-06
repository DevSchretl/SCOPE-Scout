# SCOPE Scout

A Windows desktop app that scans the UBC Science Co-op job board (SCOPE), finds postings that are
new since the last scan, uses an AI model (Claude, DeepSeek, a local model in LM Studio, or any
OpenAI-compatible server) to pick and score the software/ML ones against your profile, and shows
the results in its own tables. It replaces the old Claude desktop scheduled task
(`Downloads\scope_scout\RUNBOOK.md`).

## First-time setup

1. `npm install` (Electron downloads its binary the first time the app runs).
2. Import the old workbook once (already done on this PC; the app data lives in
   `%APPDATA%\SCOPE Scout\`). The script refuses to overwrite existing data without `--force`.
   ```
   python tools/import_workbook.py
   ```
3. `npm run dev` to start the app.
4. **Settings** (the gear at the top right): pick an AI provider, add its key and model (see below)
   and check the profile.
   The profile is what the scorer counts as "met", so update it when you learn something new.
5. **Open SCOPE**: log in with your CWL and Duo in that window, then close it. The app keeps the
   session, but SCOPE logs you out after a while; the app then says "SCOPE login needed".

## AI providers

Each provider keeps its own settings, so you can switch back and forth.

| Provider | Server URL | Key | Notes |
| --- | --- | --- | --- |
| Claude | (built in) | console.anthropic.com | Structured output and prompt caching built in. |
| DeepSeek | `https://api.deepseek.com` | platform.deepseek.com | `deepseek-flash` (cheap) or `deepseek-v4-pro`. JSON mode "JSON object". |
| LM Studio | `http://localhost:1234/v1` | none | Start the server in the Developer tab, load a model with a context length of at least 8192, then **Check connection** to pick it. |
| Other | e.g. Ollama `http://localhost:11434/v1`, OpenRouter `https://openrouter.ai/api/v1` | if the server needs one | Try another JSON mode if scoring fails with a format error. |

**JSON mode** says how the server is asked for JSON: a full JSON schema (LM Studio, Ollama,
OpenAI), plain JSON (DeepSeek), or only the prompt (anything else). Every mode also puts the schema in
the prompt, and the app retries once when a model's answer isn't valid JSON. Prices in Settings
(USD per million tokens) only feed the cost shown in the scan summary; leave them at 0 for local
models. Small local models (under about 7B parameters) often get the scoring format wrong.

## Daily use

The navy bar at the top switches between three pages (or press Ctrl+1, 2 or 3), and holds the
search box (see Search below):

- **Home**: **Scan now**, **Open SCOPE**, which AI provider to use, and the latest scan's summary.
- **Postings**: the old workbook's sheets (a picks sheet per quick search, Near misses, In progress
  and All postings), chosen from the dropdown at the top left. **Filter** narrows a sheet by match,
  fit, organization, location, province, deadline, keywords, your status and more. Each sheet
  keeps its own filters, even after a restart. Click a row to read the posting.
- **Past runs**: every scan's summary, newest first, with what it cost.

Press **Scan now** on Home. One scan:

1. Opens each quick search in `src/shared/config.ts` and reads every results page, refreshing
   deadlines, applicant counts and SCOPE's application status.
2. Sends the titles of new postings to the AI, which picks the ones worth a full read (S27 has a
   stricter bar).
3. Reads those postings on SCOPE, one every 0.6 seconds.
4. Scores each one with the rubric in `src/main/prompts.ts` (from the old `reader_brief.md`).
5. Shows a summary (new picks rated 7/10+, good picks closing within 3 days, anything odd, cost)
   on Home and in Past runs, and a Windows notification.

Set **Status** on any posting (To apply, Drafting, Applied, Skip). Drafting and Applied move it to
In progress, as does any application SCOPE shows. Search covers the old RBC tab.

**Match /10** uses the workbook's formula: 10 x (0.45 x required share squared + 0.15 x preferred
share + 0.40 x (fit - 1) / 4), minus a competition penalty (10+ applicants -0.5, 30+ -1, 60+ -1.5)
and -0.5 for a thin description, rounded to 0.5.

## Search

The search box in the navy bar (Ctrl+K, or / when you aren't typing) searches every posting the
scans have listed: titles, organizations, locations, job IDs and, for postings the AI read, the
whole posting and the AI's notes. Results show as you type. Enter opens the Search page, with
filters, sorting and **Advanced** search (boxes that write the query for you).

| Type | To find |
| --- | --- |
| `data analyst` | postings with both words. A word also finds longer words it starts: `dev` finds developer |
| `"machine learning"` | the exact phrase |
| `python -senior` | python, but not senior |
| `react OR vue` | either word |
| `org:shopify`, `org:"Capital One"` | one organization |
| `city:vancouver` | a city, province or country (`location:` works too) |
| `title:intern`, `desc:`, `req:`, `notes:` | a word in the title, description, requirements or AI notes |
| `183097` or `id:183097` | a job ID |
| `term:w27`, `status:applied` | a term, or your status or SCOPE's (`status:none` for no status) |
| `in:title,org data` | words without a prefix only look in those fields |

Accents don't matter (`montreal` finds Montréal). Open postings come first, then closed ones and
ones gone from SCOPE. Best match ranks where the words appear (job ID, then title, organization,
location, requirements, description) and then how well the posting fits you. On the Postings
page, the search box can also add the words to the open sheet as a **Keywords** filter.

## Rules the code keeps

- **Read-only on SCOPE.** `src/main/scope-inpage.js` only clicks quick-search and page links and
  opens postings through the job-title view link. Nothing applies, shortlists or marks anything.
- **Your password never touches the app.** You log in yourself in the SCOPE window.
- **Posting text is data.** The model gets each posting as escaped JSON, has no tools, and must
  answer in a fixed JSON format. Planted "AI check" instructions are flagged, not followed.
- **No downloads**, and data stays on this PC. Only posting text and your profile go to the AI
  provider you pick (nothing leaves the PC with LM Studio). API keys are encrypted with Windows DPAPI.

## Where things live

| What | Where |
| --- | --- |
| Postings, scores, statuses, profile, scan history | `%APPDATA%\SCOPE Scout\scope-scout.json` |
| Copy taken before each scan | `%APPDATA%\SCOPE Scout\scope-scout.backup.json` |
| AI provider settings and encrypted API keys | `%APPDATA%\SCOPE Scout\settings.json` |
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
| `src/shared/` | Types, config and pure functions (match score, sections, parsing, sheets, filters, search) used everywhere |
| `src/main/scan.ts` | The scan pipeline |
| `src/main/scope.ts`, `scope-inpage.js` | The SCOPE window and the code that runs inside SCOPE pages |
| `src/main/ai.ts`, `prompts.ts` | Provider-neutral AI layer (JSON checking, retries, cost) and prompts |
| `src/main/providers/` | `anthropic.ts` for Claude, `openai.ts` for DeepSeek, LM Studio and other OpenAI-style servers |
| `src/main/store.ts`, `settings.ts` | Local storage |
| `src/renderer/src/` | The React UI: `pages/` (Home, Postings, Past runs) and `components/` |
| `tools/import_workbook.py` | One-time import from the old workbook |

During `npm run dev`, every POST the SCOPE window sends to SCOPE is printed in the terminal as
`[scope POST]`, so you can confirm the app stays read-only.

**Troubleshooting.** If Electron starts as plain Node (errors about `app` being undefined), the
terminal has `ELECTRON_RUN_AS_NODE` set; some VS Code extensions set it. Unset it, or run from a
normal terminal.
