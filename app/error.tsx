'use client';
export default function ErrorPage({ reset }: { reset: () => void }) {
  return <main className="grid min-h-dvh place-items-center p-6"><div><h1 className="page-title">Something went wrong</h1><p className="my-4 text-off_gray">Please try again. Your saved data is in Firebase.</p><button className="btn" onClick={reset}>Try again</button></div></main>;
}
