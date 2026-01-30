import { Builder, Browser, By, until } from 'selenium-webdriver';
import firefox from 'selenium-webdriver/firefox.js';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * FirefoxDriver - WebDriver BiDi wrapper for Firefox
 * Provides a simplified API similar to WebdriverIO for compatibility
 */
export class FirefoxDriver {
  /**
   * @param {Object} options - Driver configuration
   * @param {string} options.firefoxBinary - Path to custom Firefox binary (optional)
   * @param {Object} options.preferences - Firefox preferences to set (optional)
   * @param {string} options.baseUrl - Base URL for relative navigation (default: http://localhost:9090)
   */
  constructor(options = {}) {
    this.firefoxBinaryPath = options.firefoxBinary || process.env.FIREFOX_BINARY;
    this.baseUrl = options.baseUrl || 'http://localhost:9090';
    this.driver = null;
    this.capabilities = {
      browserName: 'firefox',
    };

    // Load preferences from config file if not provided
    if (options.preferences) {
      this.preferences = options.preferences;
    } else {
      try {
        const prefsPath = join(__dirname, '..', 'config', 'firefox-prefs.json');
        this.preferences = JSON.parse(readFileSync(prefsPath, 'utf8'));
      } catch (err) {
        console.warn('Could not load Firefox preferences from config:', err.message);
        this.preferences = {};
      }
    }
  }

  /**
   * Build and initialize the WebDriver instance
   * @returns {Promise<import('selenium-webdriver').WebDriver>}
   */
  async build() {
    const firefoxOptions = new firefox.Options();

    // Set custom binary if provided
    if (this.firefoxBinaryPath) {
      console.log(`Using custom Firefox binary: ${this.firefoxBinaryPath}`);
      firefoxOptions.setBinary(this.firefoxBinaryPath);
    }

    // Apply Firefox preferences
    Object.entries(this.preferences).forEach(([key, value]) => {
      firefoxOptions.setPreference(key, value);
    });

    // Set page load strategy to 'none' (similar to WebdriverIO behavior)
    firefoxOptions.setPageLoadStrategy('none');

    // Build driver
    this.driver = await new Builder()
      .forBrowser(Browser.FIREFOX)
      .setFirefoxOptions(firefoxOptions)
      .build();

    return this.driver;
  }

  /**
   * Navigate to a URL (supports relative paths with baseUrl)
   * @param {string} urlPath - URL or path to navigate to
   */
  async url(urlPath) {
    const isAbsoluteUrl = urlPath.includes(':');
    const fullUrl = isAbsoluteUrl ? urlPath : this.baseUrl + urlPath;
    await this.driver.get(fullUrl);

    // Wait for URL to match (Firefox pageLoadStrategy: none handling)
    // Similar to the Firefox workaround in the original test
    await this.driver.wait(async () => {
      try {
        const currentUrl = await this.driver.getCurrentUrl();
        return currentUrl.endsWith(urlPath) || currentUrl === fullUrl;
      } catch (err) {
        return false;
      }
    }, 10000, `Timeout waiting for navigation to ${urlPath}`);
  }

  /**
   * Get current URL
   * @returns {Promise<string>}
   */
  async getUrl() {
    return await this.driver.getCurrentUrl();
  }

  /**
   * Pause execution for specified milliseconds
   * @param {number} ms - Milliseconds to pause
   */
  async pause(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Find element by CSS selector
   * Returns an object with WebdriverIO-like methods
   * @param {string} selector - CSS selector
   * @returns {Promise<{getText: () => Promise<string>, click: () => Promise<void>}>}
   */
  async $(selector) {
    const element = await this.driver.findElement(By.css(selector));

    return {
      getText: async () => {
        return await element.getText();
      },
      click: async () => {
        return await element.click();
      },
      getAttribute: async (name) => {
        return await element.getAttribute(name);
      },
      isDisplayed: async () => {
        return await element.isDisplayed();
      },
    };
  }

  /**
   * Find multiple elements by CSS selector
   * @param {string} selector - CSS selector
   * @returns {Promise<Array>}
   */
  async $$(selector) {
    const elements = await this.driver.findElements(By.css(selector));
    return elements.map(el => ({
      getText: async () => await el.getText(),
      click: async () => await el.click(),
      getAttribute: async (name) => await el.getAttribute(name),
      isDisplayed: async () => await el.isDisplayed(),
    }));
  }

  /**
   * Execute JavaScript in the browser
   * @param {string|Function} script - Script to execute
   * @param  {...any} args - Arguments to pass to the script
   * @returns {Promise<any>}
   */
  async execute(script, ...args) {
    return await this.driver.executeScript(script, ...args);
  }

  /**
   * Wait until a condition is met
   * @param {Function} condition - Condition function that returns boolean
   * @param {number} timeout - Timeout in milliseconds (default: 10000)
   * @param {string} message - Optional timeout message
   */
  async waitUntil(condition, timeout = 10000, message = 'Wait condition timed out') {
    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
      try {
        const result = await condition();
        if (result) {
          return true;
        }
      } catch (err) {
        // Continue waiting
      }
      await this.pause(100);
    }

    throw new Error(message);
  }

  /**
   * Clean up and quit the driver
   */
  async quit() {
    if (this.driver) {
      try {
        await this.driver.quit();
      } catch (err) {
        console.warn('Error quitting driver:', err.message);
      }
      this.driver = null;
    }
  }

  /**
   * Get the underlying selenium-webdriver instance
   * For advanced operations not covered by helper methods
   * @returns {import('selenium-webdriver').WebDriver}
   */
  getDriver() {
    return this.driver;
  }
}
