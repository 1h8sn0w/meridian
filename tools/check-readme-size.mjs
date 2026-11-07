import { isMain, readRepoFile, repoFiles } from './check-comments.mjs'

export const README_LIMIT = 12000

export function isReadme(file) {
  return /(^|\/)README\.md$/.test(file)
}

export function oversizedReadmes(files, read) {
  return files
    .filter(isReadme)
    .map((file) => ({ file, size: [...read(file)].length }))
    .filter(({ size }) => size > README_LIMIT)
}

if (isMain(import.meta.url)) {
  const found = oversizedReadmes(repoFiles(isReadme), readRepoFile)
  if (found.length) {
    console.error(
      `README понад ${README_LIMIT} символів (tools/README.md):\n` +
        found.map(({ file, size }) => `${file}: ${size}`).join('\n'),
    )
    process.exitCode = 1
  }
}
