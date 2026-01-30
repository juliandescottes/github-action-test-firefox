#!/usr/bin/env node

import { downloadFirefox } from './firefox-downloader.mjs';
import { writeFileSync } from 'fs';
import { join } from 'path';

/**
 * CLI tool for downloading Firefox binaries
 *
 * Usage:
 *   node download-firefox-cli.mjs <url> [options]
 *
 * Options:
 *   --cache-dir <path>  - Directory to cache downloads
 *   --force            - Force re-download even if cached
 *   --output-env       - Write FIREFOX_BINARY to .env file
 *
 * Examples:
 *   # Download from Mozilla FTP
 *   node download-firefox-cli.mjs https://ftp.mozilla.org/pub/firefox/releases/147.0/mac/en-US/firefox-147.0.tar.bz2
 *
 *   # Download from Firefox CI
 *   node download-firefox-cli.mjs https://firefox-ci-tc.services.mozilla.com/api/queue/v1/task/TASK_ID/artifacts/public/build/firefox.tar.bz2
 */

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    console.log(`
Usage: node download-firefox-cli.mjs <url> [options]

Downloads and extracts Firefox binary from a URL.

Arguments:
  url                 URL to Firefox archive (.tar.bz2 or .dmg)

Options:
  --cache-dir <path>  Directory to cache downloads (default: OS temp dir)
  --force             Force re-download even if cached
  --output-env        Write FIREFOX_BINARY to .env file in current directory
  --help, -h          Show this help message

Examples:
  # Download from Mozilla FTP (macOS .dmg)
  node download-firefox-cli.mjs https://download-installer.cdn.mozilla.net/pub/firefox/releases/147.0/mac/en-US/Firefox%20147.0.dmg

  # Download from Firefox CI (.tar.bz2)
  node download-firefox-cli.mjs https://firefox-ci-tc.services.mozilla.com/api/queue/v1/task/TASK_ID/artifacts/public/build/firefox.tar.bz2

  # Download and save path to .env
  node download-firefox-cli.mjs <url> --output-env

Environment:
  The downloaded binary path is automatically exported as FIREFOX_BINARY
  for use in subsequent test commands in CI environments.
`);
    process.exit(args.includes('--help') || args.includes('-h') ? 0 : 1);
  }

  // Parse arguments
  const url = args[0];
  const options = {
    forceDownload: args.includes('--force'),
  };

  const cacheDirIndex = args.indexOf('--cache-dir');
  if (cacheDirIndex !== -1 && args[cacheDirIndex + 1]) {
    options.cacheDir = args[cacheDirIndex + 1];
  }

  const outputEnv = args.includes('--output-env');

  try {
    console.log(`\nDownloading Firefox from: ${url}\n`);

    const result = await downloadFirefox(url, options);

    console.log('\n✓ Download complete!');
    console.log(`  Binary path: ${result.binaryPath}`);
    console.log(`  Version: ${result.version}`);
    console.log(`  Extract path: ${result.extractPath}`);

    // Export for use in CI
    console.log(`\nTo use this binary in tests:`);
    console.log(`  export FIREFOX_BINARY="${result.binaryPath}"`);

    // Write to .env file if requested
    if (outputEnv) {
      const envPath = join(process.cwd(), '.env');
      const envContent = `FIREFOX_BINARY=${result.binaryPath}\n`;
      writeFileSync(envPath, envContent);
      console.log(`\n✓ Wrote FIREFOX_BINARY to ${envPath}`);
    }

    // In GitHub Actions, set environment variable for subsequent steps
    if (process.env.GITHUB_ENV) {
      const envVar = `FIREFOX_BINARY=${result.binaryPath}\n`;
      writeFileSync(process.env.GITHUB_ENV, envVar, { flag: 'a' });
      console.log(`\n✓ Set GitHub Actions environment variable: FIREFOX_BINARY`);
    }

    // Also set step output (useful if steps want to reference it as an output)
    if (process.env.GITHUB_OUTPUT) {
      const output = `firefox_binary=${result.binaryPath}\n`;
      writeFileSync(process.env.GITHUB_OUTPUT, output, { flag: 'a' });
      console.log(`✓ Set GitHub Actions step output: firefox_binary`);
    }

    // Set environment variable for current process
    process.env.FIREFOX_BINARY = result.binaryPath;

  } catch (err) {
    console.error(`\n✗ Error: ${err.message}`);
    process.exit(1);
  }
}

main();
