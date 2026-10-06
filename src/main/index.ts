import { app, BrowserWindow, dialog, ipcMain, Notification, shell } from 'electron'
import { join } from 'path'
import { electronApp, is, optimizer } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { PROVIDERS } from '../shared/config'
import {
  MY_STATUSES,
  type AppData,
  type ModelList,
  type MyStatus,
  type RunRecord,
  type SettingsUpdate
} from '../shared/types'
import { describeAiError } from './ai'
import { listModels } from './providers/openai'
import { isScanning, runScan } from './scan'
import { checkScope, initScope, showScope } from './scope'
import { getSettingsView, storedApiKey, updateSettings } from './settings'
import { getStore, saveStore, storePath } from './store'

let mainWindow: BrowserWindow | null = null

function send(channel: string, ...args: unknown[]): void {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send(channel, ...args)
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    show: false,
    title: 'SCOPE Scout',
    autoHideMenuBar: true,
    icon,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: true,
      contextIsolation: true
    }
  })
  mainWindow.on('ready-to-show', () => mainWindow?.show())
  // The SCOPE window stays alive hidden, so closing the main window quits explicitly.
  mainWindow.on('closed', () => app.quit())
  mainWindow.webContents.setWindowOpenHandler((details) => {
    if (details.url.startsWith('https://')) shell.openExternal(details.url)
    return { action: 'deny' }
  })
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

function notify(run: RunRecord): void {
  if (!Notification.isSupported()) return
  const s = run.summary
  let body: string
  if (run.status === 'login-needed')
    body = 'SCOPE login needed. Open SCOPE, log in, then scan again.'
  else if (run.status === 'error') body = s.notes.at(-1) ?? 'The scan stopped with an error.'
  else {
    body = `${s.newListed} new, ${s.read} read. `
    body += s.newPicks.length
      ? `${s.newPicks.length} new picks rated 7+.`
      : 'No new picks rated 7+.'
    if (s.dueSoon.length) body += ` ${s.dueSoon.length} good picks close in the next 3 days.`
  }
  const n = new Notification({ title: 'SCOPE Scout', body })
  n.on('click', () => mainWindow?.show())
  n.show()
}

function registerIpc(): void {
  ipcMain.handle('data:get', (): AppData => ({
    postings: Object.values(getStore().postings),
    lastRun: getStore().runs.at(-1) ?? null,
    scanning: isScanning()
  }))

  ipcMain.handle('posting:setStatus', (_e, id: unknown, status: unknown) => {
    const p = typeof id === 'string' ? getStore().postings[id] : undefined
    if (!p || !MY_STATUSES.includes(status as MyStatus)) throw new Error('Invalid status change')
    p.myStatus = status as MyStatus
    saveStore()
  })

  ipcMain.handle('scan:start', () => {
    if (isScanning()) return { started: false, reason: 'A scan is already running.' }
    void runScan((text) => send('scan:progress', text))
      .then((run) => {
        send('scan:done', run)
        notify(run)
      })
      .catch((e) =>
        send('scan:progress', `Scan failed: ${e instanceof Error ? e.message : String(e)}`)
      )
    return { started: true }
  })

  ipcMain.handle('scope:open', () => showScope())
  ipcMain.handle('scope:check', () => checkScope())

  ipcMain.handle('settings:get', () => getSettingsView())
  // updateSettings checks each field itself.
  ipcMain.handle('settings:save', (_e, update: unknown) =>
    updateSettings(update && typeof update === 'object' ? (update as SettingsUpdate) : {})
  )

  ipcMain.handle(
    'ai:listModels',
    async (_e, provider: unknown, baseUrl: unknown, apiKey: unknown): Promise<ModelList> => {
      const preset = PROVIDERS.find((p) => p.id === provider)
      if (!preset || preset.kind !== 'openai' || typeof baseUrl !== 'string' || !baseUrl.trim()) {
        return { ok: false, error: 'Enter the server URL first.' }
      }
      const key = (typeof apiKey === 'string' && apiKey.trim()) || storedApiKey(preset.id)
      try {
        return { ok: true, models: await listModels(baseUrl.trim(), key) }
      } catch (e) {
        return { ok: false, error: describeAiError(e) }
      }
    }
  )
}

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.devdan.scopescout')
  app.on('browser-window-created', (_, window) => optimizer.watchWindowShortcuts(window))

  try {
    getStore()
  } catch (e) {
    dialog.showErrorBox(
      'SCOPE Scout',
      `Could not read ${storePath()}:\n${e instanceof Error ? e.message : String(e)}`
    )
    app.quit()
    return
  }

  initScope((status) => send('scope:status', status))
  registerIpc()
  createWindow()
})

app.on('window-all-closed', () => app.quit())
