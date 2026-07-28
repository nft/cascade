import type { PageContext } from '../../plugins/fhtml'
import {
  AE,
  LOG_PART,
  METHOD_CLASS,
  METHOD_CLASS_FALLBACK,
  NODE_STATE_CLASS,
} from '../lib/constants'
import { NODE_SIZE } from '../lib/graph'
import {
  DEMO_BINDINGS,
  DEMO_CANVAS,
  DEMO_EDGES,
  DEMO_NODES,
  STATE_CHIPS,
} from './demo'
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
  type NavLink,
} from './site'

/** Page stems, also used to mark the active nav entry. */
export const PAGE = {
  index: 'index',
  docs: 'docs',
  notFound: '404',
} as const

/**
 * Prefixes site-internal links with Vite's `base`. Vite rewrites the asset
 * URLs it owns, but links written in template content are ours to resolve —
 * and GitHub Pages serves this project from a `/cascade/` sub-path.
 */
export function resolveHref(href: string, base: string): string {
  if (/^[a-z]+:\/\//i.test(href) || href.startsWith('mailto:')) return href
  return `${base}${href.replace(/^\//, '')}`
}

function resolveLinks(links: NavLink[], base: string) {
  return links.map((link) => ({
    ...link,
    href: resolveHref(link.href, base),
    external: link.external === true,
  }))
}

/** Labels the media placeholder by kind — the template cannot build one. */
const MEDIA_LABEL: Record<string, string> = { image: 'Screenshot', video: 'Screen recording' }

/** Adds the placeholder's label; the rest of the section passes through. */
function docsSection(section: DocsSection) {
  if (section.media === undefined) return section
  return {
    ...section,
    media: { ...section.media, label: MEDIA_LABEL[section.media.kind] ?? section.media.kind },
  }
}

/** Render-ready demo node: absolute placement plus its display strings. */
function demoNodes() {
  return DEMO_NODES.map((node) => ({
    id: node.id,
    label: node.label,
    method: node.method,
    path: node.path,
    x: node.x,
    y: node.y,
    repeat: node.repeat,
    binding: DEMO_BINDINGS[node.id] ?? '',
    methodClass: METHOD_CLASS[node.method] ?? METHOD_CLASS_FALLBACK,
  }))
}

/**
 * The single template data root. Every `.fhtml` page reads from this — there
 * is no second source of content.
 */
/** Public URL of a page, for its canonical and `og:url` tags. */
export function canonicalUrl(page: string): string {
  return page === PAGE.index ? SITE_URL : `${SITE_URL}${page}.html`
}

export function templateData(ctx: PageContext) {
  const { base, page } = ctx

  return {
    base,
    canonical: canonicalUrl(page),
    year: String(new Date().getFullYear()),

    site: SITE,
    hero: {
      ...HERO,
      primaryCta: { ...HERO.primaryCta, href: resolveHref(HERO.primaryCta.href, base) },
      secondaryCta: { ...HERO.secondaryCta, href: resolveHref(HERO.secondaryCta.href, base) },
    },
    downloads: DOWNLOADS,
    download: DOWNLOAD_SECTION,
    nav: resolveLinks(NAV_LINKS, base),
    features: FEATURES,
    steps: STEPS.map((step, i) => ({ ...step, index: String(i + 1).padStart(2, '0') })),
    footer: FOOTER_COLUMNS.map((col) => ({ ...col, links: resolveLinks(col.links, base) })),

    docs: { intro: DOCS_INTRO, sections: DOCS_SECTIONS.map(docsSection) },

    demo: {
      canvas: DEMO_CANVAS,
      node: NODE_SIZE,
      nodes: demoNodes(),
      edges: DEMO_EDGES,
      chips: STATE_CHIPS,
    },

    // Names the behaviour layer binds to, so markup never hardcodes them.
    ae: AE,
    logPart: LOG_PART,
    stateClass: NODE_STATE_CLASS,
  }
}
