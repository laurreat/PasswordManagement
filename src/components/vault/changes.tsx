"use client";

import React, { useState } from 'react';
import { useSync, type PeerLoadPreview, type PeerPendingChange } from '@/hooks/use-sync';
import { useVault } from '@/hooks/use-vault';
import { useUISettings } from '@/hooks/use-ui-settings';
import type { AccountChangeRecord, VaultDraft } from '@/lib/types';
import { isHistoryHidden, splitHistoryByAge } from '@/lib/change-history';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  FolderSync,
  Save,
  Download,
  Trash2,
  RefreshCw,
  Folder,
  Laptop,
  Clock,
  PlusCircle,
  Edit3,
  CheckCircle2,
  AlertCircle,
  History,
  Eye,
  EyeOff,
} from 'lucide-react';

export const ChangesView: React.FC = () => {
  const { t } = useUISettings();
  const { vault } = useVault();
  const {
    folder,
    chooseFolder,
    deviceName,
    setDeviceName,
    enableSync,
    isSyncEnabled,
    refresh,
    isRefreshing,
    drafts,
    discardDraft,
    commitSingleDraft,
    commitAllDrafts,
    peerChanges,
    previewPeerChanges,
    loadPeerChanges,
    history,
  } = useSync();

  const [editingDeviceName, setEditingDeviceName] = useState(deviceName);
  const [isSavingName, setIsSavingName] = useState(false);
  const [preview, setPreview] = useState<PeerLoadPreview | null>(null);
  const [previewingDevice, setPreviewingDevice] = useState<string | null>(null);
  const [showHidden, setShowHidden] = useState(false);
  const { visible: visibleHistory, hidden: hiddenHistory } = splitHistoryByAge(history);

  const handlePreviewLoad = async (change: PeerPendingChange) => {
    const deviceId = change.peerDevice.deviceId;
    setPreviewingDevice(deviceId);

    try {
      const result = await previewPeerChanges(deviceId);
      if (!result) return;

      if (!result.requiresConfirmation) {
        await loadPeerChanges(deviceId);
        return;
      }

      setPreview(result);
    } finally {
      setPreviewingDevice(null);
    }
  };

  const handleSaveDeviceName = async () => {
    if (!editingDeviceName.trim()) return;
    setIsSavingName(true);
    try {
      await setDeviceName(editingDeviceName.trim());
    } finally {
      setIsSavingName(false);
    }
  };

  const formatTime = (isoString: string) => {
    try {
      const date = new Date(isoString);
      return date.toLocaleString();
    } catch {
      return isoString;
    }
  };

  const renderDraftBadge = (type: VaultDraft['type']) => {
    switch (type) {
      case 'create':
        return (
          <Badge className="bg-emerald-500/15 text-emerald-600 border-emerald-500/30 dark:text-emerald-400">
            <PlusCircle className="w-3 h-3 mr-1" />
            {t('changes.type_create')}
          </Badge>
        );
      case 'update':
        return (
          <Badge className="bg-blue-500/15 text-blue-600 border-blue-500/30 dark:text-blue-400">
            <Edit3 className="w-3 h-3 mr-1" />
            {t('changes.type_update')}
          </Badge>
        );
      case 'delete':
        return (
          <Badge className="bg-destructive/15 text-destructive border-destructive/30">
            <Trash2 className="w-3 h-3 mr-1" />
            {t('changes.type_delete')}
          </Badge>
        );
    }
  };

  return (
    <div className="flex-1 overflow-y-auto p-8 space-y-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">{t('changes.title')}</h2>
          <p className="text-muted-foreground mt-1">{t('changes.desc')}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => refresh()}
            disabled={isRefreshing}
            className="flex items-center gap-2"
          >
            <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
            {t('sync.refresh')}
          </Button>
          {drafts.length > 0 && (
            <Button
              size="sm"
              onClick={() => commitAllDrafts()}
              className="flex items-center gap-2"
            >
              <Save className="w-4 h-4" />
              {t('changes.save_all')} ({drafts.length})
            </Button>
          )}
        </div>
      </div>

      {/* Sync Folder Configuration Card */}
      <Card className="border-border">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <FolderSync className="w-5 h-5 text-primary" />
              <CardTitle className="text-lg">{t('sync.title')}</CardTitle>
            </div>
            <Badge variant={isSyncEnabled ? 'default' : 'outline'}>
              {isSyncEnabled ? (
                <span className="flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3" />
                  {t('sync.status_active')}
                </span>
              ) : (
                <span className="flex items-center gap-1">
                  <AlertCircle className="w-3 h-3" />
                  {t('sync.status_offline')}
                </span>
              )}
            </Badge>
          </div>
          <CardDescription>{t('sync.desc')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">{t('sync.folder')}</label>
              <div className="flex gap-2">
                <Input
                  value={folder || t('sync.folder_none')}
                  readOnly
                  className="text-xs bg-muted/50 cursor-default truncate font-mono"
                />
                <Button variant="outline" size="sm" onClick={chooseFolder} className="shrink-0 flex items-center gap-1.5">
                  <Folder className="w-4 h-4" />
                  {t('sync.choose_folder')}
                </Button>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">{t('sync.device_name')}</label>
              <div className="flex gap-2">
                <Input
                  value={editingDeviceName}
                  onChange={(e) => setEditingDeviceName(e.target.value)}
                  placeholder={t('sync.device_name_placeholder')}
                  className="text-xs"
                />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleSaveDeviceName}
                  disabled={isSavingName || !editingDeviceName.trim() || editingDeviceName === deviceName}
                  className="shrink-0 flex items-center gap-1.5"
                >
                  <Laptop className="w-4 h-4" />
                  {t('sync.save_name')}
                </Button>
              </div>
            </div>
          </div>

          {!isSyncEnabled && folder && (
            <div className="pt-2">
              <Button size="sm" onClick={enableSync} className="flex items-center gap-2">
                <FolderSync className="w-4 h-4" />
                {t('sync.enable')}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Main Tabs: Local Drafts, Remote Peer Changes and History */}
      <Tabs defaultValue="local" className="w-full">
        <TabsList className="grid grid-cols-3 max-w-xl">
          <TabsTrigger value="local" className="flex items-center gap-2">
            {t('changes.tab_local')}
            {drafts.length > 0 && (
              <Badge variant="secondary" className="px-1.5 py-0 text-xs">
                {drafts.length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="remote" className="flex items-center gap-2">
            {t('changes.tab_remote')}
            {peerChanges.length > 0 && (
              <Badge variant="secondary" className="px-1.5 py-0 text-xs">
                {peerChanges.length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="history" className="flex items-center gap-2">
            <History className="w-3.5 h-3.5" />
            {t('changes.tab_history')}
            {visibleHistory.length > 0 && (
              <Badge variant="secondary" className="px-1.5 py-0 text-xs">
                {visibleHistory.length}
              </Badge>
            )}
          </TabsTrigger>
        </TabsList>

        {/* Tab Content: Local Drafts */}
        <TabsContent value="local" className="mt-4 space-y-3">
          {drafts.length === 0 ? (
            <Card className="border-dashed">
              <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                <CheckCircle2 className="w-10 h-10 text-muted-foreground mb-3 opacity-40" />
                <h4 className="font-semibold text-lg">{t('changes.empty_local')}</h4>
                <p className="text-sm text-muted-foreground mt-1 max-w-sm">
                  {t('changes.empty_local_desc')}
                </p>
              </CardContent>
            </Card>
          ) : (
            drafts.map((draft) => {
              const account = draft.after ?? draft.before;
              return (
                <Card key={draft.draftId} className="border-border hover:border-primary/40 transition-colors">
                  <CardContent className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        {renderDraftBadge(draft.type)}
                        <span className="font-semibold text-base">{account?.sitio || 'Desconocido'}</span>
                      </div>
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                        <span>
                          {t('changes.field_user')}: <strong className="text-foreground">{account?.usuario}</strong>
                        </span>
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {formatTime(draft.createdAt)}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => discardDraft(draft.draftId)}
                        className="text-destructive hover:text-destructive hover:bg-destructive/10"
                      >
                        <Trash2 className="w-4 h-4 mr-1" />
                        {t('changes.discard')}
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => commitSingleDraft(draft)}
                        className="flex items-center gap-1.5"
                      >
                        <Save className="w-4 h-4" />
                        {t('changes.save')}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })
          )}
        </TabsContent>

        {/* Tab Content: Remote Peer Changes */}
        <TabsContent value="remote" className="mt-4 space-y-3">
          {peerChanges.length === 0 ? (
            <Card className="border-dashed">
              <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                <CheckCircle2 className="w-10 h-10 text-muted-foreground mb-3 opacity-40" />
                <h4 className="font-semibold text-lg">{t('changes.empty_remote')}</h4>
                <p className="text-sm text-muted-foreground mt-1 max-w-sm">
                  {t('changes.empty_remote_desc')}
                </p>
              </CardContent>
            </Card>
          ) : (
            peerChanges.map((change) => {
              const account = change.entry.after ?? change.entry.before;
              return (
                <Card key={change.entry.changeId} className="border-border hover:border-primary/40 transition-colors">
                  <CardContent className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        {renderDraftBadge(change.entry.type)}
                        <span className="font-semibold text-base">{account?.sitio || 'Desconocido'}</span>
                      </div>
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                        <span>
                          {t('changes.field_user')}: <strong className="text-foreground">{account?.usuario}</strong>
                        </span>
                        <span>
                          {t('changes.from_device')}:{' '}
                          <strong className="text-foreground">
                            {change.peerDevice.deviceName || change.peerDevice.deviceId.slice(0, 8)}
                          </strong>
                        </span>
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {formatTime(change.entry.createdAt)}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <Button
                        size="sm"
                        onClick={() => handlePreviewLoad(change)}
                        disabled={previewingDevice === change.peerDevice.deviceId}
                        className="flex items-center gap-1.5"
                      >
                        {previewingDevice === change.peerDevice.deviceId ? (
                          <RefreshCw className="w-4 h-4 animate-spin" />
                        ) : (
                          <Download className="w-4 h-4" />
                        )}
                        {t('changes.load')}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })
          )}
        </TabsContent>

        {/* Tab Content: Account History */}
        <TabsContent value="history" className="mt-4 space-y-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-muted-foreground">{t('changes.history_hint')}</p>
            {hiddenHistory.length > 0 && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowHidden((value) => !value)}
                className="shrink-0"
              >
                {showHidden
                  ? t('changes.history_hide_old')
                  : `${t('changes.history_show_old')} (${hiddenHistory.length})`}
              </Button>
            )}
          </div>

          {history.length === 0 ? (
            <Card className="border-dashed">
              <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                <History className="w-10 h-10 text-muted-foreground mb-3 opacity-40" />
                <h4 className="font-semibold text-lg">{t('changes.history_empty')}</h4>
                <p className="text-sm text-muted-foreground mt-1 max-w-sm">
                  {t('changes.history_empty_desc')}
                </p>
              </CardContent>
            </Card>
          ) : (
            <>
              {visibleHistory.length === 0 ? (
                <p className="py-4 text-center text-sm text-muted-foreground">
                  {t('changes.history_empty_recent')}
                </p>
              ) : (
                visibleHistory.map((entry) => (
                  <HistoryEntryCard key={entry.historyId} entry={entry} hidden={false} />
                ))
              )}

              {showHidden && hiddenHistory.length > 0 && (
                <div className="space-y-3 pt-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {t('changes.history_hidden_title')} ({hiddenHistory.length})
                  </p>
                  {hiddenHistory.map((entry) => (
                    <HistoryEntryCard key={entry.historyId} entry={entry} hidden />
                  ))}
                </div>
              )}
            </>
          )}
        </TabsContent>
      </Tabs>

      <AlertDialog
        open={preview !== null}
        onOpenChange={(open) => {
          if (!open) setPreview(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('changes.preview_title')}</AlertDialogTitle>
            <AlertDialogDescription>{t('changes.preview_desc')}</AlertDialogDescription>
          </AlertDialogHeader>

          {preview && (
            <div className="space-y-3">
              <div className="flex flex-wrap gap-2">
                {preview.summary.creates > 0 && (
                  <Badge variant="outline">
                    {preview.summary.creates} {t('changes.new_count')}
                  </Badge>
                )}
                {preview.summary.updates > 0 && (
                  <Badge variant="outline">
                    {preview.summary.updates} {t('changes.updated_count')}
                  </Badge>
                )}
                {preview.summary.deletes > 0 && (
                  <Badge variant="destructive">
                    {preview.summary.deletes} {t('changes.deleted_count')}
                  </Badge>
                )}
                {preview.summary.conflicts > 0 && (
                  <Badge variant="destructive">
                    {preview.summary.conflicts} {t('changes.conflict_count')}
                  </Badge>
                )}
              </div>

              <div className="max-h-64 space-y-2 overflow-y-auto pr-1">
                {preview.attention.map(({ entry, outcome }) => {
                  const account = entry.after ?? entry.before;
                  return (
                    <div
                      key={entry.changeId}
                      className="flex items-center justify-between gap-3 rounded-md border border-border p-2"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{account?.sitio || '—'}</p>
                        <p className="truncate text-xs text-muted-foreground">{account?.usuario}</p>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        {renderDraftBadge(entry.type)}
                        {outcome.kind === 'conflict' && (
                          <Badge variant="destructive">{t('changes.preview_conflict')}</Badge>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <AlertDialogFooter>
            <AlertDialogCancel>{t('changes.preview_cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                const target = preview;
                setPreview(null);
                if (target) void loadPeerChanges(target.deviceId);
              }}
            >
              {t('changes.preview_confirm')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

const HISTORY_FIELDS = ['sitio', 'usuario', 'password', 'notas'] as const;
type HistoryField = (typeof HISTORY_FIELDS)[number];

function HistoryEntryCard({ entry, hidden }: { entry: AccountChangeRecord; hidden: boolean }) {
  const { t } = useUISettings();
  const [showDetails, setShowDetails] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const account = entry.after ?? entry.before;
  const fields: HistoryField[] =
    entry.type === 'create' || entry.type === 'delete'
      ? [...HISTORY_FIELDS]
      : HISTORY_FIELDS.filter((field) => entry.changedFields.includes(field));

  const fieldLabel = (field: HistoryField) => {
    switch (field) {
      case 'sitio':
        return t('changes.field_site');
      case 'usuario':
        return t('changes.field_user');
      case 'password':
        return t('changes.field_password');
      case 'notas':
        return t('changes.field_notes');
    }
  };

  const valueOf = (side: 'before' | 'after', field: HistoryField) => {
    const source = side === 'before' ? entry.before : entry.after;
    if (!source) return '—';
    const value = source[field];
    if (!value) return '—';
    if (field === 'password' && !showPassword) return '••••••••';
    return value;
  };

  const sourceLabel =
    entry.source === 'local'
      ? t('changes.history_source_local')
      : entry.source === 'remote'
        ? t('changes.history_source_remote')
        : t('changes.history_source_import');

  const formatTime = (isoString: string) => {
    try {
      return new Date(isoString).toLocaleString();
    } catch {
      return isoString;
    }
  };

  const typeBadge = () => {
    switch (entry.type) {
      case 'create':
        return (
          <Badge className="bg-emerald-500/15 text-emerald-600 border-emerald-500/30 dark:text-emerald-400">
            <PlusCircle className="w-3 h-3 mr-1" />
            {t('changes.type_create')}
          </Badge>
        );
      case 'update':
        return (
          <Badge className="bg-blue-500/15 text-blue-600 border-blue-500/30 dark:text-blue-400">
            <Edit3 className="w-3 h-3 mr-1" />
            {t('changes.type_update')}
          </Badge>
        );
      case 'delete':
        return (
          <Badge className="bg-destructive/15 text-destructive border-destructive/30">
            <Trash2 className="w-3 h-3 mr-1" />
            {t('changes.type_delete')}
          </Badge>
        );
    }
  };

  return (
    <Card className={hidden ? 'border-dashed opacity-70' : 'border-border'}>
      <CardContent className="p-4 space-y-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              {typeBadge()}
              {hidden && <Badge variant="outline">{t('changes.history_hidden')}</Badge>}
              <span className="font-semibold text-base">{account?.sitio || '—'}</span>
            </div>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
              <span>
                {t('changes.field_user')}: <strong className="text-foreground">{account?.usuario || '—'}</strong>
              </span>
              <span className="flex items-center gap-1">
                <Clock className="w-3 h-3" />
                {formatTime(entry.createdAt)}
              </span>
              <span>
                {sourceLabel}
                {entry.deviceName ? ` · ${entry.deviceName}` : ''}
              </span>
            </div>
          </div>

          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowDetails((value) => !value)}
            className="shrink-0"
          >
            {showDetails ? t('changes.history_hide_details') : t('changes.history_details')}
          </Button>
        </div>

        {showDetails && (
          <div className="rounded-lg border bg-muted/20 p-3 space-y-2">
            <div className="flex justify-end">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowPassword((value) => !value)}
                className="h-7 gap-1.5 text-xs"
              >
                {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                {showPassword ? t('dashboard.hide_password') : t('dashboard.show_password')}
              </Button>
            </div>

            <div className="grid grid-cols-[90px_1fr_1fr] gap-2 text-xs">
              <span />
              <span className="font-semibold text-muted-foreground">{t('changes.history_before')}</span>
              <span className="font-semibold text-muted-foreground">{t('changes.history_after')}</span>

              {fields.map((field) => (
                <React.Fragment key={field}>
                  <span className="text-muted-foreground">{fieldLabel(field)}</span>
                  <span className={`break-words ${field === 'password' ? 'font-mono' : ''}`}>
                    {valueOf('before', field)}
                  </span>
                  <span className={`break-words ${field === 'password' ? 'font-mono' : ''}`}>
                    {valueOf('after', field)}
                  </span>
                </React.Fragment>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
