import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DEMO_BASE_URL, NODE_IDS, childrenOf, nodeById, type HttpNodeSpec, type LoopNodeSpec } from './board'
import { DemoRunner } from './runner.svelte'

const loop = nodeById(NODE_IDS.inviteTeam) as LoopNodeSpec
const member = nodeById(NODE_IDS.inviteMember) as HttpNodeSpec
const getProject = nodeById(NODE_IDS.getProject) as HttpNodeSpec
const TOP_LEVEL_REQUESTS = 4
const REQUESTS = TOP_LEVEL_REQUESTS + loop.count * childrenOf(loop.id).length
// With latency pinned to its minimum: past the start delay, the first
// request and the gap after it, into the org's request.
const MID_RUN_MS = 1000

async function finishedRun(): Promise<DemoRunner> {
  const runner = new DemoRunner()
  const done = runner.run()
  await vi.runAllTimersAsync()
  await done
  return runner
}

describe('DemoRunner', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.spyOn(Math, 'random').mockReturnValue(0)
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('runs every node once, the loop child once per iteration', async () => {
    const runner = await finishedRun()

    expect(Object.values(runner.status).every((s) => s === 'success')).toBe(true)
    expect(Object.values(runner.edges).every((s) => s === 'done')).toBe(true)
    expect(runner.logs).toHaveLength(REQUESTS)
    expect(runner.starts[member.id]).toBe(loop.count)
    expect(runner.loopDone).toBe(loop.count)
    expect(runner.runs).toBe(1)
  })

  it('logs newest first, with loop iterations numbered from zero', async () => {
    const runner = await finishedRun()

    expect(runner.logs[0]?.node).toBe(getProject.name)
    const iterations = runner.logs.filter((row) => row.node === member.name).map((row) => row.iteration)
    expect(iterations).toEqual([2, 1, 0])
    expect(runner.logs.filter((row) => row.node !== member.name).every((row) => row.iteration === null)).toBe(true)
  })

  it('fills path parameters from upstream ids', async () => {
    const runner = await finishedRun()

    const org = runner.outputs[NODE_IDS.createOrg]
    const project = runner.outputs[NODE_IDS.createProject]
    expect(org).toMatch(/^org_[0-9A-Z]{6}$/)
    expect(runner.logs.some((row) => row.url === `${DEMO_BASE_URL}/v1/orgs/${org}/members`)).toBe(true)
    expect(runner.outputs[NODE_IDS.getProject]).toBe(project)
    expect(runner.url(getProject)).toBe(`${DEMO_BASE_URL}/v1/projects/${project}`)
  })

  it('shows the path template until the upstream id exists', () => {
    expect(new DemoRunner().url(member)).toBe(`${DEMO_BASE_URL}${member.path}`)
  })

  it('animates the edges into a node only while it runs', async () => {
    const runner = new DemoRunner()
    const done = runner.run()
    await vi.advanceTimersByTimeAsync(MID_RUN_MS)

    expect(runner.status[NODE_IDS.createOrg]).toBe('running')
    expect(runner.edges['user-org']).toBe('flowing')
    expect(runner.edges['org-team']).toBe('idle')
    runner.stop()
    await done
  })

  it('keeps finished work and idles what was in flight when stopped', async () => {
    const runner = new DemoRunner()
    const done = runner.run()
    await vi.advanceTimersByTimeAsync(MID_RUN_MS)
    runner.stop()
    await done

    expect(runner.running).toBe(false)
    expect(runner.status[NODE_IDS.createUser]).toBe('success')
    expect(Object.values(runner.status)).not.toContain('running')
    expect(Object.values(runner.edges)).not.toContain('flowing')
    expect(runner.runs).toBe(0)
  })
})
