import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const COMMENT_FREE_DIRS = []

const EXCEPTIONS = [
  /^packages\/db\/migrations\/000[0-7]_/,
  /^apps\/web\/(android|ios)\//,
  /(^|\/)routeTree\.gen\.ts$/,
  /^\.github\/ISSUE_TEMPLATE\//,
  /^\.github\/PULL_REQUEST_TEMPLATE\.md$/,
  /(^|\/)\.env\.example$/,
]

const HASH = /(?<=^|[ \t])#/gm
const SYNTAXES = [
  [/\.sql$/, /--|\/\*/g],
  [/(\.ya?ml|\.sh|(^|\/)Caddyfile|(^|\/|\.)Dockerfile)$/, HASH],
  [/\.css$/, /\/\*/g],
  [/\.html$/, /<!--/g],
]
const ALLOWED = /^(#!|# yaml-language-server:|# syntax=)/

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)))

export function isCommentFree(file, dirs = COMMENT_FREE_DIRS) {
  return (
    dirs.some((dir) => file === dir || file.startsWith(dir + '/')) &&
    !EXCEPTIONS.some((re) => re.test(file))
  )
}

export function commentLines(file, text) {
  const syntax = SYNTAXES.find(([name]) => name.test(file))?.[1]
  if (!syntax) return []
  const code = text.replace(/'[^'\n]*'|"[^"\n]*"/g, (s) => ' '.repeat(s.length))
  const lines = new Set()
  for (const match of code.matchAll(syntax)) {
    const line = code.slice(0, match.index).split('\n').length
    const rest = text.slice(match.index).split('\n', 1)[0]
    if (!ALLOWED.test(rest) || (rest.startsWith('#!') && line !== 1)) {
      lines.add(line)
    }
  }
  return [...lines]
}

export function relativeToRoot(file) {
  return path.relative(ROOT, file).split(path.sep).join('/')
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const found = execFileSync(
    'git',
    ['ls-files', '-z', '--cached', '--others', '--exclude-standard'],
    {
      cwd: ROOT,
      encoding: 'utf8',
    },
  )
    .split('\0')
    .filter((file) => isCommentFree(file) && existsSync(path.join(ROOT, file)))
    .flatMap((file) =>
      commentLines(file, readFileSync(path.join(ROOT, file), 'utf8')).map(
        (line) => `${file}:${line}`,
      ),
    )
  if (found.length) {
    console.error(
      `Коментар у теці без коментарів (tools/README.md):\n${found.join('\n')}`,
    )
    process.exitCode = 1
  }
}
