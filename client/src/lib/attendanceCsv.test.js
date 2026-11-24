import test from 'node:test';
import assert from 'node:assert/strict';
import { createAttendanceCsv } from './attendanceCsv.js';

test('CSV preserves student names containing commas, quotes and newlines', () => {
  const markedAt = '2026-11-24T12:00:00Z';
  const csv = createAttendanceCsv([{ student_name: 'Test, "Student"\nName', roll_number: '001', marked_at: markedAt }]);
  assert.equal(csv, `"Student Name","Roll Number","Time of Scan"\r\n"Test, ""Student""\nName","001","${new Date(markedAt).toLocaleString()}"`);
});

test('CSV treats formula-like student data as text', () => {
  const csv = createAttendanceCsv([{ student_name: '=1+1', roll_number: '+123', marked_at: '2026-11-24T12:00:00Z' }]);
  assert.ok(csv.includes(`"'=1+1","'+123"`));
});
