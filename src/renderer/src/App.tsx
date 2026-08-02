import { useEffect } from 'react'
import { connectDeviceStore, useDeviceStore } from './store'
import { DeviceList } from './components/DeviceList'
import { RoutingPanel } from './components/RoutingPanel'
import { MonitorBar } from './components/MonitorBar'
import { DiagnosticsPanel } from './components/DiagnosticsPanel'

export function App(): JSX.Element {
  const devices = useDeviceStore((state) => [...state.devices.values()])

  useEffect(() => {
    const disconnect = connectDeviceStore()
    return disconnect
  }, [])

  return (
    <div className="app">
      <header className="app__header">
        <h1>MicWizard</h1>
        <p>Discovering Shure, Sennheiser, and AES67/Dante devices on the local network.</p>
        {/* Opens the shared About dialog — see public/about.js, which delegates
            this attribute from the document, so nothing needs importing here. */}
        <button type="button" className="about-btn" data-stoatworks-about>
          About
        </button>
      </header>
      <main>
        <MonitorBar />
        <DeviceList devices={devices} />
        <RoutingPanel />
        <DiagnosticsPanel />
      </main>
    </div>
  )
}
