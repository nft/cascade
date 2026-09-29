<script lang="ts" module>
  export type ButtonVariant = 'primary' | 'secondary' | 'ghost'
  export type ButtonSize = 'sm' | 'md' | 'lg'

  // Interactive elements are pills; containers use rounded-2xl.
  const BASE =
    'group/button inline-flex shrink-0 items-center justify-center rounded-full font-semibold whitespace-nowrap transition duration-200 ease-out active:scale-[0.98] motion-reduce:transition-none'

  const VARIANT: Record<ButtonVariant, string> = {
    primary: 'bg-coral-500 text-canvas shadow-button hover:bg-coral-400',
    secondary: 'border border-white/12 bg-white/3 text-fg hover:border-white/20 hover:bg-white/7',
    ghost: 'text-fg-muted hover:text-fg',
  }

  const SIZE: Record<ButtonSize, string> = {
    sm: 'h-9 gap-1.5 px-4 text-sm',
    md: 'h-11 gap-2 px-5 text-[0.95rem]',
    lg: 'h-13 gap-2.5 px-7 text-base',
  }

  export const ICON_SIZE: Record<ButtonSize, number> = { sm: 17, md: 19, lg: 21 }
</script>

<script lang="ts">
  import type { Snippet } from 'svelte'
  import type { HTMLAnchorAttributes } from 'svelte/elements'

  let {
    href,
    variant,
    size = 'md',
    external = false,
    class: cls = '',
    children,
    ...rest
  }: {
    href: string
    variant: ButtonVariant
    size?: ButtonSize
    /** Opens in a new tab; for links that leave the site. */
    external?: boolean
    class?: string
    children: Snippet
  } & Omit<HTMLAnchorAttributes, 'href' | 'class'> = $props()
</script>

<a
  {href}
  {...rest}
  target={external ? '_blank' : undefined}
  rel={external ? 'noopener' : undefined}
  class="{BASE} {VARIANT[variant]} {SIZE[size]} {cls}"
>
  {@render children()}
</a>
