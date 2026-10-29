"use client";

import { useMemo, useState } from "react";
import { useVault } from "@/hooks/use-vault";
import { useToast } from "@/hooks/use-toast";
import { useUISettings } from "@/hooks/use-ui-settings";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import {
  AlertTriangle,
  ChevronDown,
  ChevronsUpDown,
  Copy,
  Eye,
  EyeOff,
  Globe,
  Info,
  RefreshCw,
  Search,
  ShieldAlert,
  ShieldCheck,
  Wrench,
  X,
} from "lucide-react";
import {
  auditVault,
  estimateEntropyBits,
  FRAMEWORK_LABELS,
  recommendationsFor,
  SEVERITY_ORDER,
  type AccountAudit,
  type AuditIssueCode,
  type Severity,
} from "@/lib/security-audit";
import {
  advisoryIssues,
  applyPasswordRemediation,
  generateRemediationPassword,
  remediationIssues,
  remainingFindingCodes,
} from "@/lib/audit-remediation";
import type { AccountEntry } from "@/lib/types";
import { copySecret } from "@/lib/clipboard";
import { cn } from "@/lib/utils";

type AuditFilter = 'all' | 'issues' | 'reuse' | 'clean';

const FILTERS: AuditFilter[] = ['all', 'issues', 'reuse', 'clean'];

const SEVERITY_LABEL_KEYS: Record<Severity, string> = {
  critical: 'audit.status_critical',
  high: 'audit.status_high',
  medium: 'audit.status_medium',
  low: 'audit.status_low',
  info: 'audit.status_info',
};

const SEVERITY_BADGE_CLASS: Record<Severity, string> = {
  critical: 'bg-destructive text-destructive-foreground',
  high: 'bg-destructive/10 text-destructive border-destructive/30',
  medium: 'bg-yellow-500/10 text-yellow-700 border-yellow-500/30',
  low: 'bg-muted text-muted-foreground',
  info: 'bg-secondary text-secondary-foreground',
};

const SEVERITY_DOT_CLASS: Record<Severity, string> = {
  critical: 'bg-destructive',
  high: 'bg-destructive/70',
  medium: 'bg-yellow-500',
  low: 'bg-muted-foreground/50',
  info: 'bg-muted-foreground/30',
};

function auditSeverity(audit: AccountAudit): Severity | 'secure' {
  return audit.severity;
}

function scoreStatusKey(score: number): string {
  if (score >= 85) return 'audit.status_secure';
  if (score >= 70) return 'audit.status_low';
  if (score >= 50) return 'audit.status_medium';
  return 'audit.status_high';
}

function otherPasswordsFor(vaultAccounts: AccountEntry[], accountId: string): string[] {
  return vaultAccounts
    .filter((account) => account.id !== accountId)
    .map((account) => account.password)
    .filter((password) => password.length > 0);
}

