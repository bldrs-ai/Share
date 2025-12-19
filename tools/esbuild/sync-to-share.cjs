#!/usr/bin/env node

/**
 * Sync bolt.new build to Share repository
 * Usage from Share repo:
 *   node sync-bolt.cjs /path/to/bolt.new
 *   yarn sync-bolt /path/to/bolt.new
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

function log(emoji, message) {
  console.log(`${emoji} ${message}`);
}

function error(message) {
  console.error(`❌ ${message}`);
  process.exit(1);
}

function exec(command, cwd) {
  try {
    execSync(command, { cwd, stdio: 'inherit' });
  } catch (err) {
    error(`Command failed: ${command}`);
  }
}

function copyRecursive(src, dest) {
  if (!fs.existsSync(src)) {
    error(`Source directory not found: ${src}`);
  }

  // Remove destination if exists
  if (fs.existsSync(dest)) {
    fs.rmSync(dest, { recursive: true, force: true });
  }

  // Create parent directory
  fs.mkdirSync(dest, { recursive: true });

  // Copy all files
  const files = fs.readdirSync(src, { withFileTypes: true });
  for (const file of files) {
    const srcPath = path.join(src, file.name);
    const destPath = path.join(dest, file.name);

    if (file.isDirectory()) {
      fs.mkdirSync(destPath, { recursive: true });
      copyRecursive(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

// Main script
const boltPath = process.argv[2];

if (!boltPath) {
  error('BOLT_PATH required\nUsage: node sync-bolt.cjs /path/to/bolt.new');
}

const sharePath = process.cwd();
const absoluteBoltPath = path.resolve(boltPath);

if (!fs.existsSync(absoluteBoltPath)) {
  error(`Bolt directory not found at ${absoluteBoltPath}`);
}

log('🔨', `Building bolt.new at ${absoluteBoltPath}...`);
exec('pnpm run build', absoluteBoltPath);

log('📦', `Syncing to Share at ${sharePath}...`);

// Copy client files to docs/build
const clientSrc = path.join(absoluteBoltPath, 'build', 'client');
const clientDest = path.join(sharePath, 'docs', 'build');
copyRecursive(clientSrc, clientDest);

// Copy server files to netlify/functions/server
const serverSrc = path.join(absoluteBoltPath, 'build', 'server');
const serverDest = path.join(sharePath, 'netlify', 'functions', 'server');
copyRecursive(serverSrc, serverDest);

log('✅', 'Bolt synced. Run "netlify dev" to test at http://localhost:8888/build');
