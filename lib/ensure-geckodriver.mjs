import { spawn } from 'child_process';

/**
 * Verify geckodriver is installed and accessible
 * The geckodriver npm package handles installation automatically
 */
async function ensureGeckodriver() {
  console.log('Checking geckodriver installation...');

  try {
    const isInstalled = await checkGeckodriverVersion();
    if (isInstalled) {
      console.log('✓ geckodriver is installed and accessible');
      return true;
    }
  } catch (err) {
    console.error('✗ geckodriver check failed:', err.message);
  }

  console.log('\nIf geckodriver is not found, it will be automatically downloaded');
  console.log('when selenium-webdriver first tries to use it.');
  console.log('\nYou can also set the GECKODRIVER_AUTO_INSTALL=1 environment variable');
  console.log('to force installation during npm install.');

  return false;
}

/**
 * Check if geckodriver is accessible and get version
 * @returns {Promise<boolean>}
 */
function checkGeckodriverVersion() {
  return new Promise((resolve, reject) => {
    const proc = spawn('geckodriver', ['--version'], {
      stdio: 'pipe',
    });

    let output = '';

    proc.stdout.on('data', (data) => {
      output += data.toString();
    });

    proc.stderr.on('data', (data) => {
      output += data.toString();
    });

    proc.on('close', (code) => {
      if (code === 0) {
        const versionMatch = output.match(/geckodriver\s+(\S+)/);
        if (versionMatch) {
          console.log(`Found geckodriver version: ${versionMatch[1]}`);
        }
        resolve(true);
      } else {
        reject(new Error('geckodriver command failed'));
      }
    });

    proc.on('error', (err) => {
      if (err.code === 'ENOENT') {
        reject(new Error('geckodriver not found in PATH'));
      } else {
        reject(err);
      }
    });
  });
}

// Run the check
ensureGeckodriver().catch((err) => {
  console.error('Failed to verify geckodriver:', err.message);
  // Don't fail the postinstall - let the tests discover the issue
  process.exit(0);
});
