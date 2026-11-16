export const accountRegistrationUrl = 'https://sharonsolidosplayground.com/.account/login/password/register/'

export function getStandaloneLoginIssuer (
  location: Pick<Location, 'hostname' | 'port' | 'origin'>,
  currentIssuer: string | null,
  configuredIssuer?: string
): string | undefined {
  const defaultIssuer = location.hostname === 'quiz.sharonsolidosplayground.com'
    ? 'https://sharonsolidosplayground.com'
    : location.hostname === 'localhost' && location.port === '4200'
      ? 'http://localhost:3100'
      : undefined
  if (!defaultIssuer) return undefined
  if (currentIssuer && currentIssuer.replace(/\/+$/, '') !== location.origin) return currentIssuer
  return configuredIssuer?.trim() || defaultIssuer
}
