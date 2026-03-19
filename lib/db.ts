import mysql, { Pool, ResultSetHeader, RowDataPacket } from 'mysql2/promise';

const connectionConfig = {
  host: process.env.MYSQL_HOST ?? '127.0.0.1',
  port: Number(process.env.MYSQL_PORT ?? 3306),
  database: process.env.MYSQL_DATABASE ?? 'fees_backend',
  user: process.env.MYSQL_USER ?? 'root',
  password: process.env.MYSQL_PASSWORD ?? 'password',
};

const globalForDb = globalThis as typeof globalThis & {
  feesPool?: Pool;
  schemaPromise?: Promise<void>;
};

export const pool =
  globalForDb.feesPool ??
  mysql.createPool({
    ...connectionConfig,
    waitForConnections: true,
    connectionLimit: 10,
    namedPlaceholders: false,
  });

if (process.env.NODE_ENV !== 'production') {
  globalForDb.feesPool = pool;
}

const schemaStatements = [
  `
    CREATE TABLE IF NOT EXISTS classes (
      id INT AUTO_INCREMENT PRIMARY KEY,
      class_code VARCHAR(64) NOT NULL UNIQUE,
      class_name VARCHAR(128) NOT NULL,
      fee_amount DECIMAL(12, 2) NOT NULL DEFAULT 0,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB;
  `,
  `
    CREATE TABLE IF NOT EXISTS students (
      id INT AUTO_INCREMENT PRIMARY KEY,
      student_id VARCHAR(64) NOT NULL UNIQUE,
      first_name VARCHAR(128) NOT NULL,
      last_name VARCHAR(128) NOT NULL,
      class_id INT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      CONSTRAINT fk_students_class FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE SET NULL
    ) ENGINE=InnoDB;
  `,
  `
    INSERT IGNORE INTO classes (class_code, class_name, fee_amount)
    VALUES
      ('GRADE_1', 'Grade 1', 45000),
      ('GRADE_3', 'Grade 3', 60000),
      ('GRADE_5', 'Grade 5', 75000),
      ('GRADE_6', 'Grade 6', 80000);
  `,
  `
    INSERT IGNORE INTO students (student_id, first_name, last_name, class_id)
    SELECT seed.student_id, seed.first_name, seed.last_name, classes.id
    FROM (
      SELECT 'STD001' AS student_id, 'John' AS first_name, 'Adeyemi' AS last_name, 'GRADE_5' AS class_code
      UNION ALL
      SELECT 'STD002', 'Ada', 'Okafor', 'GRADE_3'
      UNION ALL
      SELECT 'STD003', 'Musa', 'Bello', 'GRADE_6'
    ) AS seed
    INNER JOIN classes ON classes.class_code = seed.class_code;
  `,
];

export function isDatabaseConnectionError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  const mysqlError = error as Error & { code?: string; errno?: number };
  const message = error.message.toUpperCase();

  return (
    mysqlError.code === 'ECONNREFUSED' ||
    mysqlError.code === 'ENOTFOUND' ||
    mysqlError.code === 'ER_ACCESS_DENIED_ERROR' ||
    mysqlError.code === 'PROTOCOL_CONNECTION_LOST' ||
    mysqlError.errno === 2002 ||
    message.includes('ECONNREFUSED') ||
    message.includes('ENOTFOUND')
  );
}

export function getDatabaseUnavailableMessage() {
  return `MySQL is unavailable. Start your MySQL server and verify MYSQL_HOST=${connectionConfig.host}, MYSQL_PORT=${connectionConfig.port}, MYSQL_DATABASE=${connectionConfig.database}, and MYSQL_USER=${connectionConfig.user}.`;
}

export async function ensureSchema(): Promise<void> {
  if (!globalForDb.schemaPromise) {
    globalForDb.schemaPromise = (async () => {
      try {
        for (const statement of schemaStatements) {
          await pool.query(statement);
        }
      } catch (error) {
        globalForDb.schemaPromise = undefined;
        throw error;
      }
    })();
  }

  return globalForDb.schemaPromise;
}

export type StudentRecord = RowDataPacket & {
  student_id: string;
  first_name: string;
  last_name: string;
  class_code: string | null;
  class_name: string | null;
  fee_amount: string | null;
};

type ClassDashboardRecord = RowDataPacket & {
  class_code: string;
  class_name: string;
  fee_amount: string;
  student_count: number;
};

export async function getStudentByStudentId(studentId: string): Promise<StudentRecord | null> {
  await ensureSchema();

  const [rows] = await pool.query<StudentRecord[]>(
    `
      SELECT
        students.student_id,
        students.first_name,
        students.last_name,
        classes.class_code,
        classes.class_name,
        CAST(classes.fee_amount AS CHAR) AS fee_amount
      FROM students
      LEFT JOIN classes ON classes.id = students.class_id
      WHERE students.student_id = ?
      LIMIT 1
    `,
    [studentId],
  );

  return rows[0] ?? null;
}

export async function getStudentsByClassId(classId: string): Promise<StudentRecord[]> {
  await ensureSchema();

  const [rows] = await pool.query<StudentRecord[]>(
    `
      SELECT
        students.student_id,
        students.first_name,
        students.last_name,
        classes.class_code,
        classes.class_name,
        CAST(classes.fee_amount AS CHAR) AS fee_amount
      FROM students
      INNER JOIN classes ON classes.id = students.class_id
      WHERE classes.class_code = ?
      ORDER BY students.student_id ASC
    `,
    [classId],
  );

  return rows;
}

