import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  serverExternalPackages: [
    '@supabase/supabase-js',
    '@anthropic-ai/sdk',
    'openai',
    'playwright',
    'playwright-core',
  ],
};

export default nextConfig;
