"use client";

import { useState, useCallback, useEffect } from "react";
import { useUISettings } from "@/hooks/use-ui-settings";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Slider } from "@/components/ui/slider";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Copy, RefreshCw, ShieldCheck } from "lucide-react";
import { toast } from "@/hooks/use-toast";

export function PasswordGenerator() {
  const { t } = useUISettings();
  const [length, setLength] = useState([16]);
  const [options, setOptions] = useState({
    uppercase: true,
    lowercase: true,
    numbers: true,
    symbols: true,
  });
  const [password, setPassword] = useState("");

  const generate = useCallback(() => {
    const charset = {
      uppercase: "ABCDEFGHIJKLMNOPQRSTUVWXYZ",
      lowercase: "abcdefghijklmnopqrstuvwxyz",
      numbers: "0123456789",
      symbols: "!@#$%^&*()_+~`|}{[]:;?><,./-=",
    };

    let characters = "";
    if (options.uppercase) characters += charset.uppercase;
    if (options.lowercase) characters += charset.lowercase;
    if (options.numbers) characters += charset.numbers;
    if (options.symbols) characters += charset.symbols;

    if (!characters) return;

    let result = "";
    for (let i = 0; i < length[0]; i++) {
      result += characters.charAt(Math.floor(Math.random() * characters.length));
    }
    setPassword(result);
  }, [length, options]);

  useEffect(() => {
    generate();
  }, [generate]);

  const copyToClipboard = () => {
    navigator.clipboard.writeText(password);
    toast({ title: t('generator.copied'), description: "" });
  };

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
              <Button size="icon" variant="ghost" onClick={generate} className="rounded-full">
                <RefreshCw className="w-4 h-4" />
              </Button>
              <Button size="icon" variant="ghost" onClick={copyToClipboard} className="rounded-full">
                <Copy className="w-4 h-4" />
              </Button>
            </div>
          </div>

          <div className="space-y-6">
            <div className="space-y-4">
              <div className="flex justify-between">
                <Label className="text-sm font-bold uppercase tracking-widest">{t('generator.length')}: {length[0]}</Label>
              </div>
              <Slider 
                value={length} 
                onValueChange={setLength} 
                max={64} 
                min={8} 
                step={1} 
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="flex items-center space-x-3 p-4 bg-muted/30 rounded-lg">
                <Checkbox 
                  id="upper" 
                  checked={options.uppercase} 
                  onCheckedChange={(v) => setOptions(prev => ({ ...prev, uppercase: !!v }))} 
                />
                <Label htmlFor="upper" className="cursor-pointer font-medium">{t('generator.uppercase')}</Label>
              </div>
              <div className="flex items-center space-x-3 p-4 bg-muted/30 rounded-lg">
                <Checkbox 
                  id="lower" 
                  checked={options.lowercase} 
                  onCheckedChange={(v) => setOptions(prev => ({ ...prev, lowercase: !!v }))} 
                />
                <Label htmlFor="lower" className="cursor-pointer font-medium">{t('generator.lowercase')}</Label>
              </div>
              <div className="flex items-center space-x-3 p-4 bg-muted/30 rounded-lg">
                <Checkbox 
                  id="numbers" 
                  checked={options.numbers} 
                  onCheckedChange={(v) => setOptions(prev => ({ ...prev, numbers: !!v }))} 
                />
                <Label htmlFor="numbers" className="cursor-pointer font-medium">{t('generator.numbers')}</Label>
              </div>
              <div className="flex items-center space-x-3 p-4 bg-muted/30 rounded-lg">
                <Checkbox 
                  id="symbols" 
                  checked={options.symbols} 
                  onCheckedChange={(v) => setOptions(prev => ({ ...prev, symbols: !!v }))} 
                />
                <Label htmlFor="symbols" className="cursor-pointer font-medium">{t('generator.symbols')}</Label>
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
