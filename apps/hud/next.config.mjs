/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['@livoclouds/contracts'],
  // Next.js 15+ blocks cross-origin access to /_next/* dev resources by default.
  // The HUD is consumed from the LAN (iPad / Raspberry Pi kiosk), so HMR and
  // dev-only assets must be reachable from non-localhost origins during `pnpm dev`.
  // Production builds are unaffected.
  allowedDevOrigins: ['127.0.0.1', 'localhost', '192.168.3.151', '*.local'],
  experimental: {
    // Defense in depth: cap server-action body size. Route handlers enforce their
    // own Content-Length guard (64 KB) in apps/hud/app/api/events/route.ts.
    serverActions: {
      bodySizeLimit: '64kb',
    },
  },
};

export default nextConfig;
