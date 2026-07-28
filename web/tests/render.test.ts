import { readdirSync } from 'node:fs'
import { basename, dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { beforeAll, describe, expect, it } from 'vitest'
import { init, type Warning } from '@fhtml/core'
import { renderFile } from '@fhtml/core/node'
import { PAGE, canonicalUrl, resolveHref, templateData } from '../src/data/template'
import { AE, DATA_ATTR, LOG_PART } from '../src/lib/constants'
import { DEMO_BINDINGS, DEMO_EDGES, DEMO_NODES, STATE_CHIPS } from '../src/data/demo'
import {
  DOCS_INTRO,
  DOCS_SECTIONS,
  DOWNLOAD_SECTION,
  DOWNLOADS,
  FEATURES,
  FOOTER_COLUMNS,
  HERO,
  NAV_LINKS,
  SITE,
  SITE_URL,
  STEPS,
  type DocsSection,
} from '../src/data/site'

const TEST_DIR = dirname(fileURLToPath(import.meta.url))
const PAGES_DIR = resolve(TEST_DIR, '../src/pages')
const PAGE_EXT = '.fhtml'

/** Matches the production build: GitHub Pages serves the site from `/cascade/`. */
const BASE = '/cascade/'
const RENDER_MODE = 'min'

const DOCTYPE = '<!DOCTYPE html>'
const LANG = 'en'

const FRAGMENT_PREFIX = '#'
const MAILTO_PREFIX = 'mailto:'
const EXTERNAL_HREF = /^https?:\/\//i
const BLANK_TARGET = '_blank'
const NOOPENER_REL = ['noopener', 'noreferrer']

/** Sprite symbols are addressed as `<use href="#icon-NAME">`. */
const ICON_ID_PREFIX = 'icon-'
const USE_TAG = 'use'

/**
 * Entry URLs Vite owns and rewrites with `base` during the build. They are
 * root-absolute in the compiled source, so they are exempt from the rule that
 * template-authored links must carry the base themselves.
 */
const VITE_OWNED_HREFS = ['/src/style.css', '/favicon.svg']

/** `{name}` still sitting in the output means a template expression never
 * resolved. Braces alone are not enough of a signal — see `BRACED_CONTENT`. */
const INTERPOLATION = /\{\s*[A-Za-z_$][\w$.]*\s*\}/g

/**
 * Content that legitimately renders braces: OpenAPI path templates such as
 * `/v1/orgs/{id}/members`. Removed before the scan so the leak check can be
 * exact rather than merely banning `{`.
 */
const BRACED_CONTENT = DEMO_NODES.map((n) => n.path).filter((p) => p.includes('{'))

const ATTR = {
  href: 'href',
  target: 'target',
  rel: 'rel',
  content: 'content',
  id: 'id',
} as const

const SELECTOR = {
  anchor: 'a[href]',
  anyHref: '[href]',
  title: 'title',
  description: 'meta[name="description"]',
  canonical: 'link[rel="canonical"]',
  symbol: 'symbol[id]',
  use: USE_TAG,
  template: 'template',
} as const

const aeSelector = (name: string) => `[data-ae="${name}"]`
const attrSelector = (attr: string) => `[${attr}]`

interface RenderedPage {
  html: string
  warnings: Warning[]
  doc: Document
}

function pageNames(): string[] {
  return readdirSync(PAGES_DIR)
    .filter((file) => file.endsWith(PAGE_EXT))
    .sort()
    .map((file) => basename(file, PAGE_EXT))
}

const PAGE_NAMES = pageNames()
const rendered = new Map<string, RenderedPage>()

function pageOf(name: string): RenderedPage {
  const page = rendered.get(name)
  if (page === undefined) throw new Error(`page "${name}" was not rendered`)
  return page
}

function requireEl<E extends Element>(root: ParentNode, selector: string): E {
  const el = root.querySelector<E>(selector)
  if (el === null) throw new Error(`no element matched "${selector}"`)
  return el
}

function attrOf(el: Element, attr: string): string {
  return el.getAttribute(attr) ?? ''
}

function hrefsOf(root: ParentNode, selector: string): string[] {
  return [...root.querySelectorAll(selector)].map((el) => attrOf(el, ATTR.href))
}

function isInternalLink(href: string): boolean {
  if (href === '') return false
  if (EXTERNAL_HREF.test(href)) return false
  if (href.startsWith(MAILTO_PREFIX)) return false
  if (href.startsWith(FRAGMENT_PREFIX)) return false
  return !VITE_OWNED_HREFS.includes(href)
}

/**
 * Copy that must reach the rendered page.
 *
 * A data name the template can no longer resolve renders as an empty string
 * and produces no compiler warning, so neither the warning guard nor the
 * interpolation guard sees a renamed or misspelt binding. Only asserting the
 * text itself catches it.
 */
function expectedCopy(page: string): string[] {
  const chrome = [
    SITE.name,
    ...NAV_LINKS.map((link) => link.label),
    ...FOOTER_COLUMNS.flatMap((col) => [col.heading, ...col.links.map((link) => link.label)]),
  ]

  if (page === PAGE.index) {
    return [
      ...chrome,
      HERO.eyebrow,
      HERO.headline,
      HERO.lede,
      DOWNLOAD_SECTION.title,
      DOWNLOAD_SECTION.lede,
      DOWNLOAD_SECTION.note,
      ...DOWNLOADS.flatMap((d) => [d.platform, d.detail]),
      ...FEATURES.flatMap((f) => [f.title, f.body]),
      ...STEPS.flatMap((s) => [s.title, s.body]),
      ...STATE_CHIPS.flatMap((c) => [c.label, c.description]),
      ...DEMO_NODES.flatMap((n) => [n.label, n.path]),
      ...Object.values(DEMO_BINDINGS),
    ]
  }

  if (page === PAGE.docs) {
    return [
      ...chrome,
      DOCS_INTRO,
      ...DOCS_SECTIONS.flatMap((s: DocsSection) => [
        s.heading,
        ...s.paragraphs,
        ...(s.bullets ?? []),
        ...(s.callout === undefined ? [] : [s.callout]),
        // The placeholder renders its own brief, so it must reach the page too.
        ...(s.media === undefined ? [] : [s.media.caption, s.media.brief]),
      ]),
    ]
  }

  return chrome
}

beforeAll(async () => {
  // Idempotent, but the wasm must be up before the first render.
  await init()

  for (const page of PAGE_NAMES) {
    const { html, warnings } = renderFile(join(PAGES_DIR, `${page}${PAGE_EXT}`), {
      data: templateData({ base: BASE, dev: false, page }),
      mode: RENDER_MODE,
    })
    rendered.set(page, {
      html,
      warnings,
      doc: new DOMParser().parseFromString(html, 'text/html'),
    })
  }
})

describe('page discovery', () => {
  it('finds the authored pages', () => {
    expect(PAGE_NAMES).toContain(PAGE.index)
    expect(PAGE_NAMES).toContain(PAGE.docs)
    expect(PAGE_NAMES).toContain(PAGE.notFound)
  })
})

describe.each(PAGE_NAMES)('%s.fhtml', (name) => {
  it('compiles without warnings', () => {
    expect(pageOf(name).warnings.map((w) => w.msg)).toEqual([])
  })

  it('emits a well-formed document head', () => {
    const { html, doc } = pageOf(name)

    expect(html.startsWith(DOCTYPE)).toBe(true)
    expect(doc.documentElement.getAttribute('lang')).toBe(LANG)

    const title = requireEl(doc, SELECTOR.title).textContent ?? ''
    expect(title).toContain(SITE.name)

    const description = attrOf(requireEl(doc, SELECTOR.description), ATTR.content)
    expect(description.length).toBeGreaterThan(0)

    expect(attrOf(requireEl(doc, SELECTOR.canonical), ATTR.href)).toBe(canonicalUrl(name))
  })

  it('prefixes every site-internal href with the base', () => {
    const { doc } = pageOf(name)
    const internal = [...doc.querySelectorAll(SELECTOR.anyHref)]
      .filter((el) => el.tagName.toLowerCase() !== USE_TAG)
      .map((el) => attrOf(el, ATTR.href))
      .filter(isInternalLink)

    expect(internal.length).toBeGreaterThan(0)
    expect(internal.filter((href) => !href.startsWith(BASE))).toEqual([])
  })

  it('leaves external links untouched and safely targeted', () => {
    const { doc } = pageOf(name)
    const external = [...doc.querySelectorAll(SELECTOR.anchor)].filter((a) =>
      EXTERNAL_HREF.test(attrOf(a, ATTR.href)),
    )

    expect(external.length).toBeGreaterThan(0)
    for (const anchor of external) {
      const href = attrOf(anchor, ATTR.href)
      expect(href.startsWith(BASE)).toBe(false)
      expect(attrOf(anchor, ATTR.target)).toBe(BLANK_TARGET)
      const rel = attrOf(anchor, ATTR.rel).split(/\s+/)
      for (const token of NOOPENER_REL) expect(rel).toContain(token)
    }
  })

  it('resolves every interpolation', () => {
    let scanned = pageOf(name).html
    for (const literal of BRACED_CONTENT) scanned = scanned.split(literal).join('')

    expect(scanned.match(INTERPOLATION) ?? []).toEqual([])
  })

  it('references only icons the sprite defines', () => {
    const { doc } = pageOf(name)
    const defined = new Set(
      [...doc.querySelectorAll(SELECTOR.symbol)].map((el) => attrOf(el, ATTR.id)),
    )
    const referenced = hrefsOf(doc, SELECTOR.use)
      .filter((href) => href.startsWith(FRAGMENT_PREFIX))
      .map((href) => href.slice(FRAGMENT_PREFIX.length))

    expect(referenced.length).toBeGreaterThan(0)
    for (const id of referenced) {
      expect(id.startsWith(ICON_ID_PREFIX)).toBe(true)
      expect(defined).toContain(id)
    }
  })

  it('renders the copy its data root declares', () => {
    // Read through the DOM so entity escaping is decoded for us.
    const text = pageOf(name).doc.body.textContent ?? ''
    expect(expectedCopy(name).filter((copy) => !text.includes(copy))).toEqual([])
  })

  it('carries the navigation bindings the behaviour layer attaches', () => {
    const { doc } = pageOf(name)
    for (const aeName of [AE.navToggle, AE.navPanel]) {
      expect(doc.querySelector(aeSelector(aeName))).not.toBeNull()
    }
  })
})

describe('index page bindings', () => {
  const indexDoc = () => pageOf(PAGE.index).doc

  it('exposes every ae name the behaviour layer binds', () => {
    const doc = indexDoc()
    for (const aeName of Object.values(AE)) {
      expect(doc.querySelector(aeSelector(aeName))).not.toBeNull()
    }
  })

  it('stamps log rows from a single-root template inside the log container', () => {
    const log = requireEl(indexDoc(), aeSelector(AE.demoLog))
    const templates = log.querySelectorAll(SELECTOR.template)

    expect(templates.length).toBe(1)

    const template = requireEl<HTMLTemplateElement>(log, SELECTOR.template)
    // `ae(...).list()` stamps the template's single root per item.
    expect(template.content.children.length).toBe(1)

    for (const part of Object.values(LOG_PART)) {
      expect(template.content.querySelector(aeSelector(part))).not.toBeNull()
    }
  })

  it('renders one canvas node per demo node', () => {
    const doc = indexDoc()
    const nodes = [...doc.querySelectorAll(aeSelector(AE.demoNode))]
    const ids = nodes.map((el) => attrOf(el, DATA_ATTR.nodeId))

    expect(nodes.length).toBe(DEMO_NODES.length)
    expect(ids.sort()).toEqual(DEMO_NODES.map((n) => n.id).sort())

    for (const node of DEMO_NODES) {
      const el = requireEl(doc, `${aeSelector(AE.demoNode)}[${DATA_ATTR.nodeId}="${node.id}"]`)
      expect(el.textContent).toContain(node.path)
    }
  })

  it('renders one edge per demo edge, each pointing at a rendered node', () => {
    const doc = indexDoc()
    const edges = [...doc.querySelectorAll(aeSelector(AE.demoEdge))]
    const ids = edges.map((el) => attrOf(el, DATA_ATTR.edgeId))

    expect(edges.length).toBe(DEMO_EDGES.length)
    expect(ids.sort()).toEqual(DEMO_EDGES.map((e) => e.id).sort())

    const nodeIds = new Set(
      [...doc.querySelectorAll(attrSelector(DATA_ATTR.nodeId))].map((el) =>
        attrOf(el, DATA_ATTR.nodeId),
      ),
    )
    const byId = new Map(DEMO_EDGES.map((e) => [e.id, e]))
    for (const id of ids) {
      const edge = byId.get(id)
      expect(edge).toBeDefined()
      expect(nodeIds).toContain(edge?.to)
      expect(nodeIds).toContain(edge?.from)
    }
  })
})

describe('resolveHref', () => {
  it('leaves absolute and mailto links untouched', () => {
    expect(resolveHref('https://github.com/nft/cascade', BASE)).toBe(
      'https://github.com/nft/cascade',
    )
    expect(resolveHref('http://example.com/a', BASE)).toBe('http://example.com/a')
    expect(resolveHref('mailto:hi@example.com', BASE)).toBe('mailto:hi@example.com')
  })

  it('prefixes internal paths without doubling the slash', () => {
    expect(resolveHref('docs.html', BASE)).toBe(`${BASE}docs.html`)
    expect(resolveHref('/docs.html', BASE)).toBe(`${BASE}docs.html`)
    expect(resolveHref('/docs.html', BASE)).not.toContain('//')
    expect(resolveHref('#how', BASE)).toBe(`${BASE}#how`)
  })

  it('is a no-op prefix at the site root', () => {
    expect(resolveHref('/docs.html', '/')).toBe('/docs.html')
    expect(resolveHref('docs.html', '/')).toBe('/docs.html')
  })
})

describe('canonicalUrl', () => {
  it('maps the index to the bare site url', () => {
    expect(canonicalUrl(PAGE.index)).toBe(SITE_URL)
  })

  it('maps every other page to its html file', () => {
    expect(canonicalUrl(PAGE.docs)).toBe(`${SITE_URL}docs.html`)
    expect(canonicalUrl(PAGE.notFound)).toBe(`${SITE_URL}404.html`)
    expect(canonicalUrl(PAGE.docs)).not.toContain('//docs')
  })
})
