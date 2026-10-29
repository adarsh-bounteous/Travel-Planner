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
  const [notice, setNotice] = useState<string | null>(null)
  const [toast, setToast] = useState<{ key: number; message: string } | null>(null)
  const here = location.pathname + location.search
  const busy = useRef(new Set<string>())

  const savedRef = useRef<Place[] | null>(null)
  savedRef.current = saved

  const add = useCallback(async (place: Place): Promise<boolean> => {
    if ((savedRef.current ?? []).some((p) => p.id === place.id)) {
      setNotice(`${place.name} is already saved.`)
      return false
    }
    setSaved((current) => [...(current ?? []).filter((p) => p.id !== place.id), place])
    try {
      await savePlace(place)
      setToast({ key: Date.now(), message: `${place.name} saved to your account.` })
      return true
    } catch {
      setSaved((current) => (current ?? []).filter((p) => p.id !== place.id))
      setFailed(true)
      return false
    }
  }, [])

  useEffect(() => {
    if (status === 'signedOut') setSaved([])
    if (status !== 'signedIn') return
    let cancelled = false
    void (async () => {
      // If they can't be loaded the cards show as not saved; only a failed change alerts.
      const list = await fetchSavedPlaces().catch(() => [] as Place[])
      if (cancelled) return
      savedRef.current = list // `add` below runs before the next render
      setSaved(list)
      const pending = readPending()
      if (!pending) return
      sessionStorage.removeItem(PENDING_KEY)
      takeReturnTo()
      setNotice(null)
      setFailed(false)
      setToast(null)
      await add(pending)
    })()
    return () => {
      cancelled = true
    }
  }, [status, add])

  const savedIds = useMemo(() => new Set((saved ?? []).map((p) => p.id)), [saved])

  /** Resolves to whether the change was made, so callers can confirm only real changes. */
  const toggle = async (place: Place): Promise<boolean> => {
    if (status !== 'signedIn') {
      sessionStorage.setItem(PENDING_KEY, JSON.stringify(place))
      rememberReturnTo(here)
      navigate('/sign-in')
      return false
    }
    if (busy.current.has(place.id)) return false
    let ok = true
    busy.current.add(place.id)
    setPendingIds(new Set(busy.current))
    setFailed(false)
    setNotice(null)
    setToast(null)
    if (savedIds.has(place.id)) {
      setSaved((current) => (current ?? []).filter((p) => p.id !== place.id))
      try {
        await unsavePlace(place.id)
      } catch {
        setSaved((current) => [...(current ?? []), place])
        setFailed(true)
        ok = false
      }
    } else {
      ok = await add(place)
    }
    busy.current.delete(place.id)
    setPendingIds(new Set(busy.current))
    return ok
  }

  /** Saves the place unless it is already saved, so it never unsaves. Resolves to whether it is saved. */
  const ensureSaved = (place: Place): Promise<boolean> => {
    if ((savedRef.current ?? []).some((p) => p.id === place.id)) return Promise.resolve(true)
    return status === 'signedIn' ? add(place) : Promise.resolve(false)
  }

  const panel = (
    <>
      {failed && (
        <p role="alert" className="alert alert-danger">
          We couldn't update your saved places. Try again.
        </p>
      )}
      {notice && (
        <p role="status" className="alert alert-info">
          {notice}
        </p>
      )}
      {toast && <Toast key={toast.key} message={toast.message} />}
    </>
  )

  return { savedIds, saved, toggle, ensureSaved, pendingIds, panel }
}
