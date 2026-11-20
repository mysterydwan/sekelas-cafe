'use client'

// Product images: plain <img> (external OSS urls), onError -> caramel gradient
// placeholder with the product initial. Logo is never cropped — only products.
import { useState } from 'react'
import { cn } from '@/lib/utils'

export function ProductImage({
  src,
  name,
  className,
  alt,
}: {
  src: string | null
  name: string
  className?: string
  alt?: string
}) {
  const [failed, setFailed] = useState(false)

  if (!src || failed) {
    return (
      <div
        aria-hidden="true"
        className={cn(
          'flex items-center justify-center bg-gradient-to-br from-caramel-pale via-caramel-light to-caramel text-espresso-deep',
          className
        )}
      >
        <span className="font-display text-3xl font-semibold drop-shadow-sm">
          {(name.trim().charAt(0) || 'S').toUpperCase()}
        </span>
      </div>
    )
  }

  return (
    <img
      src={src}
      alt={alt ?? name}
      className={className}
      loading="lazy"
      onError={() => setFailed(true)}
    />
  )
}