export async function upsertClassFee(classId: string, feeAmount: number) {
  await ensureSchema();

  const displayName = classId
    .toLowerCase()
    .replaceAll('_', ' ')
    .replace(/\b\w/g, (character) => character.toUpperCase());

  await pool.query(
    `
      INSERT INTO classes (class_code, class_name, fee_amount)
      VALUES (?, ?, ?)
      ON DUPLICATE KEY UPDATE
        class_name = VALUES(class_name),
        fee_amount = VALUES(fee_amount),
        updated_at = CURRENT_TIMESTAMP
    `,
    [classId, displayName, feeAmount],
  );

  const [rows] = await pool.query<RowDataPacket[]>(
    `
      SELECT class_code, class_name, CAST(fee_amount AS CHAR) AS fee_amount
      FROM classes
      WHERE class_code = ?
      LIMIT 1
    `,
    [classId],
  );

  return rows[0];
}

export async function assignStudentToClass(input: {
  classId: string;
  studentId: string;
  firstName?: string;
  lastName?: string;
}) {
  await ensureSchema();

  const [classRows] = await pool.query<RowDataPacket[]>(`SELECT id FROM classes WHERE class_code = ? LIMIT 1`, [input.classId]);
  if (classRows.length === 0) {
    throw new Error(`Class ${input.classId} does not exist. Create or map fees for the class first.`);
  }

  const classPk = Number(classRows[0].id);

  await pool.query(
    `
      INSERT INTO students (student_id, first_name, last_name, class_id)
      VALUES (?, COALESCE(?, 'Unknown'), COALESCE(?, 'Student'), ?)
      ON DUPLICATE KEY UPDATE
        first_name = VALUES(first_name),
        last_name = VALUES(last_name),
        class_id = VALUES(class_id),
        updated_at = CURRENT_TIMESTAMP
    `,
    [input.studentId, input.firstName || null, input.lastName || null, classPk],
  );

  return getStudentByStudentId(input.studentId);
}

export async function removeStudentFromClass(classId: string, studentId: string) {
  await ensureSchema();

  const [result] = await pool.query<ResultSetHeader>(
    `
      UPDATE students
      SET class_id = NULL, updated_at = CURRENT_TIMESTAMP
      WHERE student_id = ?
        AND class_id = (SELECT id FROM classes WHERE class_code = ? LIMIT 1)
    `,
    [studentId, classId],
  );

  return result.affectedRows > 0;
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

  const placeholders = cleanedIds.map(() => '?').join(', ');
  const [rows] = await pool.query<StudentRecord[]>(
    `
      SELECT
        students.student_id,
        students.first_name,
        students.last_name,
        classes.class_code,
        classes.class_name,
        CAST(classes.fee_amount AS CHAR) AS fee_amount
      FROM students
      LEFT JOIN classes ON classes.id = students.class_id
      WHERE students.student_id IN (${placeholders})
      ORDER BY students.student_id ASC
    `,
    cleanedIds,
  );

  const foundIds = new Set(rows.map((row) => row.student_id));
  const totalFee = rows.reduce((sum, row) => sum + Number(row.fee_amount ?? 0), 0);

  return {
    students: rows,
    totalFee,
    missingStudentIds: cleanedIds.filter((studentId) => !foundIds.has(studentId)),
  };
}

export async function getAdminDashboardData() {
  await ensureSchema();

  const [classesRows] = await pool.query<ClassDashboardRecord[]>(
    `
      SELECT
        classes.class_code,
        classes.class_name,
        CAST(classes.fee_amount AS CHAR) AS fee_amount,
        COUNT(students.id) AS student_count
      FROM classes
      LEFT JOIN students ON students.class_id = classes.id
      GROUP BY classes.id, classes.class_code, classes.class_name, classes.fee_amount
      ORDER BY classes.class_name ASC
    `,
  );

  const [studentsRows] = await pool.query<StudentRecord[]>(
    `
      SELECT
        students.student_id,
        students.first_name,
        students.last_name,
        classes.class_code,
        classes.class_name,
        CAST(classes.fee_amount AS CHAR) AS fee_amount
      FROM students
      LEFT JOIN classes ON classes.id = students.class_id
      ORDER BY students.student_id ASC
    `,
  );

  const formatter = new Intl.NumberFormat('en-NG', {
    style: 'currency',
    currency: 'NGN',
    maximumFractionDigits: 0,
  });

  return {
    classes: classesRows.map((row) => ({
      classCode: row.class_code,
      className: row.class_name,
      feeAmount: Number(row.fee_amount),
      feeDisplay: formatter.format(Number(row.fee_amount)),
      studentCount: Number(row.student_count),
    })),
    students: studentsRows.map((student) => ({
      studentId: student.student_id,
      fullName: `${student.first_name} ${student.last_name}`,
      classCode: student.class_code,
      className: student.class_name,
      feeAmount: Number(student.fee_amount ?? 0),
      feeDisplay: formatter.format(Number(student.fee_amount ?? 0)),
    })),
  };
}
