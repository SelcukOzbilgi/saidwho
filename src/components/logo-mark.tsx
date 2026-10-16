// The logo: a magnifier over two quote marks. The ring and handle take the
// text color and the quote marks the accent, so it follows the theme. The
// same shapes are in src/app/icon.svg.
const QUOTE =
  "M0 0 C4.6 4.6 5.8 9.5 5.8 15.8 C5.8 16.5 5.8 17.2 5.8 17.9 C5.8 18.7 5.8 19.4 5.8 20.1 C5.8 25.3 4.8 28.9 2.4 33.4 C-1.1 36.6 -4.9 38 -9.3 39.8 C-15.4 42.2 -20.4 45.4 -25.6 49.4 C-26.2 49.9 -26.8 50.3 -27.4 50.8 C-36.7 57.9 -44.8 70.9 -47.1 82.3 C-47.5 84.7 -47.8 87 -47.6 89.4 C-45.1 91.9 -43.2 91.9 -39.8 92.3 C-25 94.1 -11.3 99.9 -1.7 111.7 C10.9 128.7 13.7 148.2 11.1 168.8 C8.4 185.3 -0.2 199.4 -13.3 209.6 C-29.2 220.2 -46.6 223.5 -65.4 220.9 C-81.6 217.7 -95 210.4 -105.6 197.4 C-124.1 169.6 -123.2 135.7 -117.1 103.9 C-112.1 80.5 -101.4 58.5 -85.6 40.4 C-84.9 39.6 -84.2 38.8 -83.5 37.9 C-67 18.8 -27 -11.8 0 0Z";

export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="226 196 604 604" aria-hidden="true" focusable="false" className={className}>
      <circle cx="504.1" cy="457.4" r="229.6" fill="none" stroke="currentColor" strokeWidth="59.6" />
      <path d="M657.8 628L783 767" stroke="currentColor" strokeWidth="60" strokeLinecap="round" />
      <path className="fill-accent" transform="translate(480.6 344.6)" d={QUOTE} />
      <path className="fill-accent" transform="translate(626.6 344.6)" d={QUOTE} />
    </svg>
  );
}

// "Said Who?" with the magnifier standing in for the "o". Screen readers get
// the plain name. Size it with the font size of the parent.
export function Wordmark() {
  return (
    <>
      <span className="sr-only">Said Who?</span>
      <span aria-hidden="true">
        Said Wh
        <LogoMark className="-mr-[0.02em] inline-block size-[0.72em] align-[-0.12em]" />
        <span className="text-accent">?</span>
      </span>
    </>
  );
}
