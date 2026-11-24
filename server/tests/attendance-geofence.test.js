const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const express = require('express');
const jwt = require('jsonwebtoken');
const request = require('supertest');
const { validateLocation } = require('../lib/geofence');

process.env.JWT_SECRET = 'attendance-geofence-test-only';
process.env.QR_SECRET = 'attendance-geofence-qr-test-only';
const db = { from: () => { throw new Error('Unexpected database query'); } };
const dbPath = require.resolve('../lib/supabase');
require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: db };
const app = express();
app.use(express.json());
app.use('/attendance', require('../routes/attendance'));
app.use('/session', require('../routes/session'));

const auth = (role = 'student', id = 'student-1') =>
  `Bearer ${jwt.sign({ id, role, studentName: 'Demo Student', rollNumber: 'DEMO-001' }, process.env.JWT_SECRET)}`;

const installDatabase = (t, overrides = {}) => {
  const state = {
    session: {
      id: 'session-1', teacher_id: 'teacher-1', subject_id: 'subject-1',
      latitude: 0, longitude: 0, radius_meters: 100, requires_selfie: false,
      expires_at: new Date(Date.now() + 600000).toISOString()
    },
    enrolled: true, attendanceWrites: [], incidents: [], sessionWrites: [],
    ...overrides
  };
  t.mock.method(db, 'from', (table) => {
    let insert;
    let update;
    const resolve = () => {
      if (table === 'sessions') {
        if (insert) {
          state.sessionWrites.push(insert);
          return { data: { id: 'created-session', ...insert[0] } };
        }
        if (update) state.session = { ...state.session, ...update };
        return { data: state.session };
      }
      if (table === 'enrollments') {
        return state.enrollmentError
          ? { error: { message: 'Enrollment database unavailable' } }
          : { data: state.enrolled ? { id: 'enrollment-1' } : null };
      }
      if (table === 'attendance') {
        if (!insert) return { data: null };
        state.attendanceWrites.push(insert);
        return { data: { id: 'attendance-1', ...insert } };
      }
      if (table === 'incident_logs') {
        state.incidents.push(insert);
        return { error: null };
      }
      throw new Error(`Unexpected table ${table}`);
    };
    const query = {
      select: () => query, eq: () => query, gt: () => query,
      insert: (value) => { insert = value; return query; },
      update: (value) => { update = value; return query; },
      limit: async () => ({ data: [] }),
      single: async () => resolve(),
      maybeSingle: async () => resolve(),
      then: (fulfilled, rejected) => Promise.resolve(resolve()).then(fulfilled, rejected)
    };
    return query;
  });
  return state;
};

const payloadFor = (session) => {
  const expiresAt = new Date(Date.now() + 600000).toISOString();
  return {
    sessionId: session.id, expiresAt,
    signature: crypto.createHmac('sha256', process.env.QR_SECRET).update(`${session.id}.${expiresAt}`).digest('hex')
  };
};

test('radius is inclusive at the boundary, but not just beyond it', () => {
  const session = { latitude: 0, longitude: 0, radius_meters: 100 };
  const longitudeAt100m = 100 / 6371000 * 180 / Math.PI;
  assert.equal(validateLocation(session, 0, longitudeAt100m).ok, true);
  assert.equal(validateLocation(session, 0, longitudeAt100m * 1.001).status, 403);
});

for (const [route, field] of [['mark', 'qrData'], ['mark-manual', 'payload']]) {
  test(`${route} rejects missing, null, blank, nonnumeric, and out-of-range coordinates`, async (t) => {
    const state = installDatabase(t);
    for (const coordinates of [{}, { latitude: null, longitude: null }, { latitude: '', longitude: '' },
      { latitude: false, longitude: false }, { latitude: '0', longitude: '0' },
      { latitude: 91, longitude: 0 }, { latitude: 0, longitude: 181 }]) {
      const response = await request(app).post(`/attendance/${route}`).set('Authorization', auth())
        .send({ [field]: JSON.stringify(payloadFor(state.session)), ...coordinates });
      assert.equal(response.status, 400, JSON.stringify(coordinates));
    }
    assert.equal(state.attendanceWrites.length, 0);
  });

  test(`${route} rejects outside students and accepts zero coordinates inside the radius`, async (t) => {
    const state = installDatabase(t);
    const payload = JSON.stringify(payloadFor(state.session));
    const outside = await request(app).post(`/attendance/${route}`).set('Authorization', auth())
      .send({ [field]: payload, latitude: 0.01, longitude: 0 });
    assert.equal(outside.status, 403);
    assert.equal(state.attendanceWrites.length, 0);
    assert.equal(state.incidents.length, 1);
    const inside = await request(app).post(`/attendance/${route}`).set('Authorization', auth())
      .send({ [field]: payload, latitude: 0, longitude: 0 });
    assert.equal(inside.status, 201);
    assert.equal(state.attendanceWrites.length, 1);
    assert.equal(state.attendanceWrites[0].latitude, 0);
  });

  test(`${route} leaves sessions without a radius unrestricted`, async (t) => {
    const state = installDatabase(t);
    state.session.radius_meters = null;
    const response = await request(app).post(`/attendance/${route}`).set('Authorization', auth())
      .send({ [field]: JSON.stringify(payloadFor(state.session)) });
    assert.equal(response.status, 201);
  });
}

