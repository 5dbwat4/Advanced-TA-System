import type { ForwardRefExoticComponent, SVGProps } from 'react'

export type IconComponent = ForwardRefExoticComponent<SVGProps<SVGSVGElement> & { title?: string }>
