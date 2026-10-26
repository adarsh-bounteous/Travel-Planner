import assert from 'node:assert/strict'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'

const doc = readFileSync('docs/local-setup.md', 'utf8')
const seed = readFileSync('services/api/app/local_seed.py', 'utf8')

function pythonSources(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return name === '.venv' || name === '__pycache__' ? [] : pythonSources(path)
    return path.endsWith('.py') ? [readFileSync(path, 'utf8')] : []
  })
}

function section(heading) {
  return doc.split(new RegExp(`^## ${heading}`, 'm'))[1].split(/^## /m)[0]
}

test('setup steps name the real start command and ports', () => {
  assert.match(doc, /pnpm start/)
  assert.equal(JSON.parse(readFileSync('package.json', 'utf8')).scripts.start, 'node scripts/start.mjs')
  assert.match(doc, /5173/)
  assert.match(doc, /8000/)
})

test('demo sign-in shows the credentials that are really seeded', () => {
  const email = seed.match(/DEMO_EMAIL = "([^"]+)"/)[1]
  const password = seed.match(/DEMO_PASSWORD = "([^"]+)"/)[1]
  assert.ok(doc.includes(email))
  assert.ok(doc.includes(password))
})

test('exactly one reset step is documented', () => {
  const steps = section('Reset').match(/^\s*(\d+\.|\$|    \S)/gm) ?? []
  assert.equal(steps.length, 1)
})

test('every faked dependency is listed with how it is faked, naming real classes', () => {
  for (const name of ['Identity Provider', 'Trip Database', 'Email Delivery', 'Maps and Places', 'Flight and Hotel Search'])
    assert.match(doc, new RegExp(name))
  const source = pythonSources('services/api/app').join('\n')
  const rows = section('What is faked').split('\n').filter((l) => l.startsWith('|')).slice(2)
  assert.ok(rows.length >= 5)
  for (const row of rows) {
    const cells = row.split('|').slice(1, -1)
    assert.ok(cells[2].trim().length > 0, row)
    for (const [, cls] of cells[2].matchAll(/`(\w+)`/g)) assert.match(source, new RegExp(`class ${cls}\\b`), cls)
  }
})

test('the email delivery entry shows the full address of an inbox page that exists', () => {
  const email = section('Email delivery and the local inbox')
  const address = email.match(/http:\/\/localhost:5173\/\S+/)[0]
  const path = new URL(address).pathname
  assert.equal(path, '/local/inbox')
  assert.match(readFileSync('apps/web/src/App.tsx', 'utf8'), /path="\/local\/inbox"/)
  assert.match(readFileSync('apps/web/src/devProxy.ts', 'utf8'), /'\/local'/)
  assert.match(pythonSources('services/api/app').join('\n'), /prefix="\/local"[\s\S]*@router\.get\("\/inbox"\)/)
})
