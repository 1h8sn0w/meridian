import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, realpathSync } from 'node:fs'
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

export const JS_DIRECTIVES = {
  Line: /^\s*(eslint-disable-(next-)?line|@ts-(check|nocheck|expect-error|ignore)|\/ <reference|prettier-ignore)(\s|$)/,
  Block:
    /^\s*(eslint-(disable|enable)(-(next-)?line)?|eslint|globals?|@ts-(nocheck|expect-error|ignore)|[#@]__PURE__|@vite-ignore|prettier-ignore)(\s|$)/,
}

const HASH = /(?<=^|[\s;&|()])#/g
const SYNTAXES = [
  { files: /\.sql$/, marker: /--|\/\*/g },
  { files: /\.ya?ml$/, marker: HASH, header: /^# yaml-language-server:/ },
  { files: /\.sh$/, marker: HASH, header: /^#!/ },
  {
    files: /(^|\/|\.)(Dockerfile|Containerfile)(\.[\w-]+)?$/,
    marker: HASH,
    header: /^# (syntax|escape|check)=/,
  },
  {
    files:
      /(^|\/)(Caddyfile|\.gitignore|\.dockerignore|\.prettierignore|\.gitattributes)$/,
    marker: HASH,
  },
  { files: /\.css$/, marker: /\/\*/g },
  { files: /\.(html|svg)$/, marker: /<!--/g },
  {
    files: /\.[cm]?js$/,
    marker: /(?<=^|[\s;,(){}[\]])(\/\/|\/\*)/g,
    inline: (marker, body) =>
      JS_DIRECTIVES[marker === '//' ? 'Line' : 'Block'].test(body),
  },
  {
    files: /\.go$/,
    marker: /(?<=^|\s)(\/\/|\/\*)/g,
    inline: (marker, body) => marker === '//' && /^go:\S/.test(body),
  },
]

const STRING = /(?<=^|[\s:=(,[{'])('[^'\n]*'|"[^"\n]*")/gm
const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)))

export function isCommentFree(file, dirs = COMMENT_FREE_DIRS) {
  return (
    dirs.some((dir) => file === dir || file.startsWith(dir + '/')) &&
    !EXCEPTIONS.some((re) => re.test(file))
  )
}

function headerLength(lines, header) {
  const end = header ? lines.findIndex((line) => !header.test(line)) : 0
  return end < 0 ? lines.length : end
}

export function commentLines(file, text) {
  const lines = text.split('\n')
  const found = new Set()
  if (/\.[cm]?[jt]sx?$/.test(file)) {
    lines.forEach((line, i) => {
      if (/eslint-disable.*meridian\/no-comments/.test(line)) found.add(i + 1)
    })
  }
  const syntax = SYNTAXES.find(({ files }) => files.test(file))
  if (!syntax) return [...found]
  const header = headerLength(lines, syntax.header)
  const code = text.replace(STRING, (s) => ' '.repeat(s.length))
  let line = 1
  let from = 0
  for (const match of code.matchAll(syntax.marker)) {
    line += code.slice(from, match.index).split('\n').length - 1
    from = match.index
    const marker = match[0]
    const rest = text.slice(match.index + marker.length)
    const body =
      marker === '/*' ? rest.split('*/', 1)[0] : rest.split('\n', 1)[0]
    if (line > header && !syntax.inline?.(marker, body)) found.add(line)
  }
  return [...found].sort((a, b) => a - b)
}

export function relativeToRoot(file) {
  return path.relative(ROOT, file).split(path.sep).join('/')
}

if (
  process.argv[1] &&
  realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const found = execFileSync(
    'git',
    ['ls-files', '-z', '--cached', '--others', '--exclude-standard'],
    { cwd: ROOT, encoding: 'utf8' },
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
