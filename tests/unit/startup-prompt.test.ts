import { test, expect } from 'bun:test'
import { mkdtemp, readFile, writeFile, stat, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { consumeInitialPrompt } from '../../plugin/branding/startup.ts'

function client(fail = false) {
  const calls: unknown[] = []
  return { calls, context: {
    location: { directory: '/private/runtime/work' },
    client: { session: {
      create: async (input: unknown) => { calls.push(input); return { id: 'ses_test' } },
      prompt: async (input: unknown) => { calls.push(input); if (fail) throw new Error('secret prompt must not leak') },
    } },
    ui: { router: { navigate: (input: unknown) => calls.push(input) } },
  } }
}

async function fixture(run: (file: string) => Promise<void>) {
  const dir = await mkdtemp(join(tmpdir(), 'rts-startup-test-'))
  try { await run(join(dir, 'initial-prompt.json')) } finally { await rm(dir, { recursive: true, force: true }) }
}
const payload = { text: '  Investigate "quotes"\r\nand Unicode λ\n', providerID: 'nearai-red-embedded', modelID: 'test-model' }

test('no initial prompt is sent until the launcher releases the payload', async () => fixture(async file => {
  const c = client()
  expect(await consumeInitialPrompt(c.context, file)).toBe(false)
  expect(c.calls).toEqual([])
  await writeFile(file, JSON.stringify(payload), { mode: 0o600 })
  expect(await consumeInitialPrompt(c.context, file)).toBe(true)
  expect(c.calls).toEqual([
    { location: c.context.location, agent: 'build', model: { providerID: payload.providerID, id: payload.modelID } },
    { sessionID: 'ses_test', text: payload.text },
    { type: 'session', sessionID: 'ses_test' },
  ])
  expect(JSON.parse(await readFile(file + '.ack', 'utf8'))).toEqual({ status: 'submitted', sessionID: 'ses_test' })
  expect((await stat(file + '.ack')).mode & 0o777).toBe(0o600)
  expect(await readFile(file).catch(() => null)).toBeNull()
}))

test('concurrent plugin loads and later reload submit at most once', async () => fixture(async file => {
  const c = client()
  await writeFile(file, JSON.stringify(payload))
  await Promise.all([consumeInitialPrompt(c.context, file), consumeInitialPrompt(c.context, file)])
  await writeFile(file, JSON.stringify(payload))
  await consumeInitialPrompt(c.context, file)
  expect(c.calls.length).toBe(3)
}))

test('submission failure is acknowledged without leaking or retrying prompt contents', async () => fixture(async file => {
  const c = client(true)
  await writeFile(file, JSON.stringify(payload))
  await consumeInitialPrompt(c.context, file)
  expect(await readFile(file + '.ack', 'utf8')).not.toContain('secret')
  expect(JSON.parse(await readFile(file + '.ack', 'utf8')).status).toBe('error')
  await writeFile(file, JSON.stringify(payload))
  await consumeInitialPrompt(c.context, file)
  expect(c.calls.length).toBe(2)
}))

test('malformed payload never creates a conversation', async () => fixture(async file => {
  const c = client()
  await writeFile(file, JSON.stringify({ text: 42 }))
  await consumeInitialPrompt(c.context, file)
  expect(c.calls).toEqual([])
  expect(JSON.parse(await readFile(file + '.ack', 'utf8')).status).toBe('error')
}))
