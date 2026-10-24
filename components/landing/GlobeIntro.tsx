'use client'

import { useEffect, useRef, useState } from 'react'

// Opening scene of the public landing page: the supplied rotating particle
// globe rising from the bottom of the screen, before the hero. Decorative
// only (no text, links or buttons of its own); the hero and every section
// below it are unchanged.
// - The still image is always painted first and stays as the fallback; the
//   video fades in over it only once a frame is actually playing, so there
//   is never a blank frame or a jump.
// - The globe turns because of the supplied video itself (muted, inline,
//   looping forward at normal speed). Visitors who prefer reduced motion see
//   the still image and the video is never requested.
// - Playback pauses while the scene is off screen, to save battery and data.
export const GLOBE_IMAGE = 'https://d2ol7oe51mr4n9.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/f1631235-0a76-464d-8f1d-2c4b48a997d5.jpg'
export const GLOBE_VIDEO = 'https://d2ol7oe51mr4n9.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/e71aea27-a808-4ae3-8231-a469d49285d4.mp4'

export default function GlobeIntro() {
  const ref = useRef<HTMLElement>(null)
  const video = useRef<HTMLVideoElement>(null)
  // null until known (server render and first paint): image only.
  const [motion, setMotion] = useState<boolean | null>(null)
  const [playing, setPlaying] = useState(false)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    const apply = () => setMotion(!mq.matches)
    apply()
    mq.addEventListener?.('change', apply)
    return () => mq.removeEventListener?.('change', apply)
  }, [])

  // Play only while the scene is on screen.
  useEffect(() => {
    const v = video.current, el = ref.current
    if (!motion || !v || !el || typeof IntersectionObserver === 'undefined') return
    const io = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) v.play().catch(() => { /* autoplay refused: the still image stays */ })
      else v.pause()
    }, { threshold: 0.05 })
    io.observe(el)
    return () => io.disconnect()
  }, [motion])

  const showVideo = motion === true && !failed
  // Muted before any playback starts (required for autoplay on phones).
  useEffect(() => { const v = video.current; if (v) { v.muted = true; v.defaultMuted = true } }, [showVideo])
  return (
    <section ref={ref} className="globe-intro" aria-hidden="true" data-globe-intro data-globe-state={!showVideo ? 'image' : playing ? 'video' : 'loading'}>
      {/* eslint-disable-next-line @next/next/no-img-element -- remote artwork shown as-is; the CSS sizes it */}
      <img src={GLOBE_IMAGE} alt="" className="globe-intro-media" decoding="async" fetchPriority="high" data-globe-image />
      {showVideo && (
        <video ref={video} className={`globe-intro-media globe-intro-video ${playing ? 'is-on' : ''}`} src={GLOBE_VIDEO}
          muted autoPlay loop playsInline preload="auto" disablePictureInPicture disableRemotePlayback tabIndex={-1}
          onPlaying={() => setPlaying(true)} onError={() => { setFailed(true); setPlaying(false) }} data-globe-video />
      )}
      <div className="globe-intro-shade" />
      <div className="globe-intro-cue">
        <span className="globe-intro-mouse"><span /></span>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6" /><path d="m6 4 6 6 6-6" opacity=".5" /></svg>
      </div>
    </section>
  )
}
