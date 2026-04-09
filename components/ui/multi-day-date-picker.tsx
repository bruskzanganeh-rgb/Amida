'use client'

import { useState, useRef, useEffect } from 'react'
import { useTranslations, useLocale } from 'next-intl'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import { cn } from '@/lib/utils'
import {
  format,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  isSameMonth,
  isSameDay,
  addMonths,
  subMonths,
  startOfWeek,
  endOfWeek,
} from 'date-fns'
import { sv } from 'date-fns/locale'
import { enUS } from 'date-fns/locale/en-US'
import { ChevronLeft, ChevronRight, Clock, Upload, Loader2, Check } from 'lucide-react'

type Session = { start: string; end: string | null; label?: string }

type MultiDayDatePickerProps = {
  selectedDates: Date[]
  onDatesChange: (dates: Date[]) => void
  disabled?: boolean
  scheduleTexts?: Record<string, string>
  onScheduleTextsChange?: (texts: Record<string, string>) => void
  onScanSchedule?: () => void
  parsedSessions?: Record<string, Session[]>
  parsingSessions?: Record<string, boolean>
  onParseScheduleText?: (date: string, text: string) => void
  dateVenues?: Record<string, string>
  onDateVenuesChange?: (venues: Record<string, string>) => void
}

export function MultiDayDatePicker({
  selectedDates,
  onDatesChange,
  disabled = false,
  scheduleTexts,
  onScheduleTextsChange,
  onScanSchedule,
  parsedSessions,
  parsingSessions,
  onParseScheduleText,
  dateVenues,
  onDateVenuesChange,
}: MultiDayDatePickerProps) {
  const t = useTranslations('datePicker')
  const appLocale = useLocale()
  const dateLocale = appLocale === 'sv' ? sv : enUS

  const [currentMonth, setCurrentMonth] = useState(new Date())
  const initialized = useRef(false)
  const [showTimes, setShowTimes] = useState(false)
  const [allSameText, setAllSameText] = useState(true)
  const [sharedText, setSharedText] = useState('')

  // Set current month from selectedDates prop (for editing existing gigs)
  useEffect(() => {
    if (selectedDates.length > 0 && !initialized.current) {
      initialized.current = true
      const sortedDates = [...selectedDates].sort((a, b) => a.getTime() - b.getTime())
      setCurrentMonth(sortedDates[0])
    }
  }, [selectedDates])

  useEffect(() => {
    if (selectedDates.length === 0) {
      initialized.current = false
    }
  }, [selectedDates])

  // Auto-open times section if scheduleTexts has values (edit mode or after import)
  const prevScheduleTextsCount = useRef(0)
  useEffect(() => {
    if (scheduleTexts) {
      const texts = Object.values(scheduleTexts).filter((t) => t.trim())
      const hasTexts = texts.length > 0
      if (hasTexts && (!showTimes || texts.length !== prevScheduleTextsCount.current)) {
        prevScheduleTextsCount.current = texts.length
        setShowTimes(true)
        // Check if all texts are the same
        const allSame = texts.every((t) => t === texts[0])
        // If per-date venues exist, force per-day mode (so venue inputs are visible)
        const hasPerDateVenues = dateVenues && Object.keys(dateVenues).length > 0
        setAllSameText(allSame && !hasPerDateVenues)
        if (allSame) {
          setSharedText(texts[0])
        }
      }
    }
  }, [scheduleTexts, showTimes, dateVenues])

  function toggleDate(date: Date) {
    if (disabled) return

    const isSelected = selectedDates.some((d) => isSameDay(d, date))
    const key = format(date, 'yyyy-MM-dd')

    if (isSelected) {
      const newDates = selectedDates.filter((d) => !isSameDay(d, date))
      onDatesChange(newDates)
      // Clean up schedule text for removed date
      if (onScheduleTextsChange && scheduleTexts && scheduleTexts[key]) {
        const newTexts = { ...scheduleTexts }
        delete newTexts[key]
        onScheduleTextsChange(newTexts)
      }
    } else {
      const newDates = [...selectedDates, date].sort((a, b) => a.getTime() - b.getTime())
      onDatesChange(newDates)
      // If "all same" is on, populate new date with shared text
      if (onScheduleTextsChange && allSameText && sharedText && showTimes) {
        onScheduleTextsChange({ ...(scheduleTexts || {}), [key]: sharedText })
      }
    }
  }

  function handleSharedTextChange(text: string) {
    setSharedText(text)
    if (onScheduleTextsChange) {
      const newTexts: Record<string, string> = {}
      const sortedDates = [...selectedDates].sort((a, b) => a.getTime() - b.getTime())
      for (const date of sortedDates) {
        newTexts[format(date, 'yyyy-MM-dd')] = text
      }
      onScheduleTextsChange(newTexts)
    }
  }

  function handlePerDayTextChange(key: string, text: string) {
    if (onScheduleTextsChange) {
      onScheduleTextsChange({ ...(scheduleTexts || {}), [key]: text })
    }
  }

  function handleAllSameToggle(checked: boolean) {
    setAllSameText(checked)
    if (checked && onScheduleTextsChange) {
      // Copy first day's text to shared text
      const sortedDates = [...selectedDates].sort((a, b) => a.getTime() - b.getTime())
      const firstKey = sortedDates.length > 0 ? format(sortedDates[0], 'yyyy-MM-dd') : ''
      const firstText = scheduleTexts?.[firstKey] || ''
      setSharedText(firstText)
      // Apply to all dates
      const newTexts: Record<string, string> = {}
      for (const date of sortedDates) {
        newTexts[format(date, 'yyyy-MM-dd')] = firstText
      }
      onScheduleTextsChange(newTexts)
    } else if (!checked && onScheduleTextsChange) {
      // Copy shared text to all dates
      const sortedDates = [...selectedDates].sort((a, b) => a.getTime() - b.getTime())
      const newTexts: Record<string, string> = {}
      for (const date of sortedDates) {
        newTexts[format(date, 'yyyy-MM-dd')] = sharedText
      }
      onScheduleTextsChange(newTexts)
    }
  }

  // Get calendar days for current month view
  const monthStart = startOfMonth(currentMonth)
  const monthEnd = endOfMonth(currentMonth)
  const calendarStart = startOfWeek(monthStart, { weekStartsOn: 1 })
  const calendarEnd = endOfWeek(monthEnd, { weekStartsOn: 1 })
  const calendarDays = eachDayOfInterval({ start: calendarStart, end: calendarEnd })

  const weekDays = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(2024, 0, i + 1) // Mon Jan 1 2024
    return format(d, 'EEE', { locale: dateLocale })
  })

  const sortedDates = [...selectedDates].sort((a, b) => a.getTime() - b.getTime())

  return (
    <div className="space-y-4">
      {/* Import schedule - prominent button at the top */}
      {onScanSchedule && !showTimes && (
        <button
          type="button"
          className="w-full text-sm font-medium text-primary bg-primary/5 hover:bg-primary/10 border border-primary/20 rounded-lg flex items-center justify-center gap-2 py-2.5 transition-colors"
          onClick={onScanSchedule}
          disabled={disabled}
        >
          <Upload className="h-4 w-4" />
          {t('importSchedule')}
          <span className="text-xs text-muted-foreground">(PDF / {t('image')})</span>
        </button>
      )}

      {/* Calendar */}
      <div className="p-4">
        {/* Month navigation */}
        <div className="flex items-center justify-between mb-4">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}
            disabled={disabled}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="font-medium">{format(currentMonth, 'MMMM yyyy', { locale: dateLocale })}</span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}
            disabled={disabled}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        {/* Week day headers */}
        <div className="grid grid-cols-7 gap-1.5 mb-2">
          {weekDays.map((day) => (
            <div key={day} className="text-center text-xs font-medium text-muted-foreground py-1">
              {day}
            </div>
          ))}
        </div>

        {/* Calendar grid */}
        <div className="grid grid-cols-7 gap-1.5">
          {calendarDays.map((day) => {
            const isCurrentMonth = isSameMonth(day, currentMonth)
            const isSelected = selectedDates.some((d) => isSameDay(d, day))

            return (
              <button
                key={day.toISOString()}
                type="button"
                onClick={() => isCurrentMonth && toggleDate(day)}
                disabled={disabled || !isCurrentMonth}
                className={cn(
                  'aspect-square p-1.5 text-sm rounded-md transition-colors',
                  !isCurrentMonth && 'text-muted-foreground/30',
                  isCurrentMonth && !isSelected && 'hover:bg-muted/50',
                  isSelected && 'bg-primary text-primary-foreground hover:bg-primary/90',
                  disabled && 'cursor-not-allowed opacity-50',
                )}
              >
                {format(day, 'd')}
              </button>
            )
          })}
        </div>

        {/* Help text */}
        <p className="text-xs text-muted-foreground mt-3 text-center">{t('clickToToggle')}</p>
      </div>

      {/* Summary */}
      <div className="flex items-center justify-between text-sm bg-muted/50 rounded-lg px-3 py-2">
        <span className="text-muted-foreground">{t('selectedDays')}</span>
        <div className="flex items-center gap-2">
          <span className="font-medium">
            {selectedDates.length === 0 && t('noDaysSelected')}
            {selectedDates.length === 1 && format(selectedDates[0], 'd MMMM yyyy', { locale: dateLocale })}
            {selectedDates.length > 1 && (
              <>
                {format(selectedDates[0], 'd', { locale: dateLocale })}-
                {format(selectedDates[selectedDates.length - 1], 'd MMMM yyyy', { locale: dateLocale })}
                {` (${selectedDates.length} ${t('daysCount')})`}
              </>
            )}
          </span>
          {selectedDates.length > 0 && onScheduleTextsChange && (
            <button
              type="button"
              className="text-xs text-primary hover:underline underline-offset-2 flex items-center gap-1"
              onClick={() => setShowTimes((v) => !v)}
            >
              <Clock className="h-3 w-3" />
              {showTimes ? t('hideTimes') : t('addTimes')}
            </button>
          )}
        </div>
      </div>

      {/* Schedule times section */}
      {showTimes && selectedDates.length > 0 && onScheduleTextsChange && (
        <div className="space-y-3 bg-muted/30 rounded-lg p-3">
          {/* Top row: toggle + import */}
          <div className="flex items-center justify-between">
            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={allSameText}
                onCheckedChange={(checked) => handleAllSameToggle(checked === true)}
                disabled={disabled}
              />
              <span className="text-muted-foreground">{t('allDaysSameSchedule')}</span>
            </label>
            {onScanSchedule && (
              <button
                type="button"
                className="text-xs text-primary hover:underline underline-offset-2 flex items-center gap-1"
                onClick={onScanSchedule}
                disabled={disabled}
              >
                <Upload className="h-3 w-3" />
                {t('importSchedule')}
              </button>
            )}
          </div>

          {allSameText ? (
            /* Single input for all days */
            <div className="space-y-1">
              <div className="relative">
                <Input
                  value={sharedText}
                  onChange={(e) => handleSharedTextChange(e.target.value)}
                  onBlur={() => {
                    if (onParseScheduleText && sortedDates.length > 0) {
                      const firstKey = format(sortedDates[0], 'yyyy-MM-dd')
                      onParseScheduleText(firstKey, sharedText)
                    }
                  }}
                  placeholder={t('schedulePlaceholder')}
                  className="text-sm h-9 pr-7"
                  disabled={disabled}
                />
                {sortedDates.length > 0 && parsingSessions?.[format(sortedDates[0], 'yyyy-MM-dd')] && (
                  <Loader2 className="absolute right-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 animate-spin text-muted-foreground" />
                )}
                {sortedDates.length > 0 &&
                  !parsingSessions?.[format(sortedDates[0], 'yyyy-MM-dd')] &&
                  (parsedSessions?.[format(sortedDates[0], 'yyyy-MM-dd')]?.length ?? 0) > 0 && (
                    <Check className="absolute right-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-green-500" />
                  )}
              </div>
              {(() => {
                const firstKey = sortedDates.length > 0 ? format(sortedDates[0], 'yyyy-MM-dd') : ''
                const sessions = firstKey ? parsedSessions?.[firstKey] : undefined
                return sessions && sessions.length > 0 ? (
                  <div className="flex flex-wrap gap-1">
                    {sessions.map((s, i) => (
                      <span
                        key={i}
                        className="text-[10px] bg-white border border-gray-200 rounded px-1.5 py-0.5 text-gray-600"
                      >
                        {s.label && <span className="font-medium">{s.label} </span>}
                        {s.start}
                        {s.end ? `–${s.end}` : ''}
                      </span>
                    ))}
                  </div>
                ) : null
              })()}
            </div>
          ) : (
            /* Per-day inputs */
            <div className="space-y-2 max-h-[200px] overflow-y-auto">
              {sortedDates.map((date) => {
                const key = format(date, 'yyyy-MM-dd')
                const sessions = parsedSessions?.[key]
                const isParsing = parsingSessions?.[key]
                return (
                  <div key={key} className="space-y-0.5">
                    <div className="flex items-center gap-2">
                      <span className="w-[75px] text-xs text-muted-foreground shrink-0">
                        {format(date, 'EEE d MMM', { locale: dateLocale })}
                      </span>
                      <div className="relative flex-1">
                        <Input
                          value={scheduleTexts?.[key] ?? ''}
                          onChange={(e) => handlePerDayTextChange(key, e.target.value)}
                          onBlur={() => onParseScheduleText?.(key, scheduleTexts?.[key] ?? '')}
                          placeholder={t('schedulePlaceholder')}
                          className="text-sm h-8 pr-7"
                          disabled={disabled}
                        />
                        {isParsing && (
                          <Loader2 className="absolute right-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 animate-spin text-muted-foreground" />
                        )}
                        {!isParsing && sessions && sessions.length > 0 && (
                          <Check className="absolute right-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-green-500" />
                        )}
                      </div>
                    </div>
                    {sessions && sessions.length > 0 && (
                      <div className="ml-[83px] flex flex-wrap gap-1">
                        {sessions.map((s, i) => (
                          <span
                            key={i}
                            className="text-[10px] bg-white border border-gray-200 rounded px-1.5 py-0.5 text-gray-600"
                          >
                            {s.label && <span className="font-medium">{s.label} </span>}
                            {s.start}
                            {s.end ? `–${s.end}` : ''}
                          </span>
                        ))}
                      </div>
                    )}
                    {onDateVenuesChange && (
                      <div className="ml-[83px]">
                        <Input
                          value={dateVenues?.[key] ?? ''}
                          onChange={(e) => {
                            const next = { ...(dateVenues || {}) }
                            if (e.target.value) {
                              next[key] = e.target.value
                            } else {
                              delete next[key]
                            }
                            onDateVenuesChange(next)
                          }}
                          placeholder={t('venuePlaceholder')}
                          className="text-[11px] h-7"
                          disabled={disabled}
                        />
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
