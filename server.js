// server.js (CommonJS, works with lowdb v1)
const express = require('express');
const bodyParser = require('body-parser');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const low = require('lowdb');
const FileSync = require('lowdb/adapters/FileSync');
const { nanoid } = require('nanoid');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'replace_this_with_a_strong_secret';

// --- lowdb setup
const file = path.join(__dirname, 'db.json');
const adapter = new FileSync(file);
const db = low(adapter);
db.defaults({ users: [], tasks: [] }).write();

// Seed example users if none exist
if (db.get('users').size().value() === 0) {
  const pw = bcrypt.hashSync('password123', 10);
  db.get('users').push({
    id: nanoid(),
    name: 'Alice Admin',
    email: 'alice@example.com',
    passwordHash: pw,
    role: 'admin'
  }).write();
  db.get('users').push({
    id: nanoid(),
    name: 'Bob Dev',
    email: 'bob@example.com',
    passwordHash: bcrypt.hashSync('password123', 10),
    role: 'member'
  }).write();
  db.get('users').push({
    id: nanoid(),
    name: 'Carol QA',
    email: 'carol@example.com',
    passwordHash: bcrypt.hashSync('password123', 10),
    role: 'member'
  }).write();
  db.get('users').push({
    id: nanoid(),
    name: 'John Doe',
    email: 'john@example.com',
    passwordHash: bcrypt.hashSync('password123', 10),
    role: 'member'
  }).write();
  console.log('Seeded example users (alice, bob, carol,john). Use password: password123');
}

app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

// --- helper middleware
function authMiddleware(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth) return res.status(401).json({ error: 'Missing token' });
  const parts = auth.split(' ');
  if (parts.length !== 2) return res.status(401).json({ error: 'Invalid auth header' });
  const token = parts[1];
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = payload;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid token' });
  }
}

// --- Routes

// Signup
app.post('/api/auth/signup', (req, res) => {
  const { name, email, password } = req.body;
  if (!name || !email || !password) return res.status(400).json({ error: 'Missing fields' });

  const existing = db.get('users').find(u => u.email.toLowerCase() === email.toLowerCase()).value();
  if (existing) return res.status(400).json({ error: 'Email already registered' });

  const passwordHash = bcrypt.hashSync(password, 10);
  const user = { id: nanoid(), name, email: email.toLowerCase(), passwordHash, role: 'member' };
  db.get('users').push(user).write();

  const token = jwt.sign({ id: user.id, email: user.email, name: user.name }, JWT_SECRET, { expiresIn: '7d' });
  res.json({ token, user: { id: user.id, name: user.name, email: user.email, role: user.role } });
});

// Login
app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Missing fields' });

  const user = db.get('users').find(u => u.email.toLowerCase() === email.toLowerCase()).value();
  if (!user) return res.status(400).json({ error: 'Invalid credentials' });

  const ok = bcrypt.compareSync(password, user.passwordHash);
  if (!ok) return res.status(400).json({ error: 'Invalid credentials' });

  const token = jwt.sign({ id: user.id, email: user.email, name: user.name }, JWT_SECRET, { expiresIn: '7d' });
  res.json({ token, user: { id: user.id, name: user.name, email: user.email, role: user.role } });
});

// List users - protected
app.get('/api/users', (req, res) => {
  const users = db.get('users').value().map(u => ({ id: u.id, name: u.name, email: u.email, role: u.role }));
  res.json(users);
});

// Create task
app.post('/api/tasks', authMiddleware, (req, res) => {
  const { title, description, assigneeId, dueDate } = req.body;
  if (!title) return res.status(400).json({ error: 'Missing title' });

  const task = {
    id: nanoid(),
    title,
    description: description || '',
    assigneeId: assigneeId || null,
    createdBy: req.user.id,
    status: 'pending',
    dueDate: dueDate || null,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    reminded: false
  };
  db.get('tasks').push(task).write();
  res.json(task);
});

// Get tasks
app.get('/api/tasks', authMiddleware, (req, res) => {
  let tasks = db.get('tasks').value();

  if (req.query.assigneeId) tasks = tasks.filter(t => t.assigneeId === req.query.assigneeId);
  if (req.query.status) tasks = tasks.filter(t => t.status === req.query.status);
  if (req.query.q) {
    const q = req.query.q.toLowerCase();
    tasks = tasks.filter(t => (t.title || '').toLowerCase().includes(q) || (t.description || '').toLowerCase().includes(q));
  }
  if (req.query.assignedToMe === 'true') tasks = tasks.filter(t => t.assigneeId === req.user.id);

  const usersMap = {};
  db.get('users').value().forEach(u => usersMap[u.id] = u);
  tasks = tasks.map(t => ({ ...t, assignee: t.assigneeId ? (usersMap[t.assigneeId]?.name || null) : null }));

  res.json(tasks);
});

// Update task
app.put('/api/tasks/:id', authMiddleware, (req, res) => {
  const id = req.params.id;
  const task = db.get('tasks').find({ id }).value();
  if (!task) return res.status(404).json({ error: 'Task not found' });

  const allowed = ['title', 'description', 'assigneeId', 'status', 'dueDate'];
  allowed.forEach(k => { if (req.body[k] !== undefined) task[k] = req.body[k]; });
  task.updatedAt = Date.now();

  db.get('tasks').find({ id }).assign(task).write();
  res.json(task);
});

// Delete task
app.delete('/api/tasks/:id', authMiddleware, (req, res) => {
  const id = req.params.id;
  const task = db.get('tasks').find({ id }).value();
  if (!task) return res.status(404).json({ error: 'Task not found' });

  db.get('tasks').remove({ id }).write();
  res.json({ ok: true });
});

// Notifications
app.get('/api/notifications', authMiddleware, (req, res) => {
  const now = Date.now();
  const in24h = now + 24 * 3600 * 1000;
  const userId = req.user.id;

  const due = db.get('tasks').value().filter(t => {
    if (!t.assigneeId || t.assigneeId !== userId) return false;
    if (t.status === 'completed') return false;
    if (!t.dueDate) return false;
    const dueTs = new Date(t.dueDate).getTime();
    return dueTs <= now || dueTs <= in24h;
  }).map(t => ({ id: t.id, title: t.title, dueDate: t.dueDate, status: t.status }));

  res.json({ tasks: due });
});

// Fallback - serve index
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Server started on http://localhost:${PORT}`);
});
