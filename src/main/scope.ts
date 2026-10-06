// The SCOPE window: a Chromium window with its own saved session where you log in yourself.
// The app never sees your password; it only reads SCOPE pages through scope-inpage.js.

import { app, BrowserWindow, session, type WebContents } from 'electron'
import { is } from '@electron-toolkit/utils'
import { SCOPE_HOST, SCOPE_POSTINGS_URL } from '../shared/config'
import type { ScopeStatus } from '../shared/types'
import inPageSource from './scope-inpage.js?raw'

const PARTITION = 'persist:scope'

export class LoginNeededError extends Error {
  constructor() {
    super('SCOPE login needed')
  }
}

export interface RawRow {
  id: string
  title: string
  org: string
  location: string
  applicants: string
  deadline: string
  appStatus: string
  canRead: boolean
}

let win: BrowserWindow | null = null
let quitting = false
let busy = false
let reportStatus: (s: ScopeStatus) => void = () => {}

export function initScope(onStatus: (s: ScopeStatus) => void): void {
  reportStatus = onStatus
  app.on('before-quit', () => (quitting = true))
  const ses = session.fromPartition(PARTITION)
  // SCOPE data is read from the page; nothing is ever downloaded.
  ses.on('will-download', (event) => event.preventDefault())
  // Look like plain Chrome so CWL and Duo don't flag an unfamiliar browser.
  ses.setUserAgent(
    `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${process.versions.chrome} Safari/537.36`
  )
  if (is.dev) {
    // Read-only check during development: log every POST the SCOPE window sends to SCOPE.
    ses.webRequest.onBeforeRequest({ urls: [`*://${SCOPE_HOST}/*`] }, (details, callback) => {
      if (details.method === 'POST') console.log(`[scope POST] ${details.url}`)
      callback({})
    })
  }
}

/** While a scan runs, nothing else may navigate the SCOPE window. */
export function setBusy(value: boolean): void {
  busy = value
}

function getWindow(): BrowserWindow {
  if (win && !win.isDestroyed()) return win
  win = new BrowserWindow({
    width: 1200,
    height: 860,
    show: false,
    title: 'SCOPE',
    autoHideMenuBar: true,
    webPreferences: {
      partition: PARTITION,
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      // Scans run with the window hidden; don't let Chromium slow its timers.
      backgroundThrottling: false
    }
  })
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  win.webContents.on('did-finish-load', () => reportStatus(pageStatus()))
  // Closing only hides it, so the session and page stay ready for the next scan.
  win.on('close', (event) => {
    if (quitting) return
    event.preventDefault()
    win?.hide()
  })
  return win
}

function host(wc: WebContents): string {
  try {
    return new URL(wc.getURL()).host
  } catch {
    return ''
  }
}

function pageStatus(): ScopeStatus {
  const wc = getWindow().webContents
  if (host(wc) !== SCOPE_HOST) return 'login-needed'
  if (/Not Logged In/i.test(wc.getTitle())) return 'login-needed'
  return 'logged-in'
}

function waitFor(
  wc: WebContents,
  event: 'did-stop-loading' | 'did-finish-load',
  timeoutMs = 45000
): Promise<void> {
  return new Promise((resolve) => {
    const done = (): void => {
      clearTimeout(timer)
      wc.off(event as 'did-stop-loading', done)
      resolve()
    }
    const timer = setTimeout(done, timeoutMs)
    wc.on(event as 'did-stop-loading', done)
  })
}

async function load(url: string): Promise<void> {
  const wc = getWindow().webContents
  try {
    await wc.loadURL(url)
  } catch (e) {
    // A redirect can abort the first load; wait for the page it ends on.
    const code = (e as { code?: string }).code
    if (wc.isLoading()) await waitFor(wc, 'did-stop-loading')
    else if (code !== 'ERR_ABORTED')
      throw new Error(`SCOPE could not be reached (${code ?? String(e)})`)
  }
}

function withTimeout<T>(promise: Promise<T>, ms: number, what: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${what} timed out`)), ms)
    promise.then(
      (v) => (clearTimeout(timer), resolve(v)),
      (e) => (clearTimeout(timer), reject(e))
    )
  })
}

/** Runs `window.__scout.<call>` in the page, installing the helper first if needed. */
async function inPage<T>(call: string, timeoutMs = 60000): Promise<T> {
  const wc = getWindow().webContents
  if (pageStatus() !== 'logged-in') throw new LoginNeededError()
  const installed = await wc.executeJavaScript('typeof window.__scout !== "undefined"')
  if (!installed) await wc.executeJavaScript(inPageSource)
  return withTimeout(wc.executeJavaScript(`window.__scout.${call}`), timeoutMs, call.split('(')[0])
}

/** Loads the postings page; throws LoginNeededError when SCOPE wants a login. */
export async function openPostings(): Promise<void> {
  await load(SCOPE_POSTINGS_URL)
  const status = pageStatus()
  reportStatus(status)
  if (status !== 'logged-in') throw new LoginNeededError()
}

/** Clicks a saved quick search by its exact text. False when the link isn't there. */
export async function openQuickSearch(name: string): Promise<boolean> {
  await openPostings()
  const wc = getWindow().webContents
  const loaded = waitFor(wc, 'did-finish-load')
  const res = await inPage<{ ok: boolean }>(`clickQuickSearch(${JSON.stringify(name)})`)
  if (!res.ok) return false
  await loaded // the click reloads the page
  if (pageStatus() !== 'logged-in') throw new LoginNeededError()
  return true
}

export const activePage = (): Promise<number> => inPage<number>('activePage()')
export const listRows = (): Promise<RawRow[]> => inPage<RawRow[]>('listRows()')

export function goToPage(n: number): Promise<{ ok: boolean; reason?: string }> {
  return inPage(`goToPage(${n})`)
}

export function readPosting(
  id: string
): Promise<{ ok: boolean; fields?: Record<string, string>; error?: string }> {
  return inPage(`readPosting(${JSON.stringify(id)})`)
}

/** Shows the window so you can log in or look around. */
export async function showScope(): Promise<void> {
  if (busy) return
  const w = getWindow()
  if (!w.webContents.getURL()) await load(SCOPE_POSTINGS_URL).catch(() => undefined)
  w.show()
  w.focus()
}

/** Checks the login without disturbing a scan or a visible window. */
export async function checkScope(): Promise<ScopeStatus> {
  const w = getWindow()
  if (busy || w.isVisible()) return pageStatus()
  try {
    await openPostings()
    return 'logged-in'
  } catch (e) {
    if (e instanceof LoginNeededError) return 'login-needed'
    reportStatus('error')
    return 'error'
  }
}
