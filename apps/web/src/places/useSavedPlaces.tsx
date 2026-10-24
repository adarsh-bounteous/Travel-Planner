import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router'
import { useAuth } from '../auth/AuthProvider'
import { rememberReturnTo, takeReturnTo } from '../auth/returnTo'
import { Toast } from '../trips/Toast'
import { fetchSavedPlaces, savePlace, unsavePlace } from './api'
import type { Place } from './api'

const PENDING_KEY = 'pendingSave'

const readPending = (): Place | null => {
  try {
    return JSON.parse(sessionStorage.getItem(PENDING_KEY) ?? 'null') as Place | null
  } catch {
    return null
  }
}

/**
 * The traveller's saved places, account-wide (never read from or written to a trip). Saving and
 * unsaving show at once and roll back if the call fails. A signed-out visitor is sent to sign in
 * and the place they chose is saved when they come back. `panel` holds the alert and toast.
 */
export function useSavedPlaces() {
  const { status } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const [saved, setSaved] = useState<Place[] | null>(null)
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set())
  const [failed, setFailed] = useState(false)
  const [toast, setToast] = useState<{ key: number; message: string } | null>(null)
  const here = location.pathname + location.search
  const busy = useRef(new Set<string>())

  const add = useCallback(
    async (place: Place) => {
      setSaved((current) => [...(current ?? []).filter((p) => p.id !== place.id), place])
      try {
        await savePlace(place)
      } catch {
        setSaved((current) => (current ?? []).filter((p) => p.id !== place.id))
        setFailed(true)
      }
    },
    [],
  )

  useEffect(() => {
    if (status === 'signedOut') setSaved([])
    if (status !== 'signedIn') return
    let cancelled = false
    void (async () => {
      // If they can't be loaded the cards show as not saved; only a failed change alerts.
      const list = await fetchSavedPlaces().catch(() => [] as Place[])
      if (cancelled) return
      setSaved(list)
      const pending = readPending()
      if (!pending) return
      sessionStorage.removeItem(PENDING_KEY)
      takeReturnTo()
      await add(pending)
      setToast({ key: Date.now(), message: `${pending.name} saved to your account.` })
    })()
    return () => {
      cancelled = true
    }
  }, [status, add])

  const savedIds = useMemo(() => new Set((saved ?? []).map((p) => p.id)), [saved])

  const toggle = async (place: Place) => {
    if (status !== 'signedIn') {
      sessionStorage.setItem(PENDING_KEY, JSON.stringify(place))
      rememberReturnTo(here)
      navigate('/sign-in')
      return
    }
    if (busy.current.has(place.id)) return
    busy.current.add(place.id)
    setPendingIds(new Set(busy.current))
    setFailed(false)
    setToast(null)
    if (savedIds.has(place.id)) {
      setSaved((current) => (current ?? []).filter((p) => p.id !== place.id))
      try {
        await unsavePlace(place.id)
      } catch {
        setSaved((current) => [...(current ?? []), place])
        setFailed(true)
      }
    } else {
      await add(place)
    }
    busy.current.delete(place.id)
    setPendingIds(new Set(busy.current))
  }

  const panel = (
    <>
      {failed && (
        <p role="alert" className="alert alert-danger">
          We couldn't update your saved places. Try again.
        </p>
      )}
      {toast && <Toast key={toast.key} message={toast.message} />}
    </>
  )

  return { savedIds, saved, toggle, pendingIds, panel }
}
