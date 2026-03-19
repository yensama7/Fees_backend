import { Pool } from 'pg';

const connectionConfig = {
  host: process.env.POSTGRES_HOST,
  port: Number(process.env.POSTGRES_PORT ?? 5432),
  database: process.env.POSTGRES_DATABASE,
  user: process.env.POSTGRES_USER,
  password: process.env.POSTGRES_PASSWORD,
  ssl: process.env.POSTGRES_SSL === 'false' ? false : { rejectUnauthorized: false },
};

const requiredKeys = ['POSTGRES_HOST', 'POSTGRES_DATABASE', 'POSTGRES_USER', 'POSTGRES_PASSWORD'] as const;

for (const key of requiredKeys) {
  if (!process.env[key]) {
    console.warn(`Missing environment variable: ${key}`);
  }
}

const globalForDb = globalThis as typeof globalThis & {
  feesPool?: Pool;
  schemaPromise?: Promise<void>;
};

export const pool =
  globalForDb.feesPool ??
  new Pool({
    ...connectionConfig,
    max: 10,
  });

if (process.env.NODE_ENV !== 'production') {
  globalForDb.feesPool = pool;
}

const schemaSql = `
CREATE TABLE IF NOT EXISTS classes (
  id SERIAL PRIMARY KEY,
  class_code TEXT NOT NULL UNIQUE,
  class_name TEXT NOT NULL,
  fee_amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS students (
  id SERIAL PRIMARY KEY,
  student_id TEXT NOT NULL UNIQUE,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  class_id INTEGER REFERENCES classes(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS students_class_id_idx ON students(class_id);

INSERT INTO classes (class_code, class_name, fee_amount)
VALUES
  ('GRADE_1', 'Grade 1', 45000),
  ('GRADE_3', 'Grade 3', 60000),
  ('GRADE_5', 'Grade 5', 75000),
  ('GRADE_6', 'Grade 6', 80000)
ON CONFLICT (class_code) DO NOTHING;

INSERT INTO students (student_id, first_name, last_name, class_id)
SELECT seed.student_id, seed.first_name, seed.last_name, classes.id
FROM (
  VALUES
    ('STD001', 'John', 'Adeyemi', 'GRADE_5'),
    ('STD002', 'Ada', 'Okafor', 'GRADE_3'),
    ('STD003', 'Musa', 'Bello', 'GRADE_6')
) AS seed(student_id, first_name, last_name, class_code)
JOIN classes ON classes.class_code = seed.class_code
ON CONFLICT (student_id) DO NOTHING;
`;

export async function ensureSchema(): Promise<void> {
  if (!globalForDb.schemaPromise) {
    globalForDb.schemaPromise = pool.query(schemaSql).then(() => undefined);
  }

  return globalForDb.schemaPromise;
}

export type StudentRecord = {
  student_id: string;
  first_name: string;
  last_name: string;
  class_code: string | null;
  class_name: string | null;
  fee_amount: string | null;
};

export async function getStudentByStudentId(studentId: string): Promise<StudentRecord | null> {
  await ensureSchema();

  const result = await pool.query<StudentRecord>(
    `
      SELECT
        students.student_id,
        students.first_name,
        students.last_name,
        classes.class_code,
        classes.class_name,
        classes.fee_amount::TEXT AS fee_amount
      FROM students
      LEFT JOIN classes ON classes.id = students.class_id
      WHERE students.student_id = $1
    `,
    [studentId],
  );

  return result.rows[0] ?? null;
}

export async function getStudentsByClassId(classId: string) {
  await ensureSchema();

  const result = await pool.query<StudentRecord>(
    `
      SELECT
        students.student_id,
        students.first_name,
        students.last_name,
        classes.class_code,
        classes.class_name,
        classes.fee_amount::TEXT AS fee_amount
      FROM students
      INNER JOIN classes ON classes.id = students.class_id
      WHERE classes.class_code = $1
      ORDER BY students.student_id ASC
    `,
    [classId],
  );

  return result.rows;
}

export async function upsertClassFee(classId: string, feeAmount: number) {
  await ensureSchema();

  const displayName = classId
    .toLowerCase()
    .replaceAll('_', ' ')
    .replace(/\b\w/g, (character) => character.toUpperCase());

  const result = await pool.query(
    `
      INSERT INTO classes (class_code, class_name, fee_amount)
      VALUES ($1, $2, $3)
      ON CONFLICT (class_code)
      DO UPDATE SET fee_amount = EXCLUDED.fee_amount, updated_at = NOW()
      RETURNING class_code, class_name, fee_amount::TEXT AS fee_amount
    `,
    [classId, displayName, feeAmount],
  );

  return result.rows[0];
}

