const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const jwt = require('jsonwebtoken');
const request = require('supertest');

process.env.JWT_SECRET = 'session-absentees-test-only';
const db = { from: () => { throw new Error('Unexpected database query'); } };
const dbPath = require.resolve('../lib/supabase');
require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: db };
const app = express();
app.use(express.json());
app.use('/analytics', require('../routes/analytics'));
app.use('/notifications', require('../routes/notifications'));
const token = jwt.sign({ id: 'teacher-1', role: 'teacher' }, process.env.JWT_SECRET);
const authorization = `Bearer ${token}`;

const queryResult = (result) => {
  const query = {
    select: () => query,
    eq: () => query,
    not: () => query,
    single: async () => result,
    then: (resolve, reject) => Promise.resolve(result).then(resolve, reject)
  };
  return query;
};

test('unmapped sessions report roster unavailable without querying enrollments', async (t) => {
  t.mock.method(db, 'from', (table) => {
    assert.equal(table, 'sessions');
    return queryResult({ data: { id: 'session-1', teacher_id: 'teacher-1', subject_id: null } });
  });
  const response = await request(app).get('/analytics/session/session-1/absentees').set('Authorization', authorization);
  assert.equal(response.status, 200);
  assert.equal(response.body.rosterAvailable, false);
  assert.deepEqual(response.body.absentees, []);
  assert.match(response.body.message, /no subject mapping/);
});

test('mapped sessions still report enrollment errors', async (t) => {
  t.mock.method(db, 'from', (table) => queryResult(table === 'sessions'
    ? { data: { id: 'session-1', teacher_id: 'teacher-1', subject_id: 'subject-1' } }
    : { error: { message: 'Database unavailable' } }));
  const response = await request(app).get('/analytics/session/session-1/absentees').set('Authorization', authorization);
  assert.equal(response.status, 500);
  assert.equal(response.body.message, 'Failed to load enrolled students.');
});

test('another teacher cannot view an unmapped session roster', async (t) => {
  t.mock.method(db, 'from', () => queryResult({ data: { id: 'session-1', teacher_id: 'teacher-2', subject_id: null } }));
  const response = await request(app).get('/analytics/session/session-1/absentees').set('Authorization', authorization);
  assert.equal(response.status, 403);
});

test('unmapped sessions cannot queue absentee notifications', async (t) => {
  t.mock.method(db, 'from', (table) => {
    assert.equal(table, 'sessions');
    return queryResult({ data: { id: 'session-1', teacher_id: 'teacher-1', subject_id: null } });
  });
  const response = await request(app).post('/notifications/session/session-1/absentees').set('Authorization', authorization);
  assert.equal(response.status, 400);
  assert.match(response.body.error, /subject mapping/);
});
