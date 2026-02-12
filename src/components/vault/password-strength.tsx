"use client";

import { useUISettings } from "@/hooks/use-ui-settings";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";

export function PasswordStrength({ password }: { password: string }) {
  const { t } = useUISettings();

  const calculateStrength = (p: string) => {
    let score = 0;
    if (!p) return 0;
    if (p.length > 8) score += 20;
    if (p.length > 12) score += 20;
    if (/[A-Z]/.test(p)) score += 20;
    if (/[0-9]/.test(p)) score += 20;
    if (/[^A-Za-z0-9]/.test(p)) score += 20;
    return score;
  };

  const strength = calculateStrength(password);
  
  const getLabel = (s: number) => {
    if (s < 40) return t('strength.weak');
    if (s < 80) return t('strength.fair');
    return t('strength.strong');
  };

  const getColorClass = (s: number) => {
    if (s < 40) return "bg-destructive";
    if (s < 80) return "bg-yellow-500";
    return "bg-green-500";
  };

  return (
    <div className="space-y-1.5 mt-2">
      <div className="flex justify-between text-xs font-medium">
        <span>{t('strength.label')}</span>
        <span className={cn(
          strength < 40 ? "text-destructive" : strength < 80 ? "text-yellow-600" : "text-green-600"
        )}>
          {getLabel(strength)}
        </span>
      </div>
      <Progress value={strength} className="h-1" indicatorClassName={getColorClass(strength)} />
    </div>
  );
}
