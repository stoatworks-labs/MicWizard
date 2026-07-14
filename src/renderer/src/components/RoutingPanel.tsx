import { useEffect, useState } from 'react'
import type { CompanionStatus } from '../../../shared/types'
import { useDeviceStore } from '../store'

type SubmitState = 'idle' | 'sending' | 'ok' | 'error'

const FIELD_LABELS = {
  sourceChannel: 'Source channel',
  sourceDevice: 'Source device',
  destinationChannel: 'Destination channel',
  destinationDevice: 'Destination device'
} as const

export function RoutingPanel(): JSX.Element | null {
  const [status, setStatus] = useState<CompanionStatus | null>(null)
  const [fields, setFields] = useState({
    sourceChannel: '',
    sourceDevice: '',
    destinationChannel: '',
    destinationDevice: ''
  })
  const [routeState, setRouteState] = useState<SubmitState>('idle')
  const [clearState, setClearState] = useState<SubmitState>('idle')
  const [error, setError] = useState<string | null>(null)
  const knownDeviceNames = useDeviceStore((state) => [...new Set([...state.devices.values()].map((d) => d.name))])

  useEffect(() => {
    window.micMonitor.companionStatus().then(setStatus)
  }, [])

  if (!status) return null

  if (!status.configured) {
    return (
      <section className="routing-panel routing-panel--unavailable">
        <h2>Dante routing</h2>
        <p>
          No <code>companion-routes.json</code> found - this app only monitors audio/battery/RF by default. To
          route Dante channels from here, run your own{' '}
          <a href="https://bitfocus.io/companion" target="_blank" rel="noreferrer">
            Bitfocus Companion
          </a>{' '}
          with a single "Make Crosspoint" button configured (see the README for the exact setup), then copy{' '}
          <code>companion-routes.example.json</code> from the repo root into your user data folder as{' '}
          <code>companion-routes.json</code>.
        </p>
      </section>
    )
  }

  const setField = (key: keyof typeof fields) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setFields((f) => ({ ...f, [key]: e.target.value }))

  const route = async (): Promise<void> => {
    setRouteState('sending')
    setError(null)
    try {
      await window.micMonitor.makeCrosspoint(fields)
      setRouteState('ok')
    } catch (err) {
      setRouteState('error')
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  const clear = async (): Promise<void> => {
    setClearState('sending')
    setError(null)
    try {
      await window.micMonitor.clearCrosspoint(fields.destinationChannel, fields.destinationDevice)
      setClearState('ok')
    } catch (err) {
      setClearState('error')
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  return (
    <section className="routing-panel">
      <h2>
        Dante routing via Companion ({status.host}:{status.port}){' '}
        <span className={`routing-panel__reachable routing-panel__reachable--${status.reachable ? 'ok' : 'down'}`}>
          {status.reachable ? 'connected' : 'unreachable'}
        </span>
      </h2>
      <datalist id="known-device-names">
        {knownDeviceNames.map((name) => (
          <option key={name} value={name} />
        ))}
      </datalist>
      <div className="routing-panel__form">
        {(Object.keys(FIELD_LABELS) as Array<keyof typeof fields>).map((key) => (
          <label key={key} className="routing-panel__field">
            {FIELD_LABELS[key]}
            <input
              type="text"
              value={fields[key]}
              onChange={setField(key)}
              list={key.startsWith('source') ? 'known-device-names' : undefined}
            />
          </label>
        ))}
      </div>
      <div className="routing-panel__actions">
        <button onClick={route} disabled={routeState === 'sending'}>
          {actionLabel(routeState, 'Route')}
        </button>
        {status.canClear && (
          <button onClick={clear} disabled={clearState === 'sending'}>
            {actionLabel(clearState, 'Clear destination')}
          </button>
        )}
      </div>
      {error && <p className="routing-panel__error">{error}</p>}
    </section>
  )
}

function actionLabel(state: SubmitState, idleLabel: string): string {
  switch (state) {
    case 'sending':
      return 'Sending…'
    case 'ok':
      return `${idleLabel} ✓`
    case 'error':
      return `${idleLabel} - retry`
    default:
      return idleLabel
  }
}
