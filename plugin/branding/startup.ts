// The launcher releases this private payload only after the server plugin's
// nonce handshake. Use the TUI's authenticated client, never simulated keys.
import { open, readFile, rename, unlink, writeFile } from 'node:fs/promises'

async function acknowledge(path: string, result: unknown) {
  const temporary = path + '.ack.tmp'
  await writeFile(temporary, JSON.stringify(result), { mode: 0o600, flag: 'wx' })
  await rename(temporary, path + '.ack')
}

export async function consumeInitialPrompt(context: any, path: string): Promise<boolean> {
  let raw: string
  try { raw = await readFile(path, 'utf8') }
  catch (error: any) {
    if (error.code === 'ENOENT') return false
    throw error
  }
  // The empty claim survives config reloads. An ambiguous network failure must
  // never cause an automatic second submission of the same task.
  try { await (await open(path + '.claimed', 'wx', 0o600)).close() }
  catch (error: any) {
    if (error.code === 'EEXIST') return true
    throw error
  }
  let result: unknown
  try {
    await unlink(path)
    const payload = JSON.parse(raw)
    if (typeof payload.text !== 'string' || !payload.text.trim() || payload.text.includes('\0') ||
        Buffer.byteLength(payload.text, 'utf8') > 65536 ||
        typeof payload.providerID !== 'string' || !payload.providerID ||
        typeof payload.modelID !== 'string' || !payload.modelID) throw new Error('Invalid initial prompt')
    const response = await context.client.session.create({
      location: context.location,
      agent: 'build',
      model: { providerID: payload.providerID, id: payload.modelID },
    })
    const sessionID = response.id
    if (typeof sessionID !== 'string' || !sessionID) throw new Error('Missing session ID')
    await context.client.session.prompt({ sessionID, text: payload.text })
    result = { status: 'submitted', sessionID }
    // Navigation is cosmetic; a UI error must not turn a successful submission
    // into an apparent failure that invites the operator to repeat it.
    try { context.ui.router.navigate({ type: 'session', sessionID }) } catch { /* submitted */ }
  } catch {
    result = { status: 'error', message: 'Initial prompt submission failed; it was not retried automatically' }
  }
  await acknowledge(path, result)
  return true
}

export function startInitialPrompt(context: any, path: string): () => Promise<void> {
  let stopped = false
  let timer: ReturnType<typeof setTimeout> | undefined
  let active: Promise<void> = Promise.resolve()
  const tick = async () => {
    if (stopped) return
    try {
      if (await consumeInitialPrompt(context, path)) return
    } catch {
      // Report failure without copying a prompt or SDK request into diagnostics.
      await acknowledge(path, { status: 'error', message: 'Initial prompt handoff failed' }).catch(() => {})
      return
    }
    if (!stopped) timer = setTimeout(() => { active = tick() }, 100)
  }
  active = tick()
  return async () => {
    stopped = true
    if (timer) clearTimeout(timer)
    await active
  }
}
