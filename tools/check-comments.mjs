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
]

const RULES = String.raw`[\w@/-]+(\s*,\s*[\w@/-]+)*`
const REASON = String.raw`\s*(--\s[^]*)?$`
const DIRECTIVES = {
  Line: new RegExp(
    String.raw`^\s*(eslint-disable(-next)?-line\s+${RULES}|@ts-(check|nocheck|expect-error|ignore)|\/ <reference \w+="[^"]*" \/>|prettier-ignore)${REASON}`,
  ),
  Block: new RegExp(
    String.raw`^\s*(eslint-disable(-next-line|-line)?\s+${RULES}|eslint-enable(\s+${RULES})?|eslint\s+[\w@/-]+\s*:[^]+|globals?\s+[\w$]+(:\s*\w+)?(\s*,\s*[\w$]+(:\s*\w+)?)*|@ts-(nocheck|expect-error|ignore)|[#@]__PURE__|@vite-ignore|prettier-ignore)${REASON}`,
  ),
}

export function isDirective(kind, body) {
  return DIRECTIVES[kind].test(body) && !body.includes('meridian/no-comments')
}

const HASH = /(?<=^|[\s;&|()])#/g
const SLASH = /(?<![:\\/*])(\/\/|\/\*)/g
const SYNTAXES = [
  { files: /\.sql$/, marker: /--|\/\*/g },
  { files: /\.ya?ml$/, marker: HASH, header: /^# yaml-language-server:.*/ },
  { files: /\.sh$/, marker: HASH, header: /^#!.*/ },
  {
    files: /(^|\/|\.)(Dockerfile|Containerfile)(\.[\w-]+)?$/,
    marker: HASH,
    header: /^(# (syntax|escape|check)=.*(\n|$))*/,
  },
  {
    files:
      /(^|\/)(Caddyfile|\.gitignore|\.dockerignore|\.prettierignore|\.gitattributes)$/,
    marker: HASH,
  },
  { files: /\.css$/, marker: /\/\*/g },
  { files: /\.(html|svg)$/, marker: /<!--/g },
  { files: /(^|\/)tsconfig[\w.]*\.json$/, marker: SLASH },
  {
    files: /\.[cm]?[jt]sx?$/,
    marker: SLASH,
    inline: (marker, body) =>
      isDirective(marker === '//' ? 'Line' : 'Block', body),
  },
  {
    files: /\.go$/,
    marker: SLASH,
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

const blank = (s) => s.replace(/[^\n]/g, ' ')

export function commentLines(file, text) {
  const syntax = SYNTAXES.find(({ files }) => files.test(file))
  if (!syntax) return []
  const code = text.replace(syntax.header ?? /^/, blank).replace(STRING, blank)
  const found = new Set()
  let line = 1
  let from = 0
  for (const match of code.matchAll(syntax.marker)) {
    line += code.slice(from, match.index).split('\n').length - 1
    from = match.index
    const marker = match[0]
    const rest = text.slice(match.index + marker.length)
    const body =
      marker === '/*' ? rest.split('*/', 1)[0] : rest.split('\n', 1)[0]
    if (!syntax.inline?.(marker, body)) found.add(line)
  }
  return [...found]
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
