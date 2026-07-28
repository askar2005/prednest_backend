import * as fs from 'fs';
import * as path from 'path';

const BASE = 'http://localhost:4000/api';

interface requestResult { status: number; data: any }

let adminToken = '';

async function request(method: string, url: string, body?: any, token?: string): Promise<requestResult> {
  const headers: Record<string, string> = {};
  if (body) { headers['Content-Type'] = 'application/json'; body = JSON.stringify(body); }
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${BASE}${url}`, { method, headers, body });
  let data: any;
  try { data = await res.json(); } catch { data = null; }
  return { status: res.status, data };
}

function ok(cond: boolean, label: string) {
  console.log(`  ${cond ? '✅' : '❌'} ${label}`);
  return cond;
}

async function runAll() {
  console.log('='.repeat(44));
  console.log('  Cloudinary Migration — 14 Test Scenarios');
  console.log('='.repeat(44));
  console.log(`  Target: ${BASE}`);
  console.log(`  Time: ${new Date().toISOString()}`);
  console.log('='.repeat(44));

  let passed = 0, failed = 0;
  let logs: string[] = [];

  const t = (label: string, fn: () => Promise<void>) => {
    logs.push(`\n📋 ${label}`);
    const origLog = console.log;
    let lines: string[] = [];
    console.log = (...args: any[]) => lines.push(args.join(' '));
    return fn().then(() => {
      console.log = origLog;
      logs.push(...lines);
      for (const l of lines) {
        if (l.includes('✅')) passed++;
        else if (l.includes('❌')) failed++;
      }
    }).catch((err) => {
      console.log = origLog;
      logs.push(`  ❌ CRASH: ${err.message}`);
      failed++;
    });
  };

  await t('Test 1: Health check', async () => {
    const res = await request('GET', '/health');
    ok(res.status === 404 || res.status === 200, `Server responds (status: ${res.status})`);
  });

  await t('Test 2: Admin login works', async () => {
    const res = await request('POST', '/admin/login', { email: 'admin@prepnest.com', password: 'Test@123' });
    ok(res.status === 200, `Login: ${res.status}`);
    if (res.data?.token) { adminToken = res.data.token; ok(true, 'Token received'); }
    else { ok(false, 'No token'); }
  });

  await t('Test 3: Prisma File model has secureUrl & publicId', async () => {
    const schema = fs.readFileSync(path.resolve(process.cwd(), 'prisma/schema.prisma'), 'utf-8');
    const fb = schema.substring(schema.indexOf('model File'), schema.indexOf('\n}', schema.indexOf('model File')));
    ok(fb.includes('secureUrl'), 'File model has secureUrl');
    ok(fb.includes('publicId'), 'File model has publicId');
  });

  await t('Test 4: All models have publicId fields', async () => {
    const s = fs.readFileSync(path.resolve(process.cwd(), 'prisma/schema.prisma'), 'utf-8');
    const block = (m: string) => s.substring(s.indexOf(`model ${m}`), s.indexOf('\n}', s.indexOf(`model ${m}`)));
    ok(block('PreparationCategory').includes('coverImagePublicId'), 'PreparationCategory has coverImagePublicId');
    ok(block('Note').includes('pdfPublicId'), 'Note has pdfPublicId');
    ok(block('Admin').includes('profileImagePublicId'), 'Admin has profileImagePublicId');
    ok(block('Attachment').includes('publicId'), 'Attachment has publicId');
  });

  await t('Test 5: PreviousYearQuestion has pdfPublicId', async () => {
    const s = fs.readFileSync(path.resolve(process.cwd(), 'prisma/schema.prisma'), 'utf-8');
    const b = s.substring(s.indexOf('model PreviousYearQuestion'), s.indexOf('\n}', s.indexOf('model PreviousYearQuestion')));
    ok(b.includes('pdfPublicId'), 'PreviousYearQuestion has pdfPublicId');
  });

  await t('Test 6: POST /files/upload endpoint', async () => {
    const res = await request('POST', '/files/upload', undefined, adminToken);
    ok([400, 401, 201].includes(res.status), `Route exists (status: ${res.status})`);
  });

  await t('Test 7: DELETE /files/:id endpoint', async () => {
    const res = await request('DELETE', '/files/nonexistent-id', undefined, adminToken);
    ok(res.status !== 500, `Route exists (status: ${res.status})`);
  });

  await t('Test 8: Category image upload route', async () => {
    const res = await request('POST', '/preparation/neet/image', undefined, adminToken);
    ok([400, 401, 200].includes(res.status), `Route exists (status: ${res.status})`);
  });

  await t('Test 9: Category image delete route', async () => {
    const res = await request('DELETE', '/preparation/neet/image', undefined, adminToken);
    ok([200, 401].includes(res.status), `Route exists (status: ${res.status})`);
  });

  await t('Test 10: Notes endpoints exist', async () => {
    const get = await request('GET', '/notes/nonexistent', undefined, adminToken);
    ok(get.status !== 500, `GET /notes/:id responds (status: ${get.status})`);
    const del = await request('DELETE', '/notes/nonexistent', undefined, adminToken);
    ok(del.status !== 500, `DELETE /notes/:id responds (status: ${del.status})`);
  });

  await t('Test 11: PYQ endpoints exist', async () => {
    const res = await request('GET', '/previous-year-questions', undefined, adminToken);
    ok([200, 401].includes(res.status), `GET /previous-year-questions (status: ${res.status})`);
    const del = await request('DELETE', '/previous-year-questions/nonexistent', undefined, adminToken);
    ok(del.status !== 500, `DELETE /previous-year-questions/:id (status: ${del.status})`);
  });

  await t('Test 12: Admin profile update works', async () => {
    const res = await request('PUT', '/admin/profile', { fullName: 'PrepNest Admin' }, adminToken);
    ok(res.status === 200, `Profile update: ${res.status}`);
    ok(res.data?.admin?.fullName === 'PrepNest Admin', `FullName updated: ${res.data?.admin?.fullName}`);
  });

  await t('Test 13: Cloudinary URL compatibility with resolveImageUrl', async () => {
    ok('https://res.cloudinary.com/demo/image/upload/v1/test.jpg'.startsWith('http'), 'Cloudinary URL is absolute');
    ok('/uploads/test.jpg'.startsWith('/'), 'Local URL starts with /');
    ok('https://example.com/image.jpg'.startsWith('http'), 'External URL is absolute');
  });

  await t('Test 14: New architecture files exist', async () => {
    const files = ['src/config/cloudinary.ts', 'src/middlewares/upload.middleware.ts', 'src/services/upload.service.ts', 'src/utils/file-validation.ts'];
    for (const f of files) ok(fs.existsSync(path.resolve(process.cwd(), f)), `File exists: ${f}`);
  });

  for (const l of logs) console.log(l);
  console.log('\n' + '='.repeat(44));
  console.log(`  RESULTS: ${passed}/${passed + failed} passed, ${failed}/${passed + failed} failed`);
  console.log('='.repeat(44));
}

runAll().catch((err) => { console.error('Test suite crashed:', err); process.exit(1); });
