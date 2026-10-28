"use client";

import { useMemo, useState } from "react";
import { useVault } from "@/hooks/use-vault";
import { useUISettings } from "@/hooks/use-ui-settings";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Globe, Info, ShieldAlert, ShieldCheck } from "lucide-react";
import {
  auditVault,
  FRAMEWORK_LABELS,
  recommendationsFor,
  SEVERITY_ORDER,
  type AccountAudit,
  type AuditIssueCode,
  type Severity,
} from "@/lib/security-audit";
import type { AccountEntry } from "@/lib/types";
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

export function SecurityAudit() {
  const { vault } = useVault();
  const { t } = useUISettings();
  const [filter, setFilter] = useState<AuditFilter>('all');

  const audit = useMemo(() => (vault ? auditVault(vault) : null), [vault]);

  if (!vault || !audit) return null;

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

  const visibleAccounts = ranked.filter(matchesFilter);

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

          return (
            <Card key={account.id} className="overflow-hidden">
              <CardContent className="p-6 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
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
                  </div>
                </div>

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
              </CardContent>
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
    </div>
  );
}
