import { describe, expect, it } from 'vitest'
import {
  credentialFromDraft,
  credentialRefCount,
  draftFromCredential,
  groupCredentialsByKind,
  injectionPreview,
  isDanglingCredential,
  SECRET_MASK,
  validateCredentialDraft,
  type CredentialDraft,
} from './credentials'
import type { CredentialDef } from './model'

const draft = (patch: Partial<CredentialDraft>): CredentialDraft => ({
  name: 'internal',
  kind: 'bearer',
  header: '',
  param: '',
  template: '',
  username: '',
  ...patch,
})

const none = new Set<string>()

describe('injectionPreview', () => {
  it('previews each kind with the secret masked', () => {
    expect(injectionPreview({ kind: 'bearer' })).toBe(`Authorization: Bearer ${SECRET_MASK}`)
    expect(injectionPreview({ kind: 'basic', username: 'bob' })).toBe(
      `Authorization: Basic base64(bob:${SECRET_MASK})`,
    )
    expect(injectionPreview({ kind: 'header', header: 'X-Internal-Token', template: 'Token {secret}' })).toBe(
      `X-Internal-Token: Token ${SECRET_MASK}`,
    )
    expect(injectionPreview({ kind: 'query', param: 'api_key' })).toBe(`?api_key=${SECRET_MASK}`)
  })

  it('falls back to placeholders while the draft is incomplete', () => {
    expect(injectionPreview({ kind: 'header' })).toBe(`<header>: ${SECRET_MASK}`)
    expect(injectionPreview({ kind: 'query' })).toBe(`?<param>=${SECRET_MASK}`)
  })
})

describe('validateCredentialDraft', () => {
  it('accepts the plan 04 done-when credential', () => {
    const d = draft({ kind: 'header', header: 'X-Internal-Token', template: 'Token {secret}' })
    expect(validateCredentialDraft(d, none)).toBeNull()
  })

  it('rejects missing name, duplicate name, and kind-specific gaps', () => {
    expect(validateCredentialDraft(draft({ name: '  ' }), none)).toMatch(/name/)
    expect(validateCredentialDraft(draft({}), new Set(['internal']))).toMatch(/already exists/)
    expect(validateCredentialDraft(draft({ kind: 'header' }), none)).toMatch(/header name/)
    expect(validateCredentialDraft(draft({ kind: 'query' }), none)).toMatch(/parameter name/)
  })

  it('requires exactly one {secret} placeholder in a non-empty template', () => {
    const base = { kind: 'header' as const, header: 'X-Key' }
    expect(validateCredentialDraft(draft({ ...base, template: 'Token' }), none)).toMatch(/exactly once/)
    expect(validateCredentialDraft(draft({ ...base, template: '{secret}{secret}' }), none)).toMatch(/exactly once/)
    expect(validateCredentialDraft(draft({ ...base, template: 'Token {secret}' }), none)).toBeNull()
    expect(validateCredentialDraft(draft({ ...base, template: '' }), none)).toBeNull()
  })
})

describe('draft round trip', () => {
  it('omits blank optionals instead of persisting empty strings', () => {
    const def = credentialFromDraft(draft({ name: ' internal ' }), '2026-01-01T00:00:00Z')
    expect(def).toEqual({ name: 'internal', kind: 'bearer', createdAt: '2026-01-01T00:00:00Z' })
  })

  it('round-trips a fully populated credential', () => {
    const def: CredentialDef = {
      name: 'internal',
      kind: 'header',
      header: 'X-Internal-Token',
      template: 'Token {secret}',
      createdAt: '2026-01-01T00:00:00Z',
    }
    expect(credentialFromDraft(draftFromCredential(def), def.createdAt)).toEqual(def)
  })
})

describe('groupCredentialsByKind', () => {
  it('buckets in kind order and omits empty kinds', () => {
    const cred = (name: string, kind: CredentialDef['kind']): CredentialDef => ({
      name,
      kind,
      createdAt: '2026-01-01T00:00:00Z',
    })
    const groups = groupCredentialsByKind([
      cred('internal', 'header'),
      cred('admin', 'bearer'),
      cred('legacy', 'header'),
    ])
    expect(groups.map(([kind, creds]) => [kind, creds.map((c) => c.name)])).toEqual([
      ['bearer', ['admin']],
      ['header', ['internal', 'legacy']],
    ])
    expect(groupCredentialsByKind([])).toEqual([])
  })
})

describe('isDanglingCredential', () => {
  const creds: CredentialDef[] = [{ name: 'internal', kind: 'bearer', createdAt: '2026-01-01T00:00:00Z' }]

  it('flags only a non-empty reference to a missing name', () => {
    expect(isDanglingCredential(creds, 'ghost')).toBe(true)
    expect(isDanglingCredential(creds, 'internal')).toBe(false)
    expect(isDanglingCredential(creds, '')).toBe(false) // None is a valid choice, not a dangle
    expect(isDanglingCredential(creds, undefined)).toBe(false)
  })
})

describe('credentialRefCount', () => {
  it('counts nodes bound to the name, ignoring other credentials and non-http nodes', () => {
    const nodes = [
      { data: { credential: 'internal' } },
      { data: { credential: 'internal' } },
      { data: { credential: 'staging-admin' } },
      { data: { text: 'a note' } },
    ]
    expect(credentialRefCount(nodes, 'internal')).toBe(2)
    expect(credentialRefCount(nodes, 'ghost')).toBe(0)
  })
})
