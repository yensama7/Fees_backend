# School Fees Backend

This repository contains a Next.js backend for the school fees payment flow shown in the provided drawing and frontend screenshot.

## What it does

- Stores classes and students in a local SQLite database file for this development phase.
- Returns a student's full name, class, and fee when the frontend supplies a student ID.
- Supports bulk student lookup for the payment screen so the frontend can render all students and a combined total.
- Lets an admin map fees to classes, add students to classes, remove students from classes, and list students by class.
- Adds CORS headers for Lovable-hosted frontends.

## Environment variables

Create a `.env.local` file using the values below:

```bash
SQLITE_DATABASE_PATH=./data/fees.sqlite
ADMIN_USERNAME=admin
ADMIN_PASSWORD=admin
SESSION_SECRET=replace-this-secret-before-production
```

## Admin access

- Admin UI: `/admin/login`
- Testing credentials: `admin` / `admin`
- Protected admin features use a signed HTTP-only cookie, `SameSite=Strict`, middleware-based route protection, and login rate limiting.
- The admin session signing uses Web Crypto so it also works in the Next.js Edge runtime.

## API endpoints

### Health

`GET /api/health`

Checks that the database file is reachable and the schema can be created.

### Student details

`GET /api/students/:studentId`

Response example:

```json
{
  "success": true,
  "data": {
    "studentId": "STD001",
    "firstName": "John",
    "lastName": "Adeyemi",
    "fullName": "John Adeyemi",
    "classCode": "GRADE_5",
    "className": "Grade 5",
    "feeAmount": 75000,
    "feeDisplay": "₦75,000"
  }
}
```

### Bulk lookup for the payment page

`POST /api/payments/lookup`

Request body:

```json
{
  "studentIds": ["STD001", "STD002"]
}
```

This returns the student cards plus `totalFee` and `totalFeeDisplay` so the frontend can render the fee summary immediately.

### Class management

- `GET /api/classes/:classId/students`
- `POST /api/classes/:classId/students`
- `DELETE /api/classes/:classId/students?studentId=STD001`
- `PUT /api/classes/:classId/fees`

## Seed data

The backend automatically creates the schema and inserts sample records on first use:

- `STD001` → John Adeyemi → Grade 5 → ₦75,000
- `STD002` → Ada Okafor → Grade 3 → ₦60,000
- `STD003` → Musa Bello → Grade 6 → ₦80,000

## Run locally

```bash
npm install
npm run dev
```
