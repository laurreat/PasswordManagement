import type {Metadata} from 'next';
import './globals.css';
import { Toaster } from "@/components/ui/toaster";
import { UISettingsProvider } from "@/hooks/use-ui-settings";

export const metadata: Metadata = {
  title: 'LocalPass - Secure Offline Password Manager',
  description: 'A 100% offline, highly secure password manager with AES-256 encryption.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="font-body antialiased bg-background text-foreground transition-colors duration-300">
        <UISettingsProvider>
          {children}
          <Toaster />
        </UISettingsProvider>
      </body>
    </html>
  );
}
