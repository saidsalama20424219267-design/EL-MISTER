const http = require('http');
const fs = require('fs');
const path = require('path');

const DB_FILE = path.join(__dirname, 'database.json');
const UPLOAD_DIR = path.join(__dirname, 'uploads');

if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR);

function initDB() {
  if (!fs.existsSync(DB_FILE)) {
    fs.writeFileSync(DB_FILE, JSON.stringify({ students: [], lessons: [] }, null, 2));
  }
}
initDB();

function getDB() { return JSON.parse(fs.readFileSync(DB_FILE, 'utf8')); }
function saveDB(data) { fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2)); }

const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') { res.writeHead(200); return res.end(); }

  // 1. تسجيل الطالب لطلب الانضمام
  if (req.url === '/api/student/join' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      const data = JSON.parse(body);
      const db = getDB();
      const existing = db.students.find(s => s.phone === data.phone);

      if (existing) {
        if (existing.status === 'معلق') {
          res.writeHead(403, { 'Content-Type': 'application/json; charset=utf-8' });
          return res.end(JSON.stringify({ error: 'طلبك قيد المراجعة من مستر سعيد. يرجى التواصل لتفعيل الاشتراك.' }));
        }
        if (existing.status === 'محظور') {
          res.writeHead(403, { 'Content-Type': 'application/json; charset=utf-8' });
          return res.end(JSON.stringify({ error: 'تم حظر هذا الحساب من قبل الإدارة.' }));
        }
        if (existing.deviceId && existing.deviceId !== data.deviceId) {
          res.writeHead(403, { 'Content-Type': 'application/json; charset=utf-8' });
          return res.end(JSON.stringify({ error: 'عفواً! هذا الحساب مفتوح على جهاز آخر. كلم المستر لفك جهازك.' }));
        }
        if (!existing.deviceId) {
          existing.deviceId = data.deviceId;
          saveDB(db);
        }
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        return res.end(JSON.stringify({ message: 'تم تسجيل الدخول بنجاح!', student: existing }));
      }

      // إضافة طالب جديد بحالة "معلق" في انتظار موافقة المستر
      const newStudent = {
        id: Date.now(),
        name: data.name,
        phone: data.phone,
        parentPhone: data.parentPhone,
        grade: data.grade,
        status: 'معلق',
        deviceId: data.deviceId,
        date: new Date().toLocaleDateString('ar-EG')
      };
      db.students.push(newStudent);
      saveDB(db);

      res.writeHead(201, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ message: 'تم إرسال طلبك لمستر سعيد! سيتم فتح المنصة فور اعتمادك.' }));
    });
    return;
  }

  // 2. جلب جميع الطلاب للأدمن
  if (req.url === '/api/admin/students' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    return res.end(JSON.stringify(getDB().students));
  }

  // 3. تحكم المستر في الطالب (تفعيل - حظر - فك جهاز - حذف)
  if (req.url === '/api/admin/action' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      const { phone, action } = JSON.parse(body);
      const db = getDB();
      const st = db.students.find(s => s.phone === phone);

      if (!st) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: 'الطالب غير موجود' }));
      }

      if (action === 'activate') st.status = 'نشط';
      if (action === 'ban') st.status = 'محظور';
      if (action === 'reset') st.deviceId = null;
      if (action === 'delete') db.students = db.students.filter(s => s.phone !== phone);

      saveDB(db);
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ message: 'تم تحديث حالة الطالب بنجاح' }));
    });
    return;
  }

  // 4. رفع ونشر فيديو ومحاضرة جديدة
  if (req.url === '/api/admin/add-lesson' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      const lesson = JSON.parse(body);
      const db = getDB();
      lesson.id = Date.now();
      db.lessons.push(lesson);
      saveDB(db);
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ message: 'تم نشر الفيديو بنجاح!' }));
    });
    return;
  }

  // 5. جلب الفيديوهات حسب مرحلة الطالب
  if (req.url.startsWith('/api/lessons') && req.method === 'GET') {
    const urlParams = new URL(req.url, `http://${req.headers.host}`);
    const grade = urlParams.searchParams.get('grade');
    const db = getDB();
    const filtered = db.lessons.filter(l => l.grade === grade);
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    return res.end(JSON.stringify(filtered));
  }

  // تقديم صفحات الموقع
  let filePath = path.join(__dirname, req.url === '/' ? 'index.html' : req.url.split('?')[0]);
  const ext = path.extname(filePath);
  let contentType = 'text/html; charset=utf-8';
  if (ext === '.js') contentType = 'text/javascript';
  if (ext === '.css') contentType = 'text/css';

  fs.readFile(filePath, (err, content) => {
    if (err) { res.writeHead(404); res.end('الملف غير موجود'); }
    else { res.writeHead(200, { 'Content-Type': contentType }); res.end(content); }
  });
});

server.listen(3000, () => {
  console.log('✅ سيرفر منصة المستر يعمل الآن على http://localhost:3000');
});