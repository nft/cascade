import { createContext } from 'svelte'
import type { DemoRunner } from './runner.svelte'

/** The run the demo's nodes, edges and logs render; one per demo window. */
export const [getDemoRunner, setDemoRunner] = createContext<DemoRunner>()
