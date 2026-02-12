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
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Space+Grotesk:wght@500;700&display=swap" rel="stylesheet" />
      </head>
      <body className="font-body antialiased bg-background text-foreground transition-colors duration-300">
        <UISettingsProvider>
          {children}
          <Toaster />
        </UISettingsProvider>
      </body>
    </html>
  );
}
