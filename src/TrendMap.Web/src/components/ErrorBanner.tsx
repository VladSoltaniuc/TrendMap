export function ErrorBanner({ message }: { message: string }) {
  return (
    <div className="error" role="alert" aria-live="assertive">
      {message}
    </div>
  );
}
