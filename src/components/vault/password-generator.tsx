"use client";

import { useState, useCallback, useEffect } from "react";
import { useUISettings } from "@/hooks/use-ui-settings";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Slider } from "@/components/ui/slider";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Copy, RefreshCw, ShieldCheck } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { copySecret } from "@/lib/clipboard";
import {
  generatePassword,
  getPoolSize,
  MAX_PASSWORD_LENGTH,
  MIN_PASSWORD_LENGTH,
  type PasswordGeneratorOptions,
} from "@/lib/password-generator";

type GeneratorSettings = Omit<PasswordGeneratorOptions, "length">;

const DEFAULT_LENGTH = 20;

export function PasswordGenerator() {
  const { t } = useUISettings();
  const [length, setLength] = useState([DEFAULT_LENGTH]);
  const [settings, setSettings] = useState<GeneratorSettings>({
    uppercase: true,
    lowercase: true,
    numbers: true,
    symbols: true,
    excludeAmbiguous: false,
  });
  const [password, setPassword] = useState("");

  const generate = useCallback(() => {
    try {
      setPassword(
        generatePassword({
          length: length[0],
          ...settings,
        })
      );
    } catch {
      setPassword("");
    }
  }, [length, settings]);

  useEffect(() => {
    generate();
  }, [generate]);

  const copyToClipboard = async () => {
    if (!(await copySecret(password))) return;
    toast({ title: t('generator.copied'), description: t('form.copied_auto_clear') });
  };

  const poolSize = getPoolSize({ length: length[0], ...settings });
  const entropyBits = Math.round(length[0] * Math.log2(Math.max(poolSize, 2)));

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex flex-col gap-2">
        <h2 className="text-3xl font-headline font-bold">{t('generator.title')}</h2>
        <p className="text-muted-foreground">{t('generator.desc')}</p>
      </div>

      <Card className="border-2 bg-card">
        <CardContent className="p-6 space-y-8">
          <div className="relative group">
            <div className="bg-muted/50 p-6 rounded-xl border-2 border-dashed flex items-center justify-center min-h-[100px] break-all">
              <span className="text-2xl md:text-3xl font-mono font-bold tracking-wider">{password}</span>
            </div>
            <div className="absolute top-2 right-2 flex gap-2">
              <Button size="icon" variant="ghost" onClick={generate} className="rounded-full" title={t('generator.button')}>
                <RefreshCw className="w-4 h-4" />
              </Button>
              <Button size="icon" variant="ghost" onClick={copyToClipboard} className="rounded-full" title={t('generator.copied')}>
                <Copy className="w-4 h-4" />
              </Button>
            </div>
          </div>

          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>{t('generator.entropy_label')}: <strong className="text-foreground">{entropyBits} bits</strong></span>
            <span className="flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5 text-green-600" />
              {t('generator.local_note')}
            </span>
          </div>

          <div className="space-y-6">
            <div className="space-y-4">
              <div className="flex justify-between">
                <Label className="text-sm font-bold uppercase tracking-widest">{t('generator.length')}: {length[0]}</Label>
              </div>
              <Slider
                value={length}
                onValueChange={setLength}
                max={MAX_PASSWORD_LENGTH}
                min={MIN_PASSWORD_LENGTH}
                step={1}
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="flex items-center space-x-3 p-4 bg-muted/30 rounded-lg">
                <Checkbox
                  id="upper"
                  checked={settings.uppercase}
                  onCheckedChange={(v) => setSettings(prev => ({ ...prev, uppercase: !!v }))}
                />
                <Label htmlFor="upper" className="cursor-pointer font-medium">{t('generator.uppercase')}</Label>
              </div>
              <div className="flex items-center space-x-3 p-4 bg-muted/30 rounded-lg">
                <Checkbox
                  id="lower"
                  checked={settings.lowercase}
                  onCheckedChange={(v) => setSettings(prev => ({ ...prev, lowercase: !!v }))}
                />
                <Label htmlFor="lower" className="cursor-pointer font-medium">{t('generator.lowercase')}</Label>
              </div>
              <div className="flex items-center space-x-3 p-4 bg-muted/30 rounded-lg">
                <Checkbox
                  id="numbers"
                  checked={settings.numbers}
                  onCheckedChange={(v) => setSettings(prev => ({ ...prev, numbers: !!v }))}
                />
                <Label htmlFor="numbers" className="cursor-pointer font-medium">{t('generator.numbers')}</Label>
              </div>
              <div className="flex items-center space-x-3 p-4 bg-muted/30 rounded-lg">
                <Checkbox
                  id="symbols"
                  checked={settings.symbols}
                  onCheckedChange={(v) => setSettings(prev => ({ ...prev, symbols: !!v }))}
                />
                <Label htmlFor="symbols" className="cursor-pointer font-medium">{t('generator.symbols')}</Label>
              </div>
              <div className="flex items-center space-x-3 p-4 bg-muted/30 rounded-lg md:col-span-2">
                <Checkbox
                  id="ambiguous"
                  checked={!!settings.excludeAmbiguous}
                  onCheckedChange={(v) => setSettings(prev => ({ ...prev, excludeAmbiguous: !!v }))}
                />
                <Label htmlFor="ambiguous" className="cursor-pointer font-medium">
                  {t('generator.exclude_ambiguous')}
                </Label>
              </div>
            </div>
          </div>

          <Button className="w-full h-12 gap-2 text-lg font-bold" onClick={generate}>
            <ShieldCheck className="w-5 h-5" /> {t('generator.button')}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
