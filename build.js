#!/usr/bin/env node

import esbuild from 'esbuild';
import path from 'path';

// Bundle configuration similar to the web-search tool
const buildConfig = {
  entryPoints: ['src/index.ts'],
  bundle: true,
  platform: 'node',
  target: 'node18',
  format: 'esm',
  outfile: 'index.js',
  sourcemap: false,
  minify: false,
  // Mark Clanker and common Node.js modules as external to avoid bundling them
  external: [
    '@ziggler/clanker',
    'node-record-lpcm16',
    'node-fetch',
    'node-notifier',
    'form-data',
    // Node.js built-ins
    'child_process',
    'fs',
    'fs/promises',
    'path',
    'os',
    'util',
    'crypto',
    'events',
    'stream',
    'url',
    'buffer',
    'http',
    'https',
    'querystring'
  ],
  banner: {
    js: '// ../tool-repo/src/index.ts'
  }
};

async function build() {
  try {
    console.log('Building voice-input tool...');
    
    const result = await esbuild.build(buildConfig);
    
    if (result.errors.length > 0) {
      console.error('Build errors:', result.errors);
      process.exit(1);
    }
    
    if (result.warnings.length > 0) {
      console.warn('Build warnings:', result.warnings);
    }
    
    console.log('✓ Build completed successfully');
    console.log('✓ Generated: index.js');
    
  } catch (error) {
    console.error('Build failed:', error);
    process.exit(1);
  }
}

build();