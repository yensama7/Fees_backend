import { mkdirSync } from 'fs';
import { dirname, resolve } from 'path';
import sqlite3 from 'sqlite3';

const databasePath = resolve(process.env.SQLITE_DATABASE_PATH ?? './data/fees.sqlite');

const globalForDb = globalThis as typeof globalThis & {
  feesDb?: sqlite3.Database;
  schemaPromise?: Promise<void>;
};

function getDatabase(): sqlite3.Database {
  if (!globalForDb.feesDb) {
    mkdirSync(dirname(databasePath), { recursive: true });
    globalForDb.feesDb = new sqlite3.Database(databasePath);
    globalForDb.feesDb.exec('PRAGMA foreign_keys = ON;');
  }

  return globalForDb.feesDb;
}

export const db = getDatabase();

function run(sql: string, params: unknown[] = []) {
  return new Promise<{ lastID: number; changes: number }>((resolvePromise, rejectPromise) => {
    db.run(sql, params, function onRun(error) {
      if (error) {
        rejectPromise(error);
        return;
      }

      resolvePromise({ lastID: this.lastID, changes: this.changes });
    });
  });
}

function get<T>(sql: string, params: unknown[] = []) {
  return new Promise<T | undefined>((resolvePromise, rejectPromise) => {
    db.get(sql, params, (error, row) => {
      if (error) {
        rejectPromise(error);
        return;
      }

      resolvePromise(row as T | undefined);
    });
  });
}

function all<T>(sql: string, params: unknown[] = []) {
  return new Promise<T[]>((resolvePromise, rejectPromise) => {
    db.all(sql, params, (error, rows) => {
      if (error) {
        rejectPromise(error);
        return;
      }

      resolvePromise((rows ?? []) as T[]);
    });
  });
}

const schemaStatements = [
  `
    CREATE TABLE IF NOT EXISTS classes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      class_code TEXT NOT NULL UNIQUE,
      class_name TEXT NOT NULL,
      fee_amount REAL NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `,
  `
    CREATE TABLE IF NOT EXISTS students (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id TEXT NOT NULL UNIQUE,
      first_name TEXT NOT NULL,
      last_name TEXT NOT NULL,
      class_id INTEGER NULL REFERENCES classes(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `,
  `
    INSERT OR IGNORE INTO classes (class_code, class_name, fee_amount)
    VALUES
      ('GRADE_1', 'Grade 1', 45000),
      ('GRADE_3', 'Grade 3', 60000),
      ('GRADE_5', 'Grade 5', 75000),
      ('GRADE_6', 'Grade 6', 80000);
  `,
  `
    INSERT OR IGNORE INTO students (student_id, first_name, last_name, class_id)
    SELECT 'STD001', 'John', 'Adeyemi', id FROM classes WHERE class_code = 'GRADE_5';
  `,
  `
    INSERT OR IGNORE INTO students (student_id, first_name, last_name, class_id)
    SELECT 'STD002', 'Ada', 'Okafor', id FROM classes WHERE class_code = 'GRADE_3';
  `,
  `
    INSERT OR IGNORE INTO students (student_id, first_name, last_name, class_id)
    SELECT 'STD003', 'Musa', 'Bello', id FROM classes WHERE class_code = 'GRADE_6';
  `,
];

export function isDatabaseConnectionError(error: unknown): boolean {
  return error instanceof Error;
}

export function getDatabaseUnavailableMessage() {
  return `SQLite could not be opened. Check SQLITE_DATABASE_PATH=${databasePath} and verify the app can write to that directory.`;
}

