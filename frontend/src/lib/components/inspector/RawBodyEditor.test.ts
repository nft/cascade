import { EditorView } from 'codemirror'
import { flushSync, mount, unmount } from 'svelte'
import { afterEach, describe, expect, it } from 'vitest'
import type { HttpNode, RawBody } from '../../model'
import { nodeTarget } from '../../requestEditor'
import { app } from '../../state.svelte'
import RawBodyEditor from './RawBodyEditor.svelte'

const mkNode = (id: string, key: string, rawBody?: RawBody): HttpNode => ({
  id,
  type: 'http',
  position: { x: 0, y: 0 },
  data: {
    name: id,
    key,
    method: 'POST',
    path: `/v1/${id}`,
    environment: 'staging',
    credential: '',
    status: 'idle',
    fields: [],
    ...(rawBody ? { rawBody } : {}),
  },
})

let instance: ReturnType<typeof mount> | null = null

afterEach(() => {
  if (instance) unmount(instance)
  instance = null
})

/** Mounts the editor for `node` downstream of `create-user` and returns its CodeMirror view. */
function mountEditor(node: HttpNode): EditorView {
  document.body.innerHTML = ''
  app.nodes = [mkNode('create-user', 'createUser'), node]
  app.edges = [{ id: 'e1', source: 'create-user', target: node.id }]
  instance = mount(RawBodyEditor, {
    target: document.body,
    props: { target: nodeTarget(node), rawBody: node.data.rawBody! },
  })
  flushSync()
  const view = EditorView.findFromDOM(document.querySelector<HTMLElement>('.cm-editor')!)
  if (!view) throw new Error('no CodeMirror view mounted')
  return view
}

const storedText = (id: string) => (app.nodes.find((n) => n.id === id) as HttpNode).data.rawBody?.text

describe('RawBodyEditor references', () => {
  it('shows stored node ids as keys, and stores what is typed as ids', () => {
    const view = mountEditor(
      mkNode('create-org', 'createOrg', { contentType: 'application/json', text: '{"owner": "{{create-user.body.id}}"}' }),
    )
    expect(view.state.doc.toString()).toBe('{"owner": "{{createUser.body.id}}"}')

    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: '{"owner": "{{ createUser[0].id }}", "n": {{i}}}' },
    })
    expect(storedText('create-org')).toBe('{"owner": "{{ create-user[0].id }}", "n": {{i}}}')
  })

  it('flags a reference the run could not resolve', () => {
    mountEditor(mkNode('create-org', 'createOrg', { contentType: 'application/json', text: '{"x": "{{ghost.body}}"}' }))
    expect(document.body.textContent).toContain('unknown node reference "ghost"')
  })
})
