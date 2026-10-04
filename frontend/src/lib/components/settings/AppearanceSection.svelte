<script lang="ts">
  import {
    CANVAS_GRIDS,
    THEMES,
    UI_SCALES,
    settings,
    type CanvasGrid,
    type Theme,
    type UiScale,
  } from '../../settings.svelte'
  import { FIELD_LABEL } from '../ui/classes'
  import Select from '../ui/Select.svelte'
  import Toggle from '../ui/Toggle.svelte'
  import SettingRow from './SettingRow.svelte'

  const THEME_LABELS: Record<Theme, string> = { dark: 'Dark', light: 'Light', system: 'Match system' }
  const GRID_LABELS: Record<CanvasGrid, string> = { dots: 'Dots', lines: 'Lines', cross: 'Crosses', none: 'None' }
  const PERCENT = 100
  const scaleLabel = (scale: UiScale) => `${Math.round(scale * PERCENT)}%`
  const SHOW_MINIMAP_LABEL = 'Show the minimap'
</script>

<section class="space-y-4" aria-label="Appearance settings">
  <h3 class={FIELD_LABEL}>Appearance</h3>
  <SettingRow label="Theme" description="Match system follows the OS light or dark appearance.">
    <Select
      size="sm"
      aria-label="Theme"
      value={settings.theme}
      onchange={(e) => settings.update({ theme: e.currentTarget.value as Theme })}
    >
      {#each THEMES as theme (theme)}
        <option value={theme}>{THEME_LABELS[theme]}</option>
      {/each}
    </Select>
  </SettingRow>
  <SettingRow label="Interface scale" description="Sizes the panels, menus and dialogs. The canvas keeps its own zoom.">
    <Select
      size="sm"
      aria-label="Interface scale"
      value={String(settings.uiScale)}
      onchange={(e) => settings.update({ uiScale: Number(e.currentTarget.value) as UiScale })}
    >
      {#each UI_SCALES as scale (scale)}
        <option value={String(scale)}>{scaleLabel(scale)}</option>
      {/each}
    </Select>
  </SettingRow>
  <SettingRow label="Canvas grid" description="The pattern drawn behind the nodes.">
    <Select
      size="sm"
      aria-label="Canvas grid"
      value={settings.canvasGrid}
      onchange={(e) => settings.update({ canvasGrid: e.currentTarget.value as CanvasGrid })}
    >
      {#each CANVAS_GRIDS as grid (grid)}
        <option value={grid}>{GRID_LABELS[grid]}</option>
      {/each}
    </Select>
  </SettingRow>
  <SettingRow label={SHOW_MINIMAP_LABEL} description="The overview in the canvas's bottom-right corner.">
    <Toggle
      label={SHOW_MINIMAP_LABEL}
      checked={settings.showMinimap}
      onchange={(checked) => settings.update({ showMinimap: checked })}
    />
  </SettingRow>
</section>
