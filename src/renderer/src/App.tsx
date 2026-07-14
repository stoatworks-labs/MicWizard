import { useEffect } from 'react'
import { connectDeviceStore, useDeviceStore } from './store'
import { DeviceList } from './components/DeviceList'
import { RoutingPanel } from './components/RoutingPanel'

export function App(): JSX.Element {
  const devices = useDeviceStore((state) => [...state.devices.values()])

  useEffect(() => {
    const disconnect = connectDeviceStore()
    return disconnect
  }, [])

  return (
    <div className="app">
      <header className="app__header">
        <h1>Wireless Mic Monitor</h1>
        <p>Discovering Shure, Sennheiser, and AES67/Dante devices on the local network.</p>
      </header>
      <main>
        <DeviceList devices={devices} />
        <RoutingPanel />
      </main>
    </div>
  )
}
