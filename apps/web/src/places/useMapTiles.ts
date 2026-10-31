import { useEffect, useState } from 'react'
import { fetchMapTiles } from './api'

/** Whether the map shows real tiles. False while the answer loads, so the local map never waits on it. */
export function useMapTiles(): boolean {
  const [tiles, setTiles] = useState(false)
  useEffect(() => {
    let current = true
    void fetchMapTiles().then((on) => current && setTiles(on))
    return () => {
      current = false
    }
  }, [])
  return tiles
}
