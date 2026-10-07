import assert from 'node:assert/strict'
import { test } from 'node:test'
import { commentLines, isCommentFree } from './check-comments.mjs'

test('сканер ловить коментар кожного формату, а рядки й директиви пропускає', () => {
  const rule = ['meridian', 'no-comments'].join('/')
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
    ['run.sh', '#!/bin/sh\necho "$#" ${#x};# c\n#!/bin/sh', [2, 3]],
    ['infra/caddy/Caddyfile', ':80 {\n\t# c\n}', [2]],
    ['.gitignore', 'dist/\n# c', [2]],
    ['a.css', 'a {}\n/* c */', [2]],
    ['a.html', "<p>сім'я</p> <!-- c --> <p>м'ясо</p>", [1]],
    [
      'a.mjs',
      "#!/usr/bin/env node\n// @ts-check\nconst u = 'https://a' // c\n/* global x */\n// global x\nf(/* #__PURE__ */ g())\n// eslint-disable-next-line no-x -- причина",
      [3, 5],
    ],
    ['a.ts', `a /* eslint-disable ${rule} */\nconst r = '${rule}'`, [1]],
    ['main.go', '//go:build x\nfunc f() {} // c', [2]],
    ['a.json', '{"a": "# b"}', []],
  ]
  for (const [file, text, lines] of cases) {
    assert.deepEqual(commentLines(file, text), lines, file)
  }
})

test('храповик перевіряє лише чисті теки й обходить винятки', () => {
  const dirs = ['packages/db', 'apps/web']
  assert.equal(isCommentFree('packages/db/migrate.sh', dirs), true)
  assert.equal(isCommentFree('packages/dbx/a.sql', dirs), false)
  assert.equal(isCommentFree('packages/db/migrations/0007_x.sql', dirs), false)
  assert.equal(isCommentFree('packages/db/migrations/0008_x.sql', dirs), true)
  assert.equal(isCommentFree('apps/web/android/a.xml', dirs), false)
  assert.equal(isCommentFree('apps/web/src/routeTree.gen.ts', dirs), false)
  assert.equal(isCommentFree('infra/caddy/Caddyfile'), false)
})