export async function ensureSchema(): Promise<void> {
  if (!globalForDb.schemaPromise) {
    globalForDb.schemaPromise = (async () => {
      try {
        for (const statement of schemaStatements) {
          await run(statement);
        }
      } catch (error) {
        globalForDb.schemaPromise = undefined;
        throw error;
      }
    })();
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

type ClassDashboardRecord = {
  class_code: string;
  class_name: string;
  fee_amount: string;
  student_count: number;
};

function mapStudentRow(row: Record<string, unknown> | undefined): StudentRecord | null {
  if (!row) {
    return null;
  }

  return {
    student_id: String(row.student_id),
    first_name: String(row.first_name),
    last_name: String(row.last_name),
    class_code: row.class_code ? String(row.class_code) : null,
    class_name: row.class_name ? String(row.class_name) : null,
    fee_amount: row.fee_amount !== null && row.fee_amount !== undefined ? String(row.fee_amount) : null,
  };
}

export async function getStudentByStudentId(studentId: string): Promise<StudentRecord | null> {
  await ensureSchema();

  const row = await get<Record<string, unknown>>(
    `
      SELECT
        students.student_id,
        students.first_name,
        students.last_name,
        classes.class_code,
        classes.class_name,
        CAST(classes.fee_amount AS TEXT) AS fee_amount
      FROM students
      LEFT JOIN classes ON classes.id = students.class_id
      WHERE students.student_id = ?
      LIMIT 1
    `,
    [studentId],
  );

  return mapStudentRow(row);
}

export async function getStudentsByClassId(classId: string): Promise<StudentRecord[]> {
  await ensureSchema();

  const rows = await all<Record<string, unknown>>(
    `
      SELECT
        students.student_id,
        students.first_name,
        students.last_name,
        classes.class_code,
        classes.class_name,
        CAST(classes.fee_amount AS TEXT) AS fee_amount
      FROM students
      INNER JOIN classes ON classes.id = students.class_id
      WHERE classes.class_code = ?
      ORDER BY students.student_id ASC
    `,
    [classId],
  );

  return rows.map((row) => mapStudentRow(row)).filter((row): row is StudentRecord => row !== null);
}

export async function upsertClassFee(classId: string, feeAmount: number) {
  await ensureSchema();

  const displayName = classId
    .toLowerCase()
    .replaceAll('_', ' ')
    .replace(/\b\w/g, (character) => character.toUpperCase());

  await run(
    `
      INSERT INTO classes (class_code, class_name, fee_amount, updated_at)
      VALUES (?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(class_code)
      DO UPDATE SET
        class_name = excluded.class_name,
        fee_amount = excluded.fee_amount,
        updated_at = CURRENT_TIMESTAMP
    `,
    [classId, displayName, feeAmount],
  );

  return (await get<{ class_code: string; class_name: string; fee_amount: string }>(
    `
      SELECT class_code, class_name, CAST(fee_amount AS TEXT) AS fee_amount
      FROM classes
      WHERE class_code = ?
      LIMIT 1
    `,
    [classId],
  ))!;
}

export async function assignStudentToClass(input: {
  classId: string;
  studentId: string;
  firstName?: string;
  lastName?: string;
}) {
  await ensureSchema();

  const classRow = await get<{ id: number }>(`SELECT id FROM classes WHERE class_code = ? LIMIT 1`, [input.classId]);
  if (!classRow) {
    throw new Error(`Class ${input.classId} does not exist. Create or map fees for the class first.`);
  }

  await run(
    `
      INSERT INTO students (student_id, first_name, last_name, class_id, updated_at)
      VALUES (?, COALESCE(?, 'Unknown'), COALESCE(?, 'Student'), ?, CURRENT_TIMESTAMP)
      ON CONFLICT(student_id)
      DO UPDATE SET
        first_name = excluded.first_name,
        last_name = excluded.last_name,
        class_id = excluded.class_id,
        updated_at = CURRENT_TIMESTAMP
    `,
    [input.studentId, input.firstName ?? null, input.lastName ?? null, classRow.id],
  );

  return getStudentByStudentId(input.studentId);
}

export async function removeStudentFromClass(classId: string, studentId: string) {
  await ensureSchema();

  const result = await run(
    `
      UPDATE students
      SET class_id = NULL, updated_at = CURRENT_TIMESTAMP
      WHERE student_id = ?
        AND class_id = (SELECT id FROM classes WHERE class_code = ? LIMIT 1)
    `,
    [studentId, classId],
  );

  return result.changes > 0;
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
  const rows = await all<Record<string, unknown>>(
    `
      SELECT
        students.student_id,
        students.first_name,
        students.last_name,
        classes.class_code,
        classes.class_name,
        CAST(classes.fee_amount AS TEXT) AS fee_amount
      FROM students
      LEFT JOIN classes ON classes.id = students.class_id
      WHERE students.student_id IN (${placeholders})
      ORDER BY students.student_id ASC
    `,
    cleanedIds,
  );

  const students = rows.map((row) => mapStudentRow(row)).filter((row): row is StudentRecord => row !== null);
  const foundIds = new Set(students.map((row) => row.student_id));
  const totalFee = students.reduce((sum, row) => sum + Number(row.fee_amount ?? 0), 0);

  return {
    students,
    totalFee,
    missingStudentIds: cleanedIds.filter((studentId) => !foundIds.has(studentId)),
  };
}

export async function getAdminDashboardData() {
  await ensureSchema();

  const classesRows = await all<ClassDashboardRecord>(
    `
      SELECT
        classes.class_code,
        classes.class_name,
        CAST(classes.fee_amount AS TEXT) AS fee_amount,
        COUNT(students.id) AS student_count
      FROM classes
      LEFT JOIN students ON students.class_id = classes.id
      GROUP BY classes.id, classes.class_code, classes.class_name, classes.fee_amount
      ORDER BY classes.class_name ASC
    `,
  );

  const studentsRows = await all<Record<string, unknown>>(
    `
      SELECT
        students.student_id,
        students.first_name,
        students.last_name,
        classes.class_code,
        classes.class_name,
        CAST(classes.fee_amount AS TEXT) AS fee_amount
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
    students: studentsRows
      .map((student) => mapStudentRow(student))
      .filter((student): student is StudentRecord => student !== null)
      .map((student) => ({
        studentId: student.student_id,
        fullName: `${student.first_name} ${student.last_name}`,
        classCode: student.class_code,
        className: student.class_name,
        feeAmount: Number(student.fee_amount ?? 0),
        feeDisplay: formatter.format(Number(student.fee_amount ?? 0)),
      })),
  };
}
