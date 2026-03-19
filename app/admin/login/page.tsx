import Link from 'next/link';

export default function AdminLoginPage({
  searchParams,
}: {
  searchParams: { error?: string; next?: string };
}) {
  const error = searchParams.error;
  const next = searchParams.next?.startsWith('/admin') ? searchParams.next : '/admin';

  return (
    <main className="page">
      <section className="card admin-card">
        <p className="eyebrow">Secure admin access</p>
        <h1>Backend Admin Login</h1>
        <p>
          Sign in to manage classes, students, and fee mappings. The login cookie is signed, HTTP-only, same-site
          strict, and protected by rate limiting.
        </p>

        {error ? <p className="error-banner">{error}</p> : null}

        <form action="/api/admin/login" method="post" className="admin-form-grid">
          <input type="hidden" name="next" value={next} />

          <label>
            <span>Username</span>
            <input name="username" type="text" autoComplete="username" defaultValue="admin" required />
          </label>

          <label>
            <span>Password</span>
            <input name="password" type="password" autoComplete="current-password" defaultValue="admin" required />
          </label>

          <button type="submit">Sign in</button>
        </form>

        <div className="note-box">
          <strong>Testing credentials</strong>
          <span>Username: admin</span>
          <span>Password: admin</span>
        </div>

        <Link href="/" className="text-link">
          Back to API overview
        </Link>
      </section>
    </main>
  );
}
