export type HomeSection = 'mine' | 'shared'

export function navigateHomeSection (current: HomeSection, destination: HomeSection): HomeSection {
  return current === destination ? current : destination
}
