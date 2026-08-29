module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: 'module',
  },
  plugins: ['@typescript-eslint'],
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'prettier',
  ],
  env: {
    node: true,
    es2022: true,
  },
  ignorePatterns: ['dist', 'node_modules', 'coverage'],
  rules: {
    '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
  },
  overrides: [
    {
      files: ['src/**/*.ts'],
      excludedFiles: ['src/config/**/*.ts'],
      rules: {
        'no-restricted-properties': [
          'error',
          {
            object: 'process',
            property: 'env',
            message:
              'process.env must only be read in src/config/ — see BACKEND_IMPLEMENTATION_PLAN.md §2.1 rule 4.',
          },
        ],
      },
    },
  ],
};
