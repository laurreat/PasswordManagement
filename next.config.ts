import type { NextConfig } from 'next';

/**
 * LocalPass ships as a static bundle loaded from disk by Electron's custom
 * `app://` protocol. There is no server, no image optimizer and no remote
 * asset: every file the renderer needs is inside `out/`.
 */
const nextConfig: NextConfig = {
  output: 'export',
  trailingSlash: true,
  images: {
    // Static export cannot run the Next.js image optimizer.
    unoptimized: true,
  },
  typescript: {
    ignoreBuildErrors: false,
  },
};

export default nextConfig;
