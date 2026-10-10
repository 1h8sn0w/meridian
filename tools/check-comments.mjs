import { execFileSync } from 'node:child_process'
import { readFileSync, realpathSync, statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const COMMENT_FREE_DIRS = []

export const COMMENT_FREE_FILES = [/\.test\.ts$/]

const EXCEPTIONS = [
  /^packages\/db\/migrations\/000[0-7]_/,
  /^apps\/web\/(android|ios)\//,
  /(^|\/)routeTree\.gen\.ts$/,
  /^\.github\/ISSUE_TEMPLATE\//,
]

const RULE = String.raw`[\w@][\w@/-]*`
const RULES = String.raw`${RULE}(\s*,\s*${RULE})*`
const directive = (withReason, plain) =>
  new RegExp(String.raw`^\s*((${withReason})(\s--\s[^]*)?|${plain})\s*$`)
const DIRECTIVES = {
  Line: directive(
    String.raw`eslint-disable(-next)?-line\s+${RULES}|@ts-expect-error`,
    String.raw`@ts-(check|nocheck|ignore)|\/\s*<reference\s[^>]*\/>|prettier-ignore`,
  ),
  Block: directive(
    String.raw`eslint-disable(-next-line|-line)?\s+${RULES}|@ts-expect-error`,
    String.raw`eslint-enable(\s+${RULES})?|globals?\s+[\w$]+(:\s*\w+)?(\s*,\s*[\w$]+(:\s*\w+)?)*|@ts-(nocheck|ignore)|[#@]__PURE__|@vite-ignore|prettier-ignore`,
  ),
}

export function isDirective(kind, body) {
  return DIRECTIVES[kind].test(body) && !body.includes('meridian/no-comments')
}

const HASH = /(?<=^|[\s;&|()])#/g
const SLASH = /(?<![:\\/*])(\/\/|\/\*)/g
const SYNTAXES = [
  { files: /\.sql$/, marker: /--|\/\*/g },
  { files: /\.ya?ml$/, marker: HASH, skip: /^# yaml-language-server:.*/ },
  {
    files: /\.sh$/,
    marker: HASH,
    skip: /^#!.*|<<-?\s*['"]?(\w+)['"]?.*\n[^]*?\n\t*\1(?=\n|$)/g,
  },
  {
    files: /(^|\/|\.)(Dockerfile|Containerfile)(\.[\w-]+)?$/,
    marker: HASH,
    skip: /^(# (syntax|escape|check)=.*(\n|$))*/,
  },
  {
    files:
      /(^|\/)(Caddyfile|\.gitignore|\.dockerignore|\.prettierignore|\.gitattributes)$/,
    marker: HASH,
  },
  { files: /\.css$/, marker: /\/\*/g },
  { files: /\.(html|svg)$/, marker: new RegExp(`<!--|${SLASH.source}`, 'g') },
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

const STRING = /(?<=^|[\s:=(,[{'])('(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*")/gm
const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)))

export function isCommentFree(file, dirs = COMMENT_FREE_DIRS) {
  return (
    (dirs.some((dir) => file === dir || file.startsWith(dir + '/')) ||
      COMMENT_FREE_FILES.some((pattern) => pattern.test(file))) &&
    !EXCEPTIONS.some((re) => re.test(file))
  )
}

const blank = (s) => s.replace(/[^\n]/g, '_')

export function commentLines(file, text) {
  const syntax = SYNTAXES.find(({ files }) => files.test(file))
  if (!syntax) return []
  const code = text.replace(syntax.skip ?? /^/, blank).replace(STRING, blank)
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
    .filter(
      (file) =>
        isCommentFree(file) &&
        SYNTAXES.some(({ files }) => files.test(file)) &&
        statSync(path.join(ROOT, file), { throwIfNoEntry: false })?.isFile(),
    )
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