export async function assignStudentToClass(input: {
  classId: string;
  studentId: string;
  firstName?: string;
  lastName?: string;
}) {
  await ensureSchema();

  const classResult = await pool.query<{ id: number }>(`SELECT id FROM classes WHERE class_code = $1`, [input.classId]);
  if (classResult.rowCount === 0) {
    throw new Error(`Class ${input.classId} does not exist. Create or map fees for the class first.`);
  }

  const classPk = classResult.rows[0].id;

  const result = await pool.query<StudentRecord>(
    `
      INSERT INTO students (student_id, first_name, last_name, class_id)
      VALUES ($1, COALESCE($2, 'Unknown'), COALESCE($3, 'Student'), $4)
      ON CONFLICT (student_id)
      DO UPDATE SET
        first_name = COALESCE(EXCLUDED.first_name, students.first_name),
        last_name = COALESCE(EXCLUDED.last_name, students.last_name),
        class_id = EXCLUDED.class_id,
        updated_at = NOW()
      RETURNING
        student_id,
        first_name,
        last_name,
        NULL::TEXT AS class_code,
        NULL::TEXT AS class_name,
        NULL::TEXT AS fee_amount
    `,
    [input.studentId, input.firstName ?? null, input.lastName ?? null, classPk],
  );

  return getStudentByStudentId(result.rows[0].student_id);
}

export async function removeStudentFromClass(classId: string, studentId: string) {
  await ensureSchema();

  const result = await pool.query(
    `
      UPDATE students
      SET class_id = NULL, updated_at = NOW()
      WHERE student_id = $1
        AND class_id = (SELECT id FROM classes WHERE class_code = $2)
      RETURNING student_id
    `,
    [studentId, classId],
  );

  return result.rowCount > 0;
}

export async function lookupPaymentDetails(studentIds: string[]) {
  await ensureSchema();

  const cleanedIds = [...new Set(studentIds.map((studentId) => studentId.trim()).filter(Boolean))];
  if (cleanedIds.length === 0) {
    return {
      students: [],
      totalFee: 0,
      missingStudentIds: [],
    };
  }

  const result = await pool.query<StudentRecord>(
    `
      SELECT
        students.student_id,
        students.first_name,
        students.last_name,
        classes.class_code,
        classes.class_name,
        classes.fee_amount::TEXT AS fee_amount
      FROM students
      LEFT JOIN classes ON classes.id = students.class_id
      WHERE students.student_id = ANY($1::TEXT[])
      ORDER BY students.student_id ASC
    `,
    [cleanedIds],
  );

  const foundIds = new Set(result.rows.map((row: StudentRecord) => row.student_id));
  const totalFee = result.rows.reduce((sum: number, row: StudentRecord) => sum + Number(row.fee_amount ?? 0), 0);

  return {
    students: result.rows,
    totalFee,
    missingStudentIds: cleanedIds.filter((studentId) => !foundIds.has(studentId)),
  };
}

export async function getAdminDashboardData() {
  await ensureSchema();

  const [classesResult, studentsResult] = await Promise.all([
    pool.query<{ class_code: string; class_name: string; fee_amount: string; student_count: string }>(
      `
        SELECT
          classes.class_code,
          classes.class_name,
          classes.fee_amount::TEXT AS fee_amount,
          COUNT(students.id)::TEXT AS student_count
        FROM classes
        LEFT JOIN students ON students.class_id = classes.id
        GROUP BY classes.id
        ORDER BY classes.class_name ASC
      `,
    ),
    pool.query<StudentRecord>(
      `
        SELECT
          students.student_id,
          students.first_name,
          students.last_name,
          classes.class_code,
          classes.class_name,
          classes.fee_amount::TEXT AS fee_amount
        FROM students
        LEFT JOIN classes ON classes.id = students.class_id
        ORDER BY students.student_id ASC
      `,
    ),
  ]);

  const formatter = new Intl.NumberFormat('en-NG', {
    style: 'currency',
    currency: 'NGN',
    maximumFractionDigits: 0,
  });

  return {
    classes: classesResult.rows.map((row: { class_code: string; class_name: string; fee_amount: string; student_count: string }) => ({
      classCode: row.class_code,
      className: row.class_name,
      feeAmount: Number(row.fee_amount),
      feeDisplay: formatter.format(Number(row.fee_amount)),
      studentCount: Number(row.student_count),
    })),
    students: studentsResult.rows.map((student: StudentRecord) => ({
      studentId: student.student_id,
      fullName: `${student.first_name} ${student.last_name}`,
      classCode: student.class_code,
      className: student.class_name,
      feeAmount: Number(student.fee_amount ?? 0),
      feeDisplay: formatter.format(Number(student.fee_amount ?? 0)),
    })),
  };
}
