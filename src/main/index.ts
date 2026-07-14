import { app, BrowserWindow, ipcMain } from 'electron'
import { join } from 'node:path'
import { DeviceRegistry } from './deviceRegistry'
import { startMdnsDiscovery } from './discovery/mdns'
import { startShureDiscovery } from './discovery/shure'
import { SapListener } from './audio/sap'
import { monitorAes67Stream } from './audio/aes67'
import { loadCompanionConfig } from './companion/routesConfig'
import { CompanionClient } from './companion/companionClient'
import type { CompanionStatus, CrosspointRequest, MainToRendererEvent } from '../shared/types'

const registry = new DeviceRegistry()
let broadcastEvent: ((event: MainToRendererEvent) => void) | null = null

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  broadcastEvent = (event: MainToRendererEvent) => win.webContents.send('mic-monitor:event', event)
  registry.on('event', (event: MainToRendererEvent) => broadcastEvent?.(event))

  if (process.env.ELECTRON_RENDERER_URL) {
    win.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

function startDiscovery(): void {
  const mdns = startMdnsDiscovery(registry)
  const shure = startShureDiscovery(registry)

  const sap = new SapListener()
  const activeStreams = new Map<string, ReturnType<typeof monitorAes67Stream>>()
  sap.on('session', (session) => {
    if (activeStreams.has(session.sessionId)) return
    const handle = monitorAes67Stream(session, (updates) => {
      const device = registry.get(`aes67:${session.sessionId}`)
      const channels = updates.map((u) => ({
        id: `aes67:${session.sessionId}:${u.channelIndex}`,
        name: `${session.name} ch${u.channelIndex + 1}`,
        rfLevel: null,
        audioLevelDb: u.smoothedDb,
        batteryPercent: null,
        batteryMinutesRemaining: null,
        antenna: null
      }))
      registry.upsert({
        id: `aes67:${session.sessionId}`,
        vendor: 'unknown-dante',
        name: session.name,
        address: session.originAddress,
        port: session.port,
        transport: 'aes67',
        identified: true,
        channels: device ? mergeChannels(device.channels, channels) : channels
      })
    })
    activeStreams.set(session.sessionId, handle)
  })
  sap.on('session-deleted', (sessionId) => {
    activeStreams.get(sessionId)?.stop()
    activeStreams.delete(sessionId)
    registry.remove(`aes67:${sessionId}`)
  })
  sap.start()

  const pruneTimer = setInterval(() => registry.pruneStale(120_000), 30_000)

  app.on('before-quit', () => {
    mdns.stop()
    shure.stop()
    sap.stop()
    for (const handle of activeStreams.values()) handle.stop()
    clearInterval(pruneTimer)
  })
}

function registerIpcHandlers(): void {
  ipcMain.handle('mic-monitor:list-devices', () => registry.list())

  ipcMain.handle('mic-monitor:companion-status', async (): Promise<CompanionStatus> => {
    const config = loadCompanionConfig()
    if (!config) return { configured: false, host: null, port: null, reachable: null, canClear: false }
    const reachable = await new CompanionClient(config).checkReachable()
    return {
      configured: true,
      host: config.host,
      port: config.port,
      reachable,
      canClear: config.clearCrosspointButton !== null
    }
  })

  ipcMain.handle('mic-monitor:make-crosspoint', async (_e, request: CrosspointRequest) => {
    const config = loadCompanionConfig()
    if (!config) throw new Error('No companion-routes.json configured - see README')
    await new CompanionClient(config).makeCrosspoint(request)
  })

  ipcMain.handle('mic-monitor:clear-crosspoint', async (_e, destinationChannel: string, destinationDevice: string) => {
    const config = loadCompanionConfig()
    if (!config) throw new Error('No companion-routes.json configured - see README')
    await new CompanionClient(config).clearCrosspoint(destinationChannel, destinationDevice)
  })
}

app.whenReady().then(() => {
  registerIpcHandlers()
  createWindow()
  startDiscovery()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

function mergeChannels<T extends { id: string }>(existing: T[], incoming: T[]): T[] {
  const byId = new Map(existing.map((c) => [c.id, c]))
  for (const channel of incoming) byId.set(channel.id, channel)
  return [...byId.values()]
}
