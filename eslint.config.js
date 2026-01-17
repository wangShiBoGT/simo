/**
 * Simo ESLint 配置 (v9 flat config)
 * 
 * 核心规则：防止 AI/LLM 模块触碰硬件/串口
 */

export default [
  {
    ignores: ['dist/**', 'node_modules/**', '**/*.test.cjs', '**/*.test.js']
  },
  {
    files: ['server/**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module'
    },
    rules: {
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      'no-console': 'off'
    }
  },
  // LLM/意图解析模块：禁止导入硬件/串口
  {
    files: [
      'server/intent/intent.parser.js',
      'server/intent/intent.schema.js',
      'server/confirm/confirm.prompt.js',
      'server/confirm/confirm.parse.js',
      'server/confirm/confirm.policy.js'
    ],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [
          { group: ['**/serial*'], message: 'INV-001: AI/解析模块禁止导入串口模块' },
          { group: ['**/hardware*'], message: 'INV-001: AI/解析模块禁止导入硬件模块' }
        ]
      }]
    }
  }
];
