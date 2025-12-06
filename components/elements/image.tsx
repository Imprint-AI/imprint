import NextImage from 'next/image'
import { cn } from '@/lib/utils'

export type ImageProps = {
  base64: string
  mediaType: string
  className?: string
  alt?: string
  width?: number
  height?: number
}

export const Image = ({
  base64,
  mediaType,
  alt = '',
  className,
  width,
  height,
  ...props
}: ImageProps) => (
  <NextImage
    {...props}
    alt={alt}
    width={width || 0}
    height={height || 0}
    className={cn('h-auto max-w-full overflow-hidden rounded-md', className)}
    src={`data:${mediaType};base64,${base64}`}
    unoptimized
  />
)
