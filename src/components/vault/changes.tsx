"use client";

import React, { useState } from 'react';
import { useSync, type PeerPendingChange } from '@/hooks/use-sync';
import { useVault } from '@/hooks/use-vault';
import { useUISettings } from '@/hooks/use-ui-settings';
import type { VaultDraft } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
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
    loadPeerChanges,
  } = useSync();

  const [editingDeviceName, setEditingDeviceName] = useState(deviceName);
  const [isSavingName, setIsSavingName] = useState(false);

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

      {/* Main Tabs: Local Drafts vs Remote Peer Changes */}
      <Tabs defaultValue="local" className="w-full">
        <TabsList className="grid grid-cols-2 max-w-md">
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
                        onClick={() => loadPeerChanges(change.peerDevice.deviceId)}
                        className="flex items-center gap-1.5"
                      >
                        <Download className="w-4 h-4" />
                        {t('changes.load')}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
};
