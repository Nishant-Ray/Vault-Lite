export default function PageLoading({ title, message = 'Loading your page…' }: { title?: string; message?: string }) {
  return (
    <div>
      {title && <h1 className="page-title mb-6">{title}</h1>}
      <div role="status" aria-live="polite" className="flex min-h-64 flex-col items-center justify-center gap-4 py-12">
        <span aria-hidden="true" className="h-9 w-9 rounded-full border-4 border-gray-200 border-t-primary motion-safe:animate-spin" />
        <p className="text-sm text-off_gray">{message}</p>
      </div>
    </div>
  );
}