test('location preflight checks enrollment and server-side expiry before verifying', async (t) => {
  const state = installDatabase(t);
  const check = () => request(app).post('/attendance/verify-location').set('Authorization', auth())
    .send({ sessionId: state.session.id, latitude: 0, longitude: 0 });
  assert.equal((await check()).body.verified, true);
  state.enrolled = false;
  assert.equal((await check()).status, 403);
  state.enrollmentError = true;
  assert.equal((await check()).status, 500);
  state.session.expires_at = new Date(Date.now() - 1000).toISOString();
  assert.equal((await check()).status, 410);
});

test('a configured radius cannot fail open when teacher coordinates are missing', async (t) => {
  const state = installDatabase(t);
  state.session.latitude = null;
  const response = await request(app).post('/attendance/verify-location').set('Authorization', auth())
    .send({ sessionId: state.session.id, latitude: 0, longitude: 0 });
  assert.equal(response.status, 409);
  assert.equal(response.body.verified, undefined);
});

test('session creation rejects invalid geofences but permits an omitted radius', async (t) => {
  const state = installDatabase(t);
  for (const coordinates of [{ latitude: null, longitude: null, radiusMeters: 100 },
    { latitude: 0, longitude: 0, radiusMeters: 0 },
    { latitude: 0, longitude: 0, radiusMeters: -1 },
    { latitude: 0, longitude: 0, radiusMeters: 1.5 },
    { latitude: 100, longitude: 0, radiusMeters: 100 }]) {
    const response = await request(app).post('/session/create').set('Authorization', auth('teacher', 'teacher-1'))
      .send({ subject: 'DSA', ...coordinates });
    assert.equal(response.status, 400, JSON.stringify(coordinates));
  }
  assert.equal(state.sessionWrites.length, 0);
  const unrestricted = await request(app).post('/session/create').set('Authorization', auth('teacher', 'teacher-1'))
    .send({ subject: 'DSA' });
  assert.equal(unrestricted.status, 201);
  const configured = await request(app).post('/session/create').set('Authorization', auth('teacher', 'teacher-1'))
    .send({ subject: 'DSA', latitude: 0, longitude: 0, radiusMeters: 100 });
  assert.equal(configured.status, 201);
});

test('ending a session prevents both submission paths even with a still-signed QR', async (t) => {
  const state = installDatabase(t);
  const payload = payloadFor(state.session);
  const unauthorized = await request(app).patch(`/session/${state.session.id}/end`)
    .set('Authorization', auth('teacher', 'teacher-2'));
  assert.equal(unauthorized.status, 403);
  const ended = await request(app).patch(`/session/${state.session.id}/end`)
    .set('Authorization', auth('teacher', 'teacher-1'));
  assert.equal(ended.status, 200);
  for (const [route, field] of [['mark', 'qrData'], ['mark-manual', 'payload']]) {
    const response = await request(app).post(`/attendance/${route}`).set('Authorization', auth())
      .send({ [field]: JSON.stringify(payload), latitude: 0, longitude: 0 });
    assert.equal(response.status, 410);
  }
  assert.equal(state.attendanceWrites.length, 0);
});

test('available sessions filters to enrolled subjects and unmapped open sessions', async (t) => {
  let filter;
  t.mock.method(db, 'from', (table) => {
    const query = {
      select: () => query,
      eq: () => query,
      gt: () => query,
      or: (value) => { filter = value; return query; },
      order: async () => ({ data: [{ id: 'available-session', radius_meters: 100 }] }),
      then: (fulfilled, rejected) => Promise.resolve({ data: [{ subject_id: 'subject-1' }] }).then(fulfilled, rejected)
    };
    return query;
  });
  const response = await request(app).get('/session/available').set('Authorization', auth());
  assert.equal(response.status, 200);
  assert.equal(filter, 'subject_id.is.null,subject_id.in.(subject-1)');
  assert.equal(response.body.sessions.length, 1);
});

test('available sessions does not silently ignore enrollment lookup failures', async (t) => {
  t.mock.method(db, 'from', () => {
    const query = {
      select: () => query,
      eq: () => query,
      then: (fulfilled, rejected) => Promise.resolve({ error: { message: 'Enrollment database unavailable' } }).then(fulfilled, rejected)
    };
    return query;
  });
  const response = await request(app).get('/session/available').set('Authorization', auth());
  assert.equal(response.status, 500);
  assert.equal(response.body.sessions, undefined);
});

test('teacher history restores signed active QR payloads but not expired QR payloads', async (t) => {
  const active = { id: 'active-session', expires_at: new Date(Date.now() + 600000).toISOString() };
  const expired = { id: 'expired-session', expires_at: new Date(Date.now() - 600000).toISOString() };
  t.mock.method(db, 'from', (table) => {
    const query = {
      select: () => query,
      eq: () => query,
      order: async () => ({ data: [active, expired] }),
      then: (fulfilled, rejected) => Promise.resolve({ count: 2 }).then(fulfilled, rejected)
    };
    assert.ok(['sessions', 'attendance'].includes(table));
    return query;
  });
  const response = await request(app).get('/session/history').set('Authorization', auth('teacher', 'teacher-1'));
  assert.equal(response.status, 200);
  const restored = response.body.sessions[0].qrPayload;
  assert.equal(restored.sessionId, active.id);
  assert.equal(restored.expiresAt, active.expires_at);
  assert.equal(restored.signature, crypto.createHmac('sha256', process.env.QR_SECRET).update(`${active.id}.${active.expires_at}`).digest('hex'));
  assert.equal(response.body.sessions[1].qrPayload, null);
  const student = await request(app).get('/session/history').set('Authorization', auth());
  assert.equal(student.status, 403);
});
