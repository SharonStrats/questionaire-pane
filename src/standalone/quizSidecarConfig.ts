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

export function getAppServicesEndpoint (options: {
  dev: boolean
  appServicesEndpoint?: string
  legacySidecarEndpoint?: string
}): string | undefined {
  const configuredEndpoint = options.appServicesEndpoint?.trim() || options.legacySidecarEndpoint?.trim()
  return configuredEndpoint || (options.dev ? defaultDevelopmentSidecarEndpoint : undefined)
}
