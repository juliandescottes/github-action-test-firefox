import assert from 'assert';
import { FirefoxDriver } from '../lib/webdriver-helper.mjs';

let driver;

describe('tests', function () {
  // Initialize driver before all tests
  before(async function () {
    driver = new FirefoxDriver({
      firefoxBinary: process.env.FIREFOX_BINARY, // Optional custom binary
      baseUrl: 'http://localhost:9090',
    });

    await driver.build();
    console.log('Firefox driver initialized');
  });

  // Clean up driver after all tests
  after(async function () {
    if (driver) {
      await driver.quit();
      console.log('Firefox driver closed');
    }
  });

  // Navigate to blank page before each test
  beforeEach(async function () {
    await driver.url('about:blank');
  });

  // Run 3 FCP measurement tests
  for (let i = 1; i <= 3; i++) {
    it('test ' + i, async function () {
      await driver.url('/index.html');

      // Pause to make sure page has painted
      await driver.pause(2500);

      const output = await driver.$('#output');
      const fcpEntry = JSON.parse(await output.getText());

      console.log('Test ' + i + ' FCP entry:', fcpEntry);
      assert(fcpEntry.startTime < 1000);
    });
  }
});
