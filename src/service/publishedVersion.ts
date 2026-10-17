export function nextPublishedVersion (versionUris: string[]): string {
  const highestVersion = versionUris.reduce((highest, uri) => {
    const match = uri.match(/\/published\/v(\d+)(?:\/|$)/)
    if (!match) {
      return highest
    }

    return Math.max(highest, Number(match[1]))
  }, 0)

  return `v${highestVersion + 1}`
}
