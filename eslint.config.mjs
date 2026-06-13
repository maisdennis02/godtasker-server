import globals from 'globals';

export default [
  {
    files: ['src/**/*.js'],
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: 'module',
      globals: {
        ...globals.node,
      },
    },
    rules: {
      'no-unused-vars': ['error', { argsIgnorePattern: '^(_|next$)' }],
      'no-console': 'off',
      'no-param-reassign': 'off',
    },
  },
  {
    files: ['src/database/migrations/**/*.js', '.sequelizerc'],
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: 'commonjs',
      globals: {
        ...globals.node,
      },
    },
    rules: {
      // sequelize-cli generates `down: (queryInterface, Sequelize) => …` even
      // when the down doesn't use Sequelize — don't flag the convention.
      'no-unused-vars': 'off',
    },
  },
];