export function SecurityAudit() {
  const { vault, updateVault } = useVault();
  const { t } = useUISettings();
  const { toast } = useToast();

  const [filter, setFilter] = useState<AuditFilter>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => new Set());
  const [revealedIds, setRevealedIds] = useState<Set<string>>(() => new Set());
  const [remediationTarget, setRemediationTarget] = useState<AccountEntry | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const audit = useMemo(() => (vault ? auditVault(vault) : null), [vault]);

  if (!vault || !audit) return null;

  const query = searchTerm.trim().toLowerCase();

  const ranked = [...vault.accounts].sort((first, second) => {
    const firstAudit = audit.accounts[first.id];
    const secondAudit = audit.accounts[second.id];
    return (firstAudit?.score ?? 100) - (secondAudit?.score ?? 100);
  });

  const matchesFilter = (account: AccountEntry): boolean => {
    const accountAudit = audit.accounts[account.id];
    if (!accountAudit) return false;

    switch (filter) {
      case 'issues':
        return accountAudit.findings.some(finding => finding.severity !== 'info');
      case 'reuse':
        return accountAudit.findings.some(
          finding => finding.code === 'password_reused' || finding.code === 'password_similar'
        );
      case 'clean':
        return !accountAudit.findings.some(finding => finding.severity !== 'info');
      default:
        return true;
    }
  };

  const matchesSearch = (account: AccountEntry): boolean =>
    query === '' ||
    account.sitio.toLowerCase().includes(query) ||
    account.usuario.toLowerCase().includes(query);

  const visibleAccounts = ranked.filter(account => matchesSearch(account) && matchesFilter(account));
  const allVisibleExpanded =
    visibleAccounts.length > 0 && visibleAccounts.every(account => expandedIds.has(account.id));

  const toggleExpanded = (accountId: string) => {
    setExpandedIds(current => {
      const next = new Set(current);
      if (next.has(accountId)) next.delete(accountId);
      else next.add(accountId);
      return next;
    });
  };

  const toggleAllExpanded = () => {
    setExpandedIds(current => {
      const next = new Set(current);
      for (const account of visibleAccounts) {
        if (allVisibleExpanded) next.delete(account.id);
        else next.add(account.id);
      }
      return next;
    });
  };

  const toggleRevealed = (accountId: string) => {
    setRevealedIds(current => {
      const next = new Set(current);
      if (next.has(accountId)) next.delete(accountId);
      else next.add(accountId);
      return next;
    });
  };

  const openRemediation = (account: AccountEntry) => {
    setRemediationTarget(account);
    setNewPassword(generateRemediationPassword(account, otherPasswordsFor(vault.accounts, account.id)));
    setShowNewPassword(false);
  };

  const regeneratePassword = () => {
    if (!remediationTarget) return;
    setNewPassword(
      generateRemediationPassword(
        remediationTarget,
        otherPasswordsFor(vault.accounts, remediationTarget.id)
      )
    );
  };

  const copyNewPassword = async () => {
    if (!newPassword) return;
    if (!(await copySecret(newPassword))) return;
    toast({ title: t('generator.copied'), description: t('form.copied_auto_clear') });
  };

  const applyRemediation = async () => {
    if (!remediationTarget) return;

    setIsSaving(true);
    try {
      await updateVault(v => applyPasswordRemediation(v, remediationTarget.id, newPassword));
      toast({
        title: t('audit.fix_saved_title'),
        description: t('audit.fix_saved_desc'),
      });
      setRemediationTarget(null);
      setNewPassword('');
    } catch {
      toast({
        variant: "destructive",
        title: t('audit.fix_error_title'),
        description: t('app.error_vault_write_failed'),
      });
    } finally {
      setIsSaving(false);
    }
  };

  const targetAudit = remediationTarget ? audit.accounts[remediationTarget.id] : null;
  const targetRemediable = targetAudit ? remediationIssues(targetAudit) : [];
  const targetAdvisory = targetAudit ? advisoryIssues(targetAudit) : [];
  const targetOtherPasswords = remediationTarget
    ? otherPasswordsFor(vault.accounts, remediationTarget.id)
    : [];
  const remaining = remediationTarget
    ? remainingFindingCodes(remediationTarget, newPassword, targetOtherPasswords)
    : [];
  const entropyBits = estimateEntropyBits(newPassword);
  const canApply = Boolean(
    remediationTarget &&
    newPassword &&
    newPassword !== remediationTarget.password &&
    remaining.length === 0 &&
    !isSaving
  );

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-10">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <h2 className="text-2xl font-headline font-bold">{t('audit.title')}</h2>
          <p className="text-muted-foreground max-w-2xl">{t('audit.desc')}</p>
        </div>
        <Badge variant="outline" className="w-fit gap-1.5 py-1.5">
          <ShieldCheck className="w-3.5 h-3.5 text-green-600" />
          {t('audit.local_badge')}
        </Badge>
      </div>

      <Card className="border-muted shadow-none">
        <CardContent className="p-6 space-y-5">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                {t('audit.score_label')}
              </p>
              <div className="flex items-baseline gap-2">
                <span className="text-4xl font-headline font-bold">{audit.score}</span>
                <span className="text-muted-foreground">/ 100</span>
                <Badge className="ml-2 bg-primary/10 text-primary border-none">
                  {t(scoreStatusKey(audit.score))}
                </Badge>
              </div>
            </div>
            <p className="text-sm text-muted-foreground max-w-sm">{t('audit.score_hint')}</p>
          </div>

          <Progress
            value={audit.score}
            className="h-2"
            indicatorClassName={cn(
              audit.score >= 85 ? 'bg-green-500' : audit.score >= 50 ? 'bg-yellow-500' : 'bg-destructive'
            )}
          />

          <div className="flex flex-wrap gap-2">
            {SEVERITY_ORDER.map((severity) => (
              <span
                key={severity}
                className={cn(
                  'inline-flex items-center gap-2 rounded-md border px-2.5 py-1 text-xs font-medium',
                  SEVERITY_BADGE_CLASS[severity]
                )}
              >
                <span className={cn('h-1.5 w-1.5 rounded-full', SEVERITY_DOT_CLASS[severity])} />
                {t(SEVERITY_LABEL_KEYS[severity])}: {audit.counts[severity]}
              </span>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-2 border-t pt-4">
            <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              {t('audit.frameworks_label')}
            </span>
            {Object.entries(FRAMEWORK_LABELS).map(([id, label]) => (
              <Badge key={id} variant="secondary" className="text-[10px] font-medium">
                {label}
              </Badge>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            placeholder={t('audit.search_placeholder')}
            className="pl-9 pr-9 bg-background/50 border-muted"
          />
          {searchTerm && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="absolute right-1 top-1/2 h-7 w-7 -translate-y-1/2"
              title={t('audit.search_clear')}
              aria-label={t('audit.search_clear')}
              onClick={() => setSearchTerm('')}
            >
              <X className="w-4 h-4" />
            </Button>
          )}
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="gap-2"
          disabled={visibleAccounts.length === 0}
          onClick={toggleAllExpanded}
        >
          <ChevronsUpDown className="w-4 h-4" />
          {allVisibleExpanded ? t('audit.collapse_all') : t('audit.expand_all')}
        </Button>
      </div>

      <div className="flex flex-wrap gap-2">
        {FILTERS.map((option) => (
          <Button
            key={option}
            size="sm"
            variant={filter === option ? 'default' : 'outline'}
            onClick={() => setFilter(option)}
          >
            {t(`audit.filters_${option}`)}
          </Button>
        ))}
      </div>

      <div className="space-y-4">
        {visibleAccounts.map((account) => {
          const accountAudit = audit.accounts[account.id];
          if (!accountAudit) return null;

          const severity = auditSeverity(accountAudit);
          const recommendations = recommendationsFor(accountAudit);
          const remediable = remediationIssues(accountAudit);
          const isExpanded = expandedIds.has(account.id);
          const isRevealed = revealedIds.has(account.id);
          const maskedPassword = account.password
            ? '•'.repeat(Math.min(account.password.length, 24))
            : '—';

          return (
            <Card key={account.id} className="overflow-hidden">
              <button
                type="button"
                onClick={() => toggleExpanded(account.id)}
                aria-expanded={isExpanded}
                aria-controls={`audit-account-${account.id}`}
                className="w-full flex flex-wrap items-center justify-between gap-3 p-6 text-left transition-colors hover:bg-muted/30"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <Globe className="w-5 h-5 text-accent shrink-0" />
                  <div className="min-w-0">
                    <p className="font-bold truncate">{account.sitio}</p>
                    <p className="text-sm text-muted-foreground truncate">{account.usuario}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">{accountAudit.score}/100</span>
                  <Badge
                    className={cn(
                      'border',
                      severity === 'secure'
                        ? 'bg-green-500/10 text-green-700 border-green-500/30'
                        : SEVERITY_BADGE_CLASS[severity]
                    )}
                  >
                    {severity === 'secure' ? t('audit.status_secure') : t(SEVERITY_LABEL_KEYS[severity])}
                  </Badge>
                  <ChevronDown
                    className={cn(
                      'w-4 h-4 text-muted-foreground transition-transform',
                      isExpanded && 'rotate-180'
                    )}
                  />
                </div>
              </button>

              {isExpanded && (
                <CardContent id={`audit-account-${account.id}`} className="px-6 pb-6 pt-0">
                  <div className="space-y-5 border-t pt-5">
                    <dl className="grid gap-3 text-sm sm:grid-cols-2">
                      <div className="min-w-0">
                        <dt className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                          {t('form.user')}
                        </dt>
                        <dd className="truncate">{account.usuario}</dd>
                      </div>
                      <div className="min-w-0">
                        <dt className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                          {t('form.password')}
                        </dt>
                        <dd className="flex items-center gap-1 min-w-0">
                          <span className="font-mono text-xs break-all">{isRevealed ? account.password : maskedPassword}</span>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 shrink-0"
                            title={isRevealed ? t('dashboard.hide_password') : t('dashboard.show_password')}
                            aria-label={isRevealed ? t('dashboard.hide_password') : t('dashboard.show_password')}
                            onClick={() => toggleRevealed(account.id)}
                          >
                            {isRevealed ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 shrink-0"
                            title={t('form.copied')}
                            aria-label={t('form.copied')}
                            onClick={async () => {
                              if (!(await copySecret(account.password))) return;
                              toast({ title: t('form.copied'), description: t('form.copied_auto_clear') });
                            }}
                          >
                            <Copy className="w-3.5 h-3.5" />
                          </Button>
                        </dd>
                      </div>
                      {account.notas && (
                        <div className="sm:col-span-2 min-w-0">
                          <dt className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                            {t('form.notes')}
                          </dt>
                          <dd className="whitespace-pre-wrap break-words text-muted-foreground">{account.notas}</dd>
                        </div>
                      )}
                      <div className="sm:col-span-2">
                        <dt className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                          {t('dashboard.last_update')}
                        </dt>
                        <dd className="text-muted-foreground">{new Date(account.updatedAt).toLocaleString()}</dd>
                      </div>
                    </dl>

                    {recommendations.length === 0 ? (
                      <p className="text-sm text-muted-foreground flex items-center gap-2">
                        <ShieldCheck className="w-4 h-4 text-green-600" />
                        {t('audit.secure_msg')}
                      </p>
                    ) : (
                      <ul className="space-y-3">
                        {recommendations.map((code: AuditIssueCode) => {
                          const finding = accountAudit.findings.find(entry => entry.code === code);
                          const findingSeverity = finding?.severity ?? 'info';

                          return (
                            <li key={code} className="flex gap-3 text-sm">
                              <span
                                className={cn(
                                  'mt-1.5 h-2 w-2 shrink-0 rounded-full',
                                  SEVERITY_DOT_CLASS[findingSeverity]
                                )}
                              />
                              <div className="min-w-0">
                                <p className="font-medium">{t(`audit.issue_${code}`)}</p>
                                <p className="text-muted-foreground">{t(`audit.rec_${code}`)}</p>
                                {finding && finding.frameworks.length > 0 && (
                                  <p className="mt-1 text-[10px] uppercase tracking-wide text-muted-foreground/70">
                                    {finding.frameworks.map((framework) => FRAMEWORK_LABELS[framework]).join(' · ')}
                                  </p>
                                )}
                              </div>
                            </li>
                          );
                        })}
                      </ul>
                    )}

                    {remediable.length > 0 && (
                      <div className="flex justify-end border-t pt-4">
                        <Button size="sm" className="gap-2" onClick={() => openRemediation(account)}>
                          <Wrench className="w-4 h-4" />
                          {t('audit.fix_button')}
                        </Button>
                      </div>
                    )}
                  </div>
                </CardContent>
              )}
            </Card>
          );
        })}

        {visibleAccounts.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-center text-muted-foreground">
            {filter === 'clean' ? (
              <ShieldAlert className="w-10 h-10 mb-3 opacity-40" />
            ) : (
              <Info className="w-10 h-10 mb-3 opacity-40" />
            )}
            <p className="font-medium">{t('audit.empty_state')}</p>
            <p className="text-sm max-w-sm mt-1">{t('audit.empty_hint')}</p>
          </div>
        )}
      </div>

      <Dialog
        open={remediationTarget !== null}
        onOpenChange={(open) => {
          if (!open) setRemediationTarget(null);
        }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Wrench className="w-5 h-5" />
              {t('audit.fix_title')}
            </DialogTitle>
            <DialogDescription>{t('audit.fix_desc')}</DialogDescription>
          </DialogHeader>

          {remediationTarget && (
            <div className="space-y-4">
              <div className="rounded-md border bg-muted/30 p-3">
                <p className="font-bold truncate">{remediationTarget.sitio}</p>
                <p className="text-sm text-muted-foreground truncate">{remediationTarget.usuario}</p>
              </div>

              <div className="space-y-2">
                <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  {t('audit.fix_addressed')}
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {targetRemediable.map((code) => (
                    <Badge key={code} variant="secondary" className="text-[10px] font-medium">
                      {t(`audit.issue_${code}`)}
                    </Badge>
                  ))}
                </div>
              </div>

              {targetAdvisory.length > 0 && (
                <div className="space-y-1">
                  <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                    {t('audit.fix_advisory')}
                  </p>
                  <ul className="space-y-1 text-xs text-muted-foreground">
                    {targetAdvisory.map((code) => (
                      <li key={code}>
                        <span className="font-medium">{t(`audit.issue_${code}`)}</span>{' '}
                        {t(`audit.rec_${code}`)}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="space-y-2">
                <label className="text-sm font-medium" htmlFor="audit-new-password">
                  {t('audit.fix_new_password')}
                </label>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Input
                      id="audit-new-password"
                      type={showNewPassword ? 'text' : 'password'}
                      value={newPassword}
                      onChange={(event) => setNewPassword(event.target.value)}
                      className="pr-10 font-mono text-sm"
                      autoComplete="new-password"
                      spellCheck={false}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="absolute right-1 top-1/2 h-8 w-8 -translate-y-1/2"
                      title={showNewPassword ? t('dashboard.hide_password') : t('dashboard.show_password')}
                      aria-label={showNewPassword ? t('dashboard.hide_password') : t('dashboard.show_password')}
                      onClick={() => setShowNewPassword(current => !current)}
                    >
                      {showNewPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </Button>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    title={t('audit.fix_generate')}
                    aria-label={t('audit.fix_generate')}
                    onClick={regeneratePassword}
                  >
                    <RefreshCw className="w-4 h-4" />
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    title={t('audit.fix_copy')}
                    aria-label={t('audit.fix_copy')}
                    onClick={copyNewPassword}
                    disabled={!newPassword}
                  >
                    <Copy className="w-4 h-4" />
                  </Button>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                  <span>
                    {t('generator.entropy_label')}: {entropyBits} bits
                  </span>
                  {newPassword && (
                    <span
                      className={
                        remaining.length === 0
                          ? 'text-green-600 dark:text-green-400'
                          : 'text-amber-600 dark:text-amber-400'
                      }
                    >
                      {remaining.length === 0 ? t('audit.fix_strong') : t('audit.fix_remaining')}
                    </span>
                  )}
                </div>

                {newPassword && remaining.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {remaining.map((code) => (
                      <Badge
                        key={code}
                        variant="outline"
                        className="border-amber-500/40 text-[10px] text-amber-700 dark:text-amber-400"
                      >
                        {t(`audit.issue_${code}`)}
                      </Badge>
                    ))}
                  </div>
                )}
              </div>

              <p className="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/5 p-3 text-xs text-amber-700 dark:text-amber-400">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>{t('audit.fix_local_warning')}</span>
              </p>
            </div>
          )}

          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={() => setRemediationTarget(null)}>
              {t('app.cancel')}
            </Button>
            <Button type="button" onClick={applyRemediation} disabled={!canApply} className="gap-2">
              {isSaving ? t('app.encrypting') : t('audit.fix_apply')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
