import type {Metadata, Viewport} from 'next';
import './globals.css';
import { Toaster } from "@/components/ui/toaster";
import { UISettingsProvider } from "@/hooks/use-ui-settings";

export const metadata: Metadata = {
  title: 'LocalPass - Secure Offline Password Manager',
  description: 'A 100% offline, highly secure password manager with AES-256 encryption.',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f1f5f8' },
    { media: '(prefers-color-scheme: dark)', color: '#121a21' },
  ],
  // Shrink the layout when the Android keyboard opens so focused form
  // fields and their submit button stay above it.
  interactiveWidget: 'resizes-content',
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
