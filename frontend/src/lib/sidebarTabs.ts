// The sidebar's sections, shared by the icon rail and the panel header.
export const SIDEBAR_TABS = [
  { id: 'operations', label: 'Operations', icon: 'api' },
  { id: 'environments', label: 'Environments', icon: 'dns' },
  { id: 'credentials', label: 'Credentials', icon: 'key' },
] as const

export type SidebarTab = (typeof SIDEBAR_TABS)[number]['id']

export function sidebarTabLabel(id: SidebarTab): string {
  return SIDEBAR_TABS.find((tab) => tab.id === id)?.label ?? id
}
