import { useEffect, useState } from 'react'
import { searchDestinations } from './api'
import type { DestinationSearchResult } from './api'

export const MIN_QUERY_LENGTH = 2
export const DEBOUNCE_MS = 300

export type DestinationSearchState = {
  status: 'idle' | 'searching' | 'done' | 'failed'
  result: DestinationSearchResult | null
}

const IDLE: DestinationSearchState = { status: 'idle', result: null }

/** Searches as the traveller types: waits for two characters, debounces, and drops stale requests. */
export function useDestinationSearch(query: string): DestinationSearchState {
  const [state, setState] = useState<DestinationSearchState>(IDLE)
  const text = query.trim()

  useEffect(() => {
    if (text.length < MIN_QUERY_LENGTH) {
      setState(IDLE)
      return
    }
    setState((previous) => ({ status: 'searching', result: previous.result }))
    const controller = new AbortController()
    const timer = setTimeout(() => {
      searchDestinations(text, controller.signal)
        .then((result) => setState({ status: 'done', result }))
        .catch(() => {
          if (!controller.signal.aborted) setState({ status: 'failed', result: null })
        })
    }, DEBOUNCE_MS)
    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [text])

  return state
}
