const defaultDevelopmentSidecarEndpoint = 'http://localhost:5001'

export function getDevelopmentSidecarEndpoint (options: {
  dev: boolean
  configuredEndpoint?: string
}): string | undefined {
  if (!options.dev) {
    return undefined
  }
  return options.configuredEndpoint?.trim() || defaultDevelopmentSidecarEndpoint
}
