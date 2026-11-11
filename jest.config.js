module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['**/tests/**/*.test.ts'],
  verbose: true,
  testPathIgnorePatterns: process.env.RUN_DB_TESTS === '1' ? [] : ['/tests/database/'],

};
