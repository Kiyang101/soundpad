import type { NextConfig } from 'next';

const config: NextConfig = {
  serverExternalPackages: ['ffmpeg-static', 'ffprobe-static'],
  outputFileTracingIncludes: {
    '/api/admin/audio': [
      './node_modules/ffmpeg-static/ffmpeg',
      `./node_modules/ffprobe-static/bin/${process.platform}/${process.arch}/ffprobe`,
    ],
  },
  poweredByHeader: false,
  agentRules: false,
};

export default config;
