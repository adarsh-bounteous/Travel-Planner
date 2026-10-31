import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

// First path segment of every literal passed to the API clients' call/fetch/post/assign.
const CALL = /\b(?:call(?:<[^(]*?>)?|fetch|post|assign)\(\s*[`'"](\/[^/?`'"$]*)/g

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) return entry.name === 'node_modules' ? [] : sourceFiles(path)
    return /\.tsx?$/.test(entry.name) && !/\.test\./.test(entry.name) ? [path] : []
  })
}

/** Test support: every API path the web app's client modules call, by first segment. */
export function clientApiPaths(srcDir: string): { path: string; file: string }[] {
  return sourceFiles(srcDir).flatMap((file) =>
    [...readFileSync(file, 'utf8').matchAll(CALL)]
      .filter((match) => match[1].length > 1)
      .map((match) => ({ path: match[1], file })),
  )
}
