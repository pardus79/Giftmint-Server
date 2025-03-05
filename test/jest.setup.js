// Set test environment variables
process.env.NODE_ENV = 'test';
process.env.PORT = '3501'; // Use a different port for testing

// Global test timeout
jest.setTimeout(10000); // 10 seconds

// Silence console output during tests
global.console = {
  ...console,
  log: jest.fn(),      // Mock console.log
  info: jest.fn(),     // Mock console.info
  warn: jest.fn(),     // Mock console.warn
  error: jest.fn()     // Mock console.error (but keep errors for debugging)
};

// Global test teardown
afterAll(async () => {
  // Any global cleanup needed after all tests
});