// The Settings dialog's sections, shared by its nav and by whoever opens it
// at a particular section.
export const SETTINGS_SECTIONS = [
  { id: 'general', label: 'General', icon: 'tune' },
  { id: 'appearance', label: 'Appearance', icon: 'palette' },
  { id: 'project', label: 'Project', icon: 'folder' },
  { id: 'shortcuts', label: 'Shortcuts', icon: 'keyboard' },
  { id: 'about', label: 'About', icon: 'info' },
] as const

export type SettingsSection = (typeof SETTINGS_SECTIONS)[number]['id']

export const DEFAULT_SETTINGS_SECTION: SettingsSection = 'general'
