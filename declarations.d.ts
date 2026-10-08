/// <reference types="unplugin-icons/types/web-components" />

type CSSResultGroup = import('lit').CSSResultGroup

declare module '*.css' {
  const styles: CSSResultGroup
  export default styles
}

declare module '~icons/*'
