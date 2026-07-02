import { HelpCircle, Clock, Check, X, FileText, DollarSign, Ban, type LucideIcon } from 'lucide-react'

/** Badge icon + color per gig status. Shared across the gigs views. */
export const statusConfig: Record<string, { icon: LucideIcon; color: string }> = {
  tentative: { icon: HelpCircle, color: 'bg-orange-100 dark:bg-orange-900/30 text-orange-800 dark:text-orange-300' },
  pending: { icon: Clock, color: 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-300' },
  accepted: { icon: Check, color: 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300' },
  declined: { icon: X, color: 'bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-300' },
  completed: { icon: Check, color: 'bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-300' },
  invoiced: { icon: FileText, color: 'bg-purple-100 dark:bg-purple-900/30 text-purple-800 dark:text-purple-300' },
  paid: { icon: DollarSign, color: 'bg-green-200 dark:bg-green-900/30 text-green-900 dark:text-green-300' },
  cancelled: { icon: Ban, color: 'bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300' },
}
