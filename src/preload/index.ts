import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import type { Api } from '../shared/types'

function subscribe<T>(channel: string, cb: (value: T) => void): () => void {
  const listener = (_e: IpcRendererEvent, value: T): void => cb(value)
  ipcRenderer.on(channel, listener)
  return () => ipcRenderer.removeListener(channel, listener)
}

const api: Api = {
  getData: () => ipcRenderer.invoke('data:get'),
  setStatus: (id, status) => ipcRenderer.invoke('posting:setStatus', id, status),
  startScan: () => ipcRenderer.invoke('scan:start'),
  openScope: () => ipcRenderer.invoke('scope:open'),
  checkScope: () => ipcRenderer.invoke('scope:check'),
  getSettings: () => ipcRenderer.invoke('settings:get'),
  saveSettings: (update) => ipcRenderer.invoke('settings:save', update),
  onProgress: (cb) => subscribe('scan:progress', cb),
  onScanDone: (cb) => subscribe('scan:done', cb),
  onScopeStatus: (cb) => subscribe('scope:status', cb)
}

contextBridge.exposeInMainWorld('api', api)
