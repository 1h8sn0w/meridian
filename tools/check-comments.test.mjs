import assert from 'node:assert/strict'
import { test } from 'node:test'
import { commentLines, isCommentFree } from './check-comments.mjs'

test('сканер ловить коментар кожного формату, а рядки й директиви пропускає', () => {
  assert.deepEqual(
    commentLines('a.sql', "select '--x';\n-- c\nselect 1; /* d */"),
    [2, 3],
  )
  assert.deepEqual(
    commentLines(
      'a.yaml',
      "# yaml-language-server: $schema=x\nurl: http://a/#b\nq: 'a # b'\nk: v # c",
    ),
    [4],
  )
  assert.deepEqual(
    commentLines('infra/web.Dockerfile', '# syntax=docker/dockerfile:1\n# c'),
    [2],
  )
  assert.deepEqual(
    commentLines('run.sh', '#!/bin/sh\necho "$#" ${#x}\n#!/bin/sh'),
    [3],
  )
  assert.deepEqual(
    commentLines('infra/caddy/Caddyfile', ':80 {\n\t# c\n}'),
    [2],
  )
  assert.deepEqual(commentLines('a.css', 'a {}\n/* c */'), [2])
  assert.deepEqual(commentLines('a.html', '<p>\n<!-- c --></p>'), [2])
  assert.deepEqual(commentLines('a.go', '// c'), [])
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
