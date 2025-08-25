#!/usr/bin/env node

import esbuild from 'esbuild';

const buildConfig = {
  entryPoints: ['src/index.ts'],
  bundle: true,
  platform: 'node',
  target: 'node18',
  format: 'esm',
  outfile: 'index.js',
  sourcemap: false,
  minify: false,
  external: [
    '@ziggler/clanker',
    'node-record-lpcm16',
    'node-fetch',
    'form-data'
  ],
  banner: {
    js: '// Voice Input Tool for Clanker'
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
    
    console.log('✓ Build completed successfully');
    console.log('✓ Generated: index.js');
    
  } catch (error) {
    console.error('Build failed:', error);
    process.exit(1);
  }
}

build();