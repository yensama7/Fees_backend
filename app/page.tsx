const endpoints = [
  {
    method: 'GET',
    path: '/api/health',
    purpose: 'Check database connectivity and schema readiness.',
  },
  {
    method: 'GET',
    path: '/api/students/:studentId',
    purpose: 'Fetch a single student with class and fee details for the payment form.',
  },
  {
    method: 'POST',
    path: '/api/payments/lookup',
    purpose: 'Resolve multiple student IDs into payable fee rows and a total amount.',
  },
  {
    method: 'GET',
    path: '/api/classes/:classId/students',
    purpose: 'List students in a class.',
  },
  {
    method: 'POST',
    path: '/api/classes/:classId/students',
    purpose: 'Add a student to a class or create one directly in that class.',
  },
  {
    method: 'DELETE',
    path: '/api/classes/:classId/students?studentId=STD001',
    purpose: 'Remove a student from a class.',
  },
  {
    method: 'PUT',
    path: '/api/classes/:classId/fees',
    purpose: 'Map or update the fee amount attached to a class.',
  },
  {
    method: 'UI',
    path: '/admin/login',
    purpose: 'Protected admin login and dashboard for managing fees and student/class assignments.',
  },
];

export default function HomePage() {
  return (
    <main className="page">
      <section className="card">
        <p className="eyebrow">Backend ready</p>
        <h1>School Fees Payment API</h1>
        <p>
          This development version uses a local SQLite database file, similar to Django&apos;s default development
          database setup, so you do not need to run a separate database server.
        </p>

        <h2>Available endpoints</h2>
        <ul className="endpoint-list">
          {endpoints.map((endpoint) => (
            <li key={`${endpoint.method}-${endpoint.path}`}>
              <strong>
                {endpoint.method} {endpoint.path}
              </strong>
              <span>{endpoint.purpose}</span>
            </li>
          ))}
        </ul>

        <h2>Expected frontend flow</h2>
        <ol>
          <li>Call the lookup endpoint with one or more student IDs from the payment form.</li>
          <li>Render the returned student cards with their class labels and fee amounts.</li>
          <li>Display the provided total fee amount in the checkout summary.</li>
        </ol>
      </section>
    </main>
  );
}
