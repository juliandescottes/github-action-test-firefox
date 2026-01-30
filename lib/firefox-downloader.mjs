import { createWriteStream, existsSync, mkdirSync, chmodSync, readFileSync, writeFileSync } from 'fs';
import { join, basename } from 'path';
import { pipeline } from 'stream/promises';
import { createHash } from 'crypto';
import fetch from 'node-fetch';
import * as tar from 'tar';
import { tmpdir } from 'os';
import { readdir } from 'fs/promises';

/**
 * Downloads and extracts Firefox binary from a URL
 *
 * @param {string} url - URL to Firefox archive (.tar.bz2, .tar.gz, or .dmg)
 * @param {Object} options - Options for download
 * @param {string} options.cacheDir - Directory to cache downloads (default: OS temp dir)
 * @param {boolean} options.forceDownload - Force re-download even if cached (default: false)
 * @returns {Promise<{binaryPath: string, version: string, extractPath: string}>}
 */
export async function downloadFirefox(url, options = {}) {
  const { cacheDir = join(tmpdir(), 'firefox-downloads'), forceDownload = false } = options;

  // Create cache directory if it doesn't exist
  if (!existsSync(cacheDir)) {
    mkdirSync(cacheDir, { recursive: true });
  }

  // Generate a unique identifier for this URL
  const urlHash = createHash('md5').update(url).digest('hex');
  const cacheFile = join(cacheDir, `${urlHash}.json`);

  // Check if we have a cached download
  if (!forceDownload && existsSync(cacheFile)) {
    try {
      const cached = JSON.parse(readFileSync(cacheFile, 'utf8'));
      if (existsSync(cached.binaryPath)) {
        console.log(`Using cached Firefox binary from: ${cached.binaryPath}`);
        return cached;
      }
    } catch (err) {
      console.warn('Failed to read cache file, re-downloading...', err.message);
    }
  }

  console.log(`Downloading Firefox from: ${url}`);

  // Download the archive
  const archiveName = basename(url).split('?')[0]; // Remove query params
  const downloadPath = join(cacheDir, archiveName);

  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to download Firefox: ${response.status} ${response.statusText}`);
    }

    await pipeline(response.body, createWriteStream(downloadPath));
    console.log(`Downloaded to: ${downloadPath}`);
  } catch (err) {
    throw new Error(`Failed to download Firefox from ${url}: ${err.message}`);
  }

  // Extract the archive
  const extractDir = join(cacheDir, `firefox-${urlHash}`);
  if (!existsSync(extractDir)) {
    mkdirSync(extractDir, { recursive: true });
  }

  console.log(`Extracting to: ${extractDir}`);

  try {
    if (downloadPath.endsWith('.tar.bz2')) {
      await tar.extract({
        file: downloadPath,
        cwd: extractDir,
      });
    } else if (downloadPath.endsWith('.tar.gz')) {
      await tar.extract({
        file: downloadPath,
        cwd: extractDir,
      });
    } else if (downloadPath.endsWith('.dmg')) {
      // Handle macOS .dmg files
      await extractDmg(downloadPath, extractDir);
    } else {
      throw new Error(`Unsupported archive format: ${downloadPath}`);
    }
  } catch (err) {
    throw new Error(`Failed to extract Firefox archive: ${err.message}`);
  }

  // Find the Firefox binary
  const binaryPath = await findFirefoxBinary(extractDir);

  if (!binaryPath) {
    throw new Error(`Could not find Firefox binary in extracted archive at ${extractDir}`);
  }

  // Make binary executable
  try {
    chmodSync(binaryPath, 0o755);
  } catch (err) {
    console.warn(`Warning: Failed to make binary executable: ${err.message}`);
  }

  // Try to determine Firefox version
  const version = await getFirefoxVersion(binaryPath) || 'unknown';

  const result = {
    binaryPath,
    version,
    extractPath: extractDir,
  };

  // Cache the result
  writeFileSync(cacheFile, JSON.stringify(result, null, 2));
  console.log(`Firefox binary ready at: ${binaryPath}`);

  return result;
}

/**
 * Find Firefox binary in extracted directory
 * Handles both macOS (.app bundle) and Linux (firefox directory) structures
 *
 * @param {string} extractDir - Directory containing extracted Firefox
 * @returns {Promise<string|null>} Path to Firefox binary or null
 */
async function findFirefoxBinary(extractDir) {
  const platform = process.platform;

  // macOS: Look for any .app bundle and find executable inside
  if (platform === 'darwin') {
    try {
      const entries = await readdir(extractDir, { withFileTypes: true });

      // Find all .app bundles
      const appBundles = entries.filter(entry =>
        entry.isDirectory() && entry.name.endsWith('.app')
      );

      for (const appBundle of appBundles) {
        const macOSDir = join(extractDir, appBundle.name, 'Contents', 'MacOS');

        if (existsSync(macOSDir)) {
          // Common Firefox executable names
          const executableNames = [
            'firefox',
            'firefox-bin',
            'Firefox Nightly',
            'Firefox Developer Edition',
            'Firefox',
          ];

          // Try known executable names first
          for (const execName of executableNames) {
            const execPath = join(macOSDir, execName);
            if (existsSync(execPath)) {
              return execPath;
            }
          }

          // If none found, take the first executable file in MacOS directory
          try {
            const macOSEntries = await readdir(macOSDir, { withFileTypes: true });
            for (const entry of macOSEntries) {
              if (entry.isFile()) {
                const execPath = join(macOSDir, entry.name);
                return execPath;
              }
            }
          } catch (err) {
            console.warn(`Error reading MacOS directory: ${err.message}`);
          }
        }
      }

      // Also check for nested structures (e.g., firefox/Firefox.app)
      for (const entry of entries) {
        if (entry.isDirectory() && !entry.name.endsWith('.app')) {
          const found = await findFirefoxBinary(join(extractDir, entry.name));
          if (found) {
            return found;
          }
        }
      }
    } catch (err) {
      console.warn(`Error searching for .app bundles: ${err.message}`);
    }
  }

  // Linux: Look for firefox/firefox
  if (platform === 'linux') {
    const linuxPaths = [
      join(extractDir, 'firefox', 'firefox'),
      join(extractDir, 'firefox', 'firefox-bin'),
    ];

    for (const path of linuxPaths) {
      if (existsSync(path)) {
        return path;
      }
    }
  }

  // Fallback: recursively search for firefox binary
  try {
    const entries = await readdir(extractDir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        const found = await findFirefoxBinary(join(extractDir, entry.name));
        if (found) {
          return found;
        }
      }
    }
  } catch (err) {
    console.warn(`Error searching for Firefox binary: ${err.message}`);
  }

  return null;
}

/**
 * Extract a .dmg file on macOS
 * Mounts the DMG, copies the .app bundle (Firefox.app, Firefox Nightly.app, etc.), then unmounts
 *
 * @param {string} dmgPath - Path to .dmg file
 * @param {string} extractDir - Directory to extract to
 * @returns {Promise<void>}
 */
async function extractDmg(dmgPath, extractDir) {
  const { exec } = await import('child_process');
  const { promisify } = await import('util');
  const execAsync = promisify(exec);

  console.log('Mounting DMG...');

  // Mount the DMG
  const { stdout: attachOutput } = await execAsync(`hdiutil attach "${dmgPath}" -nobrowse -noautoopen`);

  // Parse the mount point from hdiutil output
  // Format: /dev/disk4s2          Apple_HFS                       /Volumes/Firefox Nightly
  // The mount point is the last field on the line, can contain spaces
  const mountMatch = attachOutput.match(/\/Volumes\/.+$/m);
  if (!mountMatch) {
    throw new Error('Could not determine DMG mount point');
  }

  const mountPoint = mountMatch[0].trim();
  console.log(`Mounted at: ${mountPoint}`);

  try {
    // Find the .app bundle (could be Firefox.app, Firefox Nightly.app, etc.)
    const { stdout: lsOutput } = await execAsync(`ls "${mountPoint}"`);
    const appBundle = lsOutput.split('\n').find(name => name.endsWith('.app'));

    if (!appBundle) {
      throw new Error('Could not find .app bundle in mounted DMG');
    }

    console.log(`Found app bundle: ${appBundle}`);
    console.log(`Copying ${appBundle}...`);
    await execAsync(`cp -R "${mountPoint}/${appBundle}" "${extractDir}/"`);
    console.log(`${appBundle} copied successfully`);
  } finally {
    // Always unmount the DMG, even if copy fails
    console.log('Unmounting DMG...');
    try {
      await execAsync(`hdiutil detach "${mountPoint}"`);
      console.log('DMG unmounted');
    } catch (err) {
      console.warn(`Warning: Failed to unmount DMG: ${err.message}`);
    }
  }
}

/**
 * Attempt to get Firefox version from binary
 *
 * @param {string} binaryPath - Path to Firefox binary
 * @returns {Promise<string|null>} Version string or null
 */
async function getFirefoxVersion(binaryPath) {
  try {
    const { exec } = await import('child_process');
    const { promisify } = await import('util');
    const execAsync = promisify(exec);

    const { stdout } = await execAsync(`"${binaryPath}" --version`, { timeout: 5000 });
    const match = stdout.match(/Firefox\s+(\S+)/);
    return match ? match[1] : null;
  } catch (err) {
    console.warn(`Could not determine Firefox version: ${err.message}`);
    return null;
  }
}
