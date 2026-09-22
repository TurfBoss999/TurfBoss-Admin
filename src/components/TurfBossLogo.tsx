interface TurfBossLogoProps {
  className?: string;
}

// The source mark is black on transparent, which disappears on the dark
// sidebar/login backgrounds. Rendered as a mask instead of an <img> so it
// takes a solid color (white, matching the wordmark it replaces) rather
// than showing invisible black pixels there.
export function TurfBossLogo({ className = 'h-8' }: TurfBossLogoProps) {
  return (
    <span
      role="img"
      aria-label="TurfBoss"
      className={`inline-block bg-white ${className}`}
      style={{
        aspectRatio: '709 / 121',
        WebkitMaskImage: 'url(/turfboss-logo.webp)',
        maskImage: 'url(/turfboss-logo.webp)',
        WebkitMaskSize: 'contain',
        maskSize: 'contain',
        WebkitMaskRepeat: 'no-repeat',
        maskRepeat: 'no-repeat',
        WebkitMaskPosition: 'center',
        maskPosition: 'center',
      }}
    />
  );
}
