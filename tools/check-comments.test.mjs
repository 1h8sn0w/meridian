import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { noComments } from '../eslint.config.base.mjs'
import { commentLines, isCommentFree } from './check-comments.mjs'

const rule = ['meridian', 'no-comments'].join('/')

test('сканер ловить коментар кожного формату, а рядки й директиви пропускає', () => {
  const cases = [
    ['a.sql', "select 'it''s -- x';\n-- c\nselect 1; /* d */", [2, 3]],
    [
      'a.yaml',
      "# yaml-language-server: $schema=x\nurl: http://a/#b\nq: 'a # b'\nk: сім'я # м'ясо\n# yaml-language-server: x",
      [4, 5],
    ],
    [
      'infra/web.Dockerfile',
      '# syntax=docker/dockerfile:1\n# check=skip=x\nFROM a\n# syntax=b',
      [4],
    ],
    ['Dockerfile.dev', '# c', [1]],
    [
      'run.sh',
      '#!/bin/sh\n#! x\necho "$#" ${#x};# c\nx="a"#b\ncat <<\'EOF\'\n# не коментар\nEOF\n# c',
      [2, 3, 8],
    ],
    ['infra/caddy/Caddyfile', ':80 {\n\t# c\n}', [2]],
    ['.gitignore', 'dist/\n# c', [2]],
    ['a.css', 'a {}\n/* c */', [2]],
    ['a.html', "<p>сім'я</p> <!-- c --> <p>м'ясо</p>", [1]],
    ['a.html', '<script>\n// c\n</script>\n<style>/* d */</style>', [2, 4]],
    [
      'a.mjs',
      "#!/usr/bin/env node\n// @ts-check\nconst u = 'https://a' // c\n/* global x */\n// global x\nf(/* #__PURE__ */ g())\n// eslint-disable-next-line no-x -- причина\nx = 1/* c */\n// eslint-disable-line this is prose\nq = '\\'' // c\n// @ts-ignore -- prose\n// eslint-disable-next-line -- -- prose",
      [3, 5, 8, 9, 10, 11, 12],
    ],
    [
      'a.tsx',
      '/// <reference types="vite/client" />\n// @ts-expect-error -- причина\n// eslint-disable-next-line\n<p>{/* c */}</p>\n///<reference path="x"/>',
      [3, 4],
    ],
    [
      'a.ts',
      'a /* eslint-disable ' +
        rule +
        " */\nconst r = '" +
        rule +
        "'\n/* eslint-disable\n  " +
        rule +
        ' */\n/* eslint ' +
        rule +
        ': off */',
      [1, 3, 5],
    ],
    ['main.go', '//go:build x\nfunc f() {} // c\nx:=1// c', [2, 3]],
    ['a.json', '{"a": "# b"}', []],
    [
      'tsconfig.build.json',
      '{\n  // c\n  "paths": { "@/*": ["./src/*"] }\n}',
      [2],
    ],
  ]
  for (const [file, text, lines] of cases) {
    assert.deepEqual(commentLines(file, text), lines, file)
  }
})

test('ESLint-правило пропускає ті самі директиви, що й сканер', () => {
  const { Linter } = createRequire(
    new URL('../packages/core/package.json', import.meta.url),
  )('eslint')
  const linter = new Linter({
    cwd: fileURLToPath(new URL('..', import.meta.url)),
  })
  const config = [
    {
      plugins: { meridian: { rules: { 'no-comments': noComments } } },
      rules: { [rule]: 'error' },
    },
  ]
  const code =
    '#!/usr/bin/env node\n// c\n/// <reference types="x" />\nf(/* #__PURE__ */ g()) /* d */'
  const lines = linter
    .verify(code, config, { filename: 'tools/a.js' })
    .map((message) => message.line)
  assert.deepEqual(lines, [2, 4])
  assert.deepEqual(
    linter.verify('// c', config, { filename: 'apps/web/android/a.js' }),
    [],
  )
})

test('храповик перевіряє будь-який файл репозиторію, крім винятків', () => {
  for (const file of [
    'packages/db/migrate.sh',
    'packages/db/migrations/0008_x.sql',
    'packages/core/src/generator.ts',
    'packages/core/src/generator.test.ts',
    'apps/web/src/lib/data/model.ts',
    'new-folder/a.ts',
    '.github/workflows/ci.yml',
    'compose.yaml',
  ]) {
    assert.equal(isCommentFree(file), true, file)
  }
  for (const file of [
    'packages/db/migrations/0007_x.sql',
    'apps/web/android/a.xml',
    'apps/web/ios/App/a.swift',
    'apps/web/src/routeTree.gen.ts',
    '.github/ISSUE_TEMPLATE/bug.yml',
  ]) {
    assert.equal(isCommentFree(file), false, file)
  }
  for (const file of [
    'apps/web/.env.example',
    '.github/PULL_REQUEST_TEMPLATE.md',
  ]) {
    assert.deepEqual(commentLines(file, '# c\n<!-- c -->'), [], file)
  }
})
