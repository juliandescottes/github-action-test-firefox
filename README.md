# github-action-test-firefox

A testing framework for Firefox on GitHub CI, designed to profile performance, test features, and validate Firefox builds with custom configurations.

The current version only targets macos workers and has not been tested with other OSes.

Originally forked from https://github.com/tunetheweb/github-action-test.

## Overview

This repository provides a complete setup for running automated Firefox tests on GitHub Actions with:
- Custom Firefox binary support (test CI builds)
- Firefox preferences configuration
- Profiler data collection
- Environment variable control
- macOS system log collection
- Mocha-based test framework with Selenium WebDriver

## Quick Start

```bash
# Install dependencies
npm install

# Start test server
npm run test:server

# Run Firefox tests (in another terminal)
npm run test:e2e:firefox
```

## Using Custom Firefox Builds

### Get Your Firefox CI Build URL

1. Go to Treeherder for your push
2. Click on a build job (e.g., "B" for macOS build)
3. Click "Job Details" tab
4. Find the artifact link (e.g., `public/build/target.dmg`)
5. Construct full URL: `https://firefox-ci-tc.services.mozilla.com/api/queue/v1/task/{TASK_ID}/runs/0/artifacts/public/build/target.dmg`

Or get the URL directly from the Task Inspector link in Treeherder.

### Configure in GitHub Actions

Update `.github/workflows/tests.yml`:

```yaml
env:
  FIREFOX_DOWNLOAD_URL: "https://firefox-ci-tc.services.mozilla.com/api/queue/v1/task/TASK_ID/runs/0/artifacts/public/build/target.dmg"
```

The workflow automatically downloads and uses the custom binary.

**Supported formats**: `.dmg` (macOS), `.tar.bz2` (Linux/Mac)

## Setting Firefox Preferences

Preferences are configured in `config/firefox-prefs.json`. Review and remove any preferences that conflict with your test scenario.

Edit the file to add or change preferences:

```json
{
  "dom.webgpu.enabled": true,
  "javascript.options.wasm": true,
  "browser.cache.disk.enable": false,
  "devtools.debugger.enabled": true
}
```

## Setting Environment Variables

Environment variables are configured in `.github/workflows/tests.yml` under the `env` section:

```yaml
env:
  MOZ_PROFILER_STARTUP_FILTERS: "*"
  MOZ_PROFILER_STARTUP: "1"
  MOZ_PROFILER_SHUTDOWN: "/tmp/profiler.json"
  MOZ_LOG: "timestamp,sync,GMP:5,EME:5,ContentSignatureVerifier:5"
  GECKODRIVER_AUTO_INSTALL: "1"
  FIREFOX_DOWNLOAD_URL: "https://firefox-ci-tc.services.mozilla.com/api/queue/v1/task/TASK_ID/runs/0/artifacts/public/build/target.dmg"
```

## Modifying Tests

Edit `test/test.mjs` to change what the tests do. The current test measures First Contentful Paint (FCP).

Edit `test/index.html` to change the test page content.

## Collecting Profiler Profiles

The profiler is enabled by default in `.github/workflows/tests.yml`:

```yaml
env:
  MOZ_PROFILER_STARTUP: "1"
  MOZ_PROFILER_STARTUP_FILTERS: "*"  # or specific threads: "GeckoMain,Compositor"
  MOZ_PROFILER_SHUTDOWN: "/tmp/profiler.json"
```

### Download and View Profiles

1. Go to your GitHub Actions run and scroll to the bottom
2. Download the `profile.json` artifact
3. Visit https://profiler.firefox.com/ and load the file

## Key Files

- `.github/workflows/tests.yml` - GitHub Actions workflow configuration
- `config/firefox-prefs.json` - Firefox preferences
- `test/test.mjs` - Test suite
- `test/index.html` - Test page

## Artifacts

Available at the bottom of each workflow run:
- `profile.json` - Firefox Profiler data
- `log_show.txt` - macOS system logs
