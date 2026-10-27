import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // The migrate route reads SQL + CA files at runtime; make sure Vercel ships them with the function.
  outputFileTracingIncludes: { '/api/admin/migrate': ['./supabase/migrations/**/*', './supabase/ca/**/*'] },
  serverExternalPackages: ['pg'],
}

export default nextConfig
