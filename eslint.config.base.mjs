//  @ts-check

import { tanstackConfig } from '@tanstack/eslint-config'
import reactHooks from 'eslint-plugin-react-hooks'
import {
  isCommentFree,
  isDirective,
  relativeToRoot,
} from './tools/check-comments.mjs'

export const noComments = {
  meta: {
    type: 'suggestion',
    messages: {
      comment:
        'Коментар у коді: нюанс — у README.md теки, інваріант — у тест (tools/README.md).',
    },
  },
  create(context) {
    if (!isCommentFree(relativeToRoot(context.filename))) return {}
    return {
      Program() {
        for (const comment of context.sourceCode.getAllComments()) {
          if (
            comment.type !== 'Shebang' &&
            !isDirective(comment.type, comment.value)
          ) {
            context.report({ loc: comment.loc, messageId: 'comment' })
          }
        }
      },
    }
  },
}

export default [
  ...tanstackConfig,
  reactHooks.configs.flat.recommended,
  {
    linterOptions: { reportUnusedDisableDirectives: 'error' },
    plugins: { meridian: { rules: { 'no-comments': noComments } } },
    rules: {
      'meridian/no-comments': 'error',
      'import/no-cycle': 'off',
      'import/order': 'off',
      'sort-imports': 'off',
      '@typescript-eslint/array-type': 'off',
      '@typescript-eslint/require-await': 'off',
      'pnpm/json-enforce-catalog': 'off',
    },
  },
  {
    ignores: ['dist/', 'eslint.config.js'],
  },
]
