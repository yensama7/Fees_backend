import { redirect } from 'next/navigation';
import { getAdminSessionFromCookies } from '@/lib/auth';
import { getAdminDashboardData, getDatabaseUnavailableMessage, isDatabaseConnectionError } from '@/lib/db';
import { assignStudentAction, removeStudentAction, updateClassFeeAction } from './actions';

export default async function AdminDashboardPage({
  searchParams,
}: {
  searchParams: { status?: string };
}) {
  const session = await getAdminSessionFromCookies();
  if (!session) {
    redirect('/admin/login');
  }

  const adminSession = session;

  try {
    const dashboard = await getAdminDashboardData();

    return (
      <main className="page admin-page-shell">
        <section className="card admin-card admin-dashboard">
          <div className="admin-header-row">
            <div>
              <p className="eyebrow">Authenticated admin</p>
              <h1>School Fees Backend Admin</h1>
              <p>Signed in as {adminSession.username}. Use this dashboard to manage fee mappings and student/class records.</p>
            </div>

            <form action="/api/admin/logout" method="post">
              <button type="submit" className="secondary-button">
                Sign out
              </button>
            </form>
          </div>

          {searchParams.status ? <p className="success-banner">{searchParams.status}</p> : null}

          <section className="admin-grid">
            <div className="panel">
              <h2>Update class fee</h2>
              <form action={updateClassFeeAction} className="admin-form-grid compact-form">
                <label>
                  <span>Class code</span>
                  <input name="classId" placeholder="GRADE_5" required />
                </label>
                <label>
                  <span>Fee amount</span>
                  <input name="feeAmount" type="number" min="0" step="1000" placeholder="75000" required />
                </label>
                <button type="submit">Save fee</button>
              </form>
            </div>

            <div className="panel">
              <h2>Assign student to class</h2>
              <form action={assignStudentAction} className="admin-form-grid compact-form">
                <label>
                  <span>Student ID</span>
                  <input name="studentId" placeholder="STD004" required />
                </label>
                <label>
                  <span>First name</span>
                  <input name="firstName" placeholder="Jane" />
                </label>
                <label>
                  <span>Last name</span>
                  <input name="lastName" placeholder="Doe" />
                </label>
                <label>
                  <span>Class code</span>
                  <input name="classId" placeholder="GRADE_5" required />
                </label>
                <button type="submit">Assign student</button>
              </form>
            </div>

            <div className="panel">
              <h2>Remove student from class</h2>
              <form action={removeStudentAction} className="admin-form-grid compact-form">
                <label>
                  <span>Student ID</span>
                  <input name="studentId" placeholder="STD001" required />
                </label>
                <label>
                  <span>Class code</span>
                  <input name="classId" placeholder="GRADE_5" required />
                </label>
                <button type="submit">Remove student</button>
              </form>
            </div>
          </section>

          <section className="panel">
            <h2>Classes</h2>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Class code</th>
                    <th>Class name</th>
                    <th>Fee amount</th>
                    <th>Students</th>
                  </tr>
                </thead>
                <tbody>
                  {dashboard.classes.map((classRow) => (
                    <tr key={classRow.classCode}>
                      <td>{classRow.classCode}</td>
                      <td>{classRow.className}</td>
                      <td>{classRow.feeDisplay}</td>
                      <td>{classRow.studentCount}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="panel">
            <h2>Students</h2>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Student ID</th>
                    <th>Name</th>
                    <th>Class</th>
                    <th>Fee</th>
                  </tr>
                </thead>
                <tbody>
                  {dashboard.students.map((student) => (
                    <tr key={student.studentId}>
                      <td>{student.studentId}</td>
                      <td>{student.fullName}</td>
                      <td>{student.className ?? 'Unassigned'}</td>
                      <td>{student.feeDisplay}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </section>
      </main>
    );
  } catch (error) {
    const message = isDatabaseConnectionError(error)
      ? getDatabaseUnavailableMessage()
      : error instanceof Error
        ? error.message
        : 'Unknown error';

    return (
      <main className="page admin-page-shell">
        <section className="card admin-card admin-dashboard">
          <div className="admin-header-row">
            <div>
              <p className="eyebrow">Authenticated admin</p>
              <h1>School Fees Backend Admin</h1>
              <p>Signed in as {adminSession.username}. The admin UI is ready, but the database is not reachable yet.</p>
            </div>

            <form action="/api/admin/logout" method="post">
              <button type="submit" className="secondary-button">
                Sign out
              </button>
            </form>
          </div>

          <p className="error-banner">{message}</p>

          <section className="panel">
            <h2>How to fix it</h2>
            <ol>
              <li>Make sure the app can create and write to your SQLite database file path.</li>
              <li>Update your <code>.env.local</code> if you want the database stored somewhere other than <code>./data/fees.sqlite</code>.</li>
              <li>Refresh this page after fixing the file path or permissions.</li>
            </ol>
          </section>
        </section>
      </main>
    );
  }
}
