import { LayoutDashboard, Calendar, CalendarDays, FileText, Receipt, FolderOpen, type LucideIcon } from 'lucide-react'

export type NavItem = {
  nameKey: string
  href: string
  icon: LucideIcon
}

export const navigationItems: NavItem[] = [
  { nameKey: 'dashboard', href: '/dashboard', icon: LayoutDashboard },
  { nameKey: 'gigs', href: '/gigs', icon: Calendar },
  { nameKey: 'calendar', href: '/calendar', icon: CalendarDays },
  { nameKey: 'finance', href: '/finance', icon: FileText },
  { nameKey: 'expenses', href: '/expenses', icon: Receipt },
  { nameKey: 'documents', href: '/documents', icon: FolderOpen },
]
