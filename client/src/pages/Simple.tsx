import { Link } from 'react-router-dom';

export function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-8 text-center">
      <h1 className="font-display text-3xl font-bold">Page not found</h1>
      <p className="text-muted">The page you asked for does not exist or has moved.</p>
      <Link to="/" className="font-medium text-brand-700 underline">Go to the home page</Link>
    </div>
  );
}
