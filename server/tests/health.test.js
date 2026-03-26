const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const app = require('../index');

test('GET /api/health returns 200', async () => {
  const response = await request(app).get('/api/health');

  assert.equal(response.statusCode, 200);
  assert.ok(response.body.message);
});
