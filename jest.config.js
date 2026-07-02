/** @type {import('jest').Config} */
module.exports = {
  preset: 'jest-expo',
  testMatch: ['**/__tests__/**/*.test.ts', '**/__tests__/**/*.test.tsx'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1',
  },
  // Вимкнено watchman: у деяких середовищах він не може створити state-каталог
  // (Permission denied) і валить запуск. Jest використає власний crawler.
  watchman: false,
  // jest-expo вже задає transformIgnorePatterns для RN/Expo-модулів
};
