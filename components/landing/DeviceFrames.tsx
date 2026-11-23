import Image from 'next/image'
import { cx } from '@/lib/tw'

/** Aluminum studio-display style frame for the desktop screenshots. */
export function DesktopFrame({ src, alt, stand, className }: { src: string; alt: string; stand?: boolean; className?: string }) {
  return (
    <div className={className}>
      <div className="rounded-[22px] bg-gradient-to-b from-[#f2f4f6] via-[#c9ced4] to-[#8f969e] p-[3px] shadow-[0_30px_70px_rgba(3,12,20,0.55)]">
        <div className="rounded-[19px] bg-[#101214] p-[10px]">
          <div className="relative overflow-hidden rounded-[10px] ring-1 ring-white/10">
            <Image src={src} alt={alt} width={1600} height={801} className="block h-auto w-full" />
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-white/[0.07] via-transparent to-transparent" aria-hidden="true" />
          </div>
        </div>
      </div>
      {stand && (
        <div aria-hidden="true">
          <div className="mx-auto h-9 w-24 bg-gradient-to-b from-[#d7dbe0] to-[#aeb4bb] [clip-path:polygon(14%_0,86%_0,100%_100%,0_100%)]" />
          <div className="mx-auto h-2.5 w-48 rounded-[4px] bg-gradient-to-b from-[#e6e9ec] to-[#b3b9c0] shadow-[0_10px_24px_rgba(3,12,20,0.35)]" />
        </div>
      )}
    </div>
  )
}

/**
 * iPhone 17 Pro styling on a slightly shortened canvas (~1.94:1 body) for a tighter
 * composition; the screenshot sits uncropped at the top and its bottom pixel row is
 * stretched below it, so the app appears to continue past the fold like a real device.
 * Curved edge per device reference: ~13%-of-width continuous corner, hairline 1.36mm
 * bezel (1.9cqw) plus thin titanium rim; all layers concentric, scaled via cqw.
 */
export function PhoneFrame({ src, alt, size = 'sm', className }: { src: string; alt: string; size?: 'sm' | 'md'; className?: string }) {
  const sm = size === 'sm'
  return (
    <div className={cx('[container-type:inline-size]', className)}>
      <div className={cx('relative bg-gradient-to-b from-[#4a4d52] via-[#2b2e33] to-[#1a1c1f] shadow-[0_24px_60px_rgba(3,12,20,0.6)]', 'rounded-[13cqw] p-[0.5cqw]')}>
        <span aria-hidden="true" className={cx('absolute rounded-l-[2px] bg-[#3a3d42]', sm ? '-left-[2px] top-[64px] h-5 w-[2px]' : '-left-[3px] top-[110px] h-8 w-[3px]')} />
        <span aria-hidden="true" className={cx('absolute rounded-l-[2px] bg-[#3a3d42]', sm ? '-left-[2px] top-[92px] h-8 w-[2px]' : '-left-[3px] top-[156px] h-12 w-[3px]')} />
        <span aria-hidden="true" className={cx('absolute rounded-r-[2px] bg-[#3a3d42]', sm ? '-right-[2px] top-[80px] h-10 w-[2px]' : '-right-[3px] top-[140px] h-16 w-[3px]')} />
        <div className={cx('bg-black', 'rounded-[12.5cqw] p-[1.9cqw]')}>
          <div className={cx('relative overflow-hidden bg-[#0b1925]', 'rounded-[10.6cqw]')}>
            <div className={cx('relative flex items-end justify-between text-white', sm ? 'h-[22px] px-3 pb-[3px] text-[7px]' : 'h-[34px] px-5 pb-[5px] text-[10px]')}>
              <span className="font-semibold tracking-tight">9:41</span>
              <span aria-hidden="true" className={cx('absolute left-1/2 -translate-x-1/2 rounded-full bg-black', sm ? 'top-[5px] h-[13px] w-[32%]' : 'top-[8px] h-[22px] w-[32%]')} />
              <span className="flex items-center gap-[3px]" aria-hidden="true">
                <svg viewBox="0 0 16 10" className={sm ? 'h-[6px] w-[9px]' : 'h-[9px] w-[14px]'} fill="currentColor">
                  <rect x="0" y="6" width="3" height="4" rx="0.8" /><rect x="4.3" y="4" width="3" height="6" rx="0.8" /><rect x="8.6" y="2" width="3" height="8" rx="0.8" /><rect x="12.9" y="0" width="3" height="10" rx="0.8" />
                </svg>
                <svg viewBox="0 0 16 12" className={sm ? 'h-[6px] w-[8px]' : 'h-[9px] w-[12px]'} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
                  <path d="M1.5 4.5a10 10 0 0 1 13 0M4 7.2a6.4 6.4 0 0 1 8 0M6.6 9.8a2.8 2.8 0 0 1 2.8 0" /><circle cx="8" cy="11" r="0.9" fill="currentColor" stroke="none" />
                </svg>
                <svg viewBox="0 0 25 12" className={sm ? 'h-[6px] w-[12px]' : 'h-[9px] w-[19px]'} fill="none">
                  <rect x="0.7" y="0.7" width="20" height="10.6" rx="2.6" stroke="currentColor" strokeOpacity="0.5" strokeWidth="1" />
                  <rect x="2.2" y="2.2" width="14" height="7.6" rx="1.4" fill="currentColor" />
                  <path d="M22.6 4v4a2.2 2.2 0 0 0 0-4z" fill="currentColor" fillOpacity="0.5" />
                </svg>
              </span>
            </div>
            <div className="relative aspect-[433/820] w-full">
              <Image src={src} alt={alt} width={433} height={692} className="block h-auto w-full" />
              <div aria-hidden="true" className="absolute inset-x-0 bottom-0 h-[15.8%]">
                <Image src="/landing/mobile-fill.webp" alt="" width={433} height={1} className="block h-full w-full" />
              </div>
              <span aria-hidden="true" className={cx('absolute left-1/2 -translate-x-1/2 rounded-full bg-white/80', sm ? 'bottom-[4px] h-[3px] w-[36%]' : 'bottom-[6px] h-[4px] w-[36%]')} />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}