'use client'

import { useState } from 'react'
import useSWR from 'swr'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { Badge } from '@/components/ui/badge'
import { Key, Trash2, Copy, Check, Plus } from 'lucide-react'
import { toast } from 'sonner'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { useFormatLocale } from '@/lib/hooks/use-format-locale'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'

type ApiKey = {
  id: string
  name: string
  key_prefix: string
  scopes: string[]
  created_at: string
  last_used_at: string | null
  is_active: boolean
}

const AVAILABLE_SCOPES = [
  { value: 'read:gigs', label: 'Read Gigs' },
  { value: 'write:gigs', label: 'Write Gigs' },
  { value: 'read:clients', label: 'Read Clients' },
  { value: 'write:clients', label: 'Write Clients' },
  { value: 'read:invoices', label: 'Read Invoices' },
  { value: 'write:invoices', label: 'Write Invoices' },
  { value: 'read:expenses', label: 'Read Expenses' },
  { value: 'write:expenses', label: 'Write Expenses' },
]

export function ApiKeysSettings() {
  const formatLocale = useFormatLocale()
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [newKeyName, setNewKeyName] = useState('')
  const [selectedScopes, setSelectedScopes] = useState<string[]>([])
  const [generatedKey, setGeneratedKey] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const [keyToDelete, setKeyToDelete] = useState<string | null>(null)

  const supabase = createClient()

  const { data: keys = [], mutate } = useSWR<ApiKey[]>(
    'api-keys',
    async () => {
      const { data, error } = await supabase.from('api_keys').select('*').order('created_at', { ascending: false })
      if (error) throw error
      return (data || []) as ApiKey[]
    },
    { revalidateOnFocus: true },
  )

  async function createKey() {
    if (!newKeyName.trim()) {
      toast.error('Enter a key name')
      return
    }
    if (selectedScopes.length === 0) {
      toast.error('Select at least one permission')
      return
    }

    setCreating(true)
    try {
      // Generate random key
      const keyBytes = new Uint8Array(32)
      crypto.getRandomValues(keyBytes)
      const apiKey =
        'ak_' +
        Array.from(keyBytes)
          .map((b) => b.toString(16).padStart(2, '0'))
          .join('')

      const keyPrefix = apiKey.substring(0, 11) + '...'

      // Hash with SHA-256
      const encoder = new TextEncoder()
      const hashBuffer = await crypto.subtle.digest('SHA-256', encoder.encode(apiKey))
      const keyHash = Array.from(new Uint8Array(hashBuffer))
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('')

      const { error } = await supabase.from('api_keys').insert({
        name: newKeyName.trim(),
        key_hash: keyHash,
        key_prefix: keyPrefix,
        scopes: selectedScopes,
      })

      if (error) throw error

      setGeneratedKey(apiKey)
      setNewKeyName('')
      setSelectedScopes([])
      setShowCreateDialog(false)
      mutate()
    } catch (error) {
      console.error('Failed to create API key:', error)
      toast.error('Failed to create API key')
    } finally {
      setCreating(false)
    }
  }

  async function deleteKey(id: string) {
    const { error } = await supabase.from('api_keys').delete().eq('id', id)

    if (error) {
      toast.error('Failed to delete API key')
    } else {
      mutate()
    }
  }

  async function copyToClipboard(text: string, id: string) {
    try {
      await navigator.clipboard.writeText(text)
      setCopiedId(id)
      setTimeout(() => setCopiedId(null), 2000)
    } catch {
      toast.error('Failed to copy')
    }
  }

  function toggleScope(scope: string) {
    setSelectedScopes((prev) => (prev.includes(scope) ? prev.filter((s) => s !== scope) : [...prev, scope]))
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Key className="h-5 w-5" />
                API Keys
              </CardTitle>
              <CardDescription>
                Generate API keys for AI assistants or external tools to access your data.
              </CardDescription>
            </div>
            <Button onClick={() => setShowCreateDialog(true)}>
              <Plus className="mr-2 h-4 w-4" />
              New Key
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {keys.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Key className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No API keys yet.</p>
              <p className="text-sm">Create one to let your AI assistant access your data.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {keys.map((key) => (
                <div key={key.id} className="flex items-start justify-between border rounded-lg p-4 gap-4">
                  <div className="min-w-0 flex-1 space-y-2">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{key.name}</span>
                      <code className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                        {key.key_prefix}
                      </code>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {key.scopes.map((scope) => (
                        <Badge key={scope} variant="secondary" className="text-[10px]">
                          {scope}
                        </Badge>
                      ))}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Created {new Date(key.created_at).toLocaleDateString(formatLocale)}
                      {key.last_used_at && (
                        <> · Last used {new Date(key.last_used_at).toLocaleDateString(formatLocale)}</>
                      )}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="shrink-0"
                    onClick={() => {
                      setKeyToDelete(key.id)
                      setDeleteConfirmOpen(true)
                    }}
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              ))}
            </div>
          )}

          {/* API base URL info */}
          <div className="mt-6 p-4 rounded-lg bg-muted/50">
            <p className="text-sm font-medium mb-1">API Base URL</p>
            <code className="text-xs text-muted-foreground">
              {typeof window !== 'undefined' ? window.location.origin : ''}/api/v1/
            </code>
            <p className="text-xs text-muted-foreground mt-2">
              Documentation: <code>/api/v1/guide</code> · Auth: <code>Authorization: Bearer ak_...</code>
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Create Key Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create API Key</DialogTitle>
            <DialogDescription>Choose a name and permissions for this key.</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="key-name">Key Name</Label>
              <Input
                id="key-name"
                placeholder="My AI Assistant"
                value={newKeyName}
                onChange={(e) => setNewKeyName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && createKey()}
              />
            </div>

            <div className="space-y-2">
              <Label>Permissions</Label>
              <div className="grid grid-cols-2 gap-3">
                {AVAILABLE_SCOPES.map((scope) => (
                  <div key={scope.value} className="flex items-center space-x-2">
                    <Checkbox
                      id={scope.value}
                      checked={selectedScopes.includes(scope.value)}
                      onCheckedChange={() => toggleScope(scope.value)}
                    />
                    <label htmlFor={scope.value} className="text-sm leading-none cursor-pointer">
                      {scope.label}
                    </label>
                  </div>
                ))}
              </div>
              <div className="flex gap-2 pt-1">
                <Button
                  variant="outline"
                  size="sm"
                  className="text-xs h-7"
                  onClick={() => setSelectedScopes(AVAILABLE_SCOPES.map((s) => s.value))}
                >
                  Select All
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="text-xs h-7"
                  onClick={() =>
                    setSelectedScopes(AVAILABLE_SCOPES.filter((s) => s.value.startsWith('read:')).map((s) => s.value))
                  }
                >
                  Read Only
                </Button>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateDialog(false)}>
              Cancel
            </Button>
            <Button onClick={createKey} disabled={creating || !newKeyName.trim() || selectedScopes.length === 0}>
              {creating ? 'Creating...' : 'Create Key'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Show Generated Key Dialog */}
      <Dialog open={!!generatedKey} onOpenChange={() => setGeneratedKey(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>API Key Created</DialogTitle>
            <DialogDescription>Copy this key now — you won&apos;t be able to see it again!</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="bg-muted p-4 rounded-lg">
              <p className="text-xs text-muted-foreground mb-2">Your API Key:</p>
              <div className="flex items-center gap-2">
                <code className="text-sm font-mono break-all flex-1 select-all">{generatedKey}</code>
                <Button size="sm" variant="outline" onClick={() => copyToClipboard(generatedKey!, 'new')}>
                  {copiedId === 'new' ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                </Button>
              </div>
            </div>

            <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 p-3 rounded-lg">
              <p className="text-sm text-amber-800 dark:text-amber-200">
                <strong>Important:</strong> Store this key securely. It will not be shown again.
              </p>
            </div>

            <div className="bg-muted/50 p-3 rounded-lg">
              <p className="text-xs text-muted-foreground mb-1">Usage example:</p>
              <code className="text-xs break-all">
                curl -H &quot;Authorization: Bearer {generatedKey?.substring(0, 15)}...&quot;{' '}
                {typeof window !== 'undefined' ? window.location.origin : ''}/api/v1/summary
              </code>
            </div>
          </div>

          <DialogFooter>
            <Button onClick={() => setGeneratedKey(null)}>I&apos;ve Saved It</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={deleteConfirmOpen}
        onOpenChange={(open) => {
          setDeleteConfirmOpen(open)
          if (!open) setKeyToDelete(null)
        }}
        title="Delete API Key"
        description="This will permanently revoke this API key. Any systems using it will lose access."
        confirmLabel="Delete"
        variant="destructive"
        onConfirm={() => {
          if (keyToDelete) deleteKey(keyToDelete)
          setDeleteConfirmOpen(false)
          setKeyToDelete(null)
        }}
      />
    </div>
  )
}
