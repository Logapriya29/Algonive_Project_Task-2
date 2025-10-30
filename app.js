const API = '';

function setToken(token) { localStorage.setItem('ttm_token', token); }
function getToken() { return localStorage.getItem('ttm_token'); }
function clearToken() { localStorage.removeItem('ttm_token'); }
function authHeaders() { const t = getToken(); return t ? { 'Authorization': 'Bearer ' + t } : {}; }

function qs(id) { return document.getElementById(id); }
function el(sel) { return document.querySelector(sel); }

let me = null;
let users = [];
let editTaskId = null;
let allTasks = [];

const authSection = qs('auth');
const dashboard = qs('dashboard');
const signinForm = qs('signinForm');
const signupForm = qs('signupForm');
const toSignup = qs('toSignup');
const toSignin = qs('toSignin');
const loginBtn = qs('loginBtn');
const signupBtn = qs('signupBtn');
const logoutBtn = qs('logoutBtn');
const meName = qs('meName');

const assigneeSelect = qs('assigneeSelect');
const saveTaskBtn = qs('saveTaskBtn');
const clearTaskBtn = qs('clearTaskBtn');
const taskListEl = qs('taskList');
const taskTitle = qs('taskTitle');
const taskDesc = qs('taskDesc');
const taskDue = qs('taskDue');
const taskStatus = qs('taskStatus');
const exportBtn = qs('exportBtn');
const importBtn = qs('importBtn');
const importFile = qs('importFile');
const clearAllBtn = qs('clearAllBtn');

const chips = document.querySelectorAll('.chip');
const searchInput = qs('search');
const sortSelect = qs('sort');

// New notification elements
const bellIcon = qs('bellIcon');
const bellCount = qs('bellCount');
const notificationsDropdown = qs('notificationsDropdown');
const notificationList = qs('notificationList');
const clearNotificationsBtn = qs('clearNotifications');

/* AUTH flow */
toSignup.addEventListener('click', (e) => { e.preventDefault(); signupForm.style.display = 'block'; signinForm.style.display = 'none'; qs('authTitle').innerText='Create account'; });
toSignin.addEventListener('click', (e) => { e.preventDefault(); signupForm.style.display = 'none'; signinForm.style.display = 'block'; qs('authTitle').innerText='Sign In'; });

loginBtn.addEventListener('click', async () => {
  const email = qs('loginEmail').value.trim();
  const pw = qs('loginPassword').value.trim();
  if (!email || !pw) return alert('Enter email and password');
  try {
    const res = await fetch(API + '/api/auth/login', {
      method: 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ email, password: pw })
    });
    const j = await res.json();
    if (!res.ok) return alert(j.error || 'Login failed');
    setToken(j.token); me = j.user;
    onAuth();
  } catch (err) { alert('Network error'); }
});

signupBtn.addEventListener('click', async () => {
  const name = qs('signupName').value.trim();
  const email = qs('signupEmail').value.trim();
  const pw = qs('signupPassword').value.trim();
  if (!name || !email || !pw) return alert('Fill all fields');
  try {
    const res = await fetch(API + '/api/auth/signup', {
      method: 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify({name, email, password: pw})
    });
    const j = await res.json();
    if (!res.ok) return alert(j.error || 'Signup failed');
    setToken(j.token); me = j.user;
    onAuth();
  } catch (err) { alert('Network error'); }
});

logoutBtn.addEventListener('click', () => { clearToken(); me = null; showAuth(); });

function showAuth() {
  authSection.style.display = 'block';
  dashboard.style.display = 'none';
}

function showDashboard() {
  authSection.style.display = 'none';
  dashboard.style.display = 'block';
}

/* After login */
async function onAuth() {
  showDashboard();
  meName.innerText = me.name;
  await loadUsers();
  await loadTasks();
  startAutoTaskCheck(); // 🔁 start automatic due checking
}

/* Load users */
async function loadUsers() {
  try {
    const res = await fetch(API + '/api/users', { headers: { ...authHeaders() }});
    users = await res.json();
    assigneeSelect.innerHTML = '<option value="">-- Unassigned --</option>';
    users.forEach(u => {
      const opt = document.createElement('option');
      opt.value = u.id; opt.textContent = u.name + ' (' + u.email + ')';
      assigneeSelect.appendChild(opt);
    });
  } catch (e) { console.error(e); }
}

/* Load and render tasks */
async function loadTasks() {
  try {
    const res = await fetch(API + '/api/tasks', { headers: { ...authHeaders() }});
    allTasks = await res.json();
    renderTasks(allTasks);
  } catch (e) { console.error(e); }
}

/* Render tasks with due indicators */
function renderTasks(tasks) {
  taskListEl.innerHTML = '';
  if (!tasks || tasks.length === 0) {
    taskListEl.innerHTML = '<div style="padding:18px;color:var(--muted)">No tasks</div>';
    return;
  }

  tasks.forEach(t => {
    const li = document.createElement('li'); 
    li.className = 'task';
    const due = t.dueDate ? new Date(t.dueDate) : null;
    const now = new Date();
    let badge = '';
    if (t.status === 'completed') badge = '<span class="badge-completed">Completed</span>';
    else if (due && due < now) badge = '<span class="badge-overdue">Overdue</span>';
    else if (due && due - now < 24 * 60 * 60 * 1000) badge = '<span class="badge-due-soon">Due Soon</span>';

    const dueText = due ? due.toLocaleString() : '—';
    const assignee = t.assignee || (t.assigneeId ? t.assigneeId : 'Unassigned');

    li.innerHTML = `
      <div style="display:flex;justify-content:space-between;gap:12px">
        <div>
          <div style="font-weight:700">${escapeHtml(t.title)} ${badge}</div>
          <div class="task-desc">${escapeHtml(t.description || '')}</div>
          <div class="meta">
            <div>Assignee: ${escapeHtml(assignee)}</div>
            <div>Status: ${escapeHtml(t.status)}</div>
            <div>Due: ${dueText}</div>
          </div>
        </div>
        <div class="actions">
          <button class="icon-btn" data-id="${t.id}" data-action="edit">Edit</button>
          <button class="icon-btn" data-id="${t.id}" data-action="status">${t.status === 'completed' ? 'Undo' : 'Complete'}</button>
          <button class="icon-btn" data-id="${t.id}" data-action="delete">Delete</button>
        </div>
      </div>`;
    taskListEl.appendChild(li);
  });
}

/* Create/update task */
saveTaskBtn.addEventListener('click', async () => {
  const title = taskTitle.value.trim();
  if (!title) return alert('Enter title');
  const data = {
    title, description: taskDesc.value.trim(),
    assigneeId: assigneeSelect.value || null,
    dueDate: taskDue.value || null,
    status: taskStatus.value
  };

  try {
    if (editTaskId) {
      await fetch(API + '/api/tasks/' + editTaskId, {
        method: 'PUT', headers: {'Content-Type':'application/json', ...authHeaders()},
        body: JSON.stringify(data)
      });
      editTaskId = null;
      saveTaskBtn.textContent = 'Add Task';
    } else {
      await fetch(API + '/api/tasks', {
        method: 'POST', headers: {'Content-Type':'application/json', ...authHeaders()},
        body: JSON.stringify(data)
      });
    }
    clearTaskForm();
    await loadTasks();
  } catch (e) { alert('Network error'); }
});

function clearTaskForm() {
  editTaskId = null;
  taskTitle.value = ''; taskDesc.value = ''; assigneeSelect.value = ''; taskDue.value = ''; taskStatus.value = 'pending';
  saveTaskBtn.textContent = 'Add Task';
}

clearTaskBtn.addEventListener('click', clearTaskForm);

/* ============================== */
/* 🔔 Notification System */
/* ============================== */
let notifications = JSON.parse(localStorage.getItem('notifications') || '[]');

function addNotification(msg) {
  const time = new Date().toLocaleTimeString();
  notifications.unshift({ msg, time });
  if (notifications.length > 10) notifications.pop(); // keep last 10
  localStorage.setItem('notifications', JSON.stringify(notifications));
  renderNotifications();
}

function renderNotifications() {
  notificationList.innerHTML = '';
  if (notifications.length === 0) {
    notificationList.innerHTML = '<li style="text-align:center;color:#999;padding:10px;">No new notifications</li>';
  } else {
    notifications.forEach(n => {
      const li = document.createElement('li');
      li.innerHTML = `<strong>${n.msg}</strong><br><small>${n.time}</small>`;
      notificationList.appendChild(li);
    });
  }
  bellCount.textContent = notifications.length;
}

bellIcon.addEventListener('click', () => {
  notificationsDropdown.classList.toggle('active');
  renderNotifications();
});

clearNotificationsBtn.addEventListener('click', () => {
  notifications = [];
  localStorage.setItem('notifications', '[]');
  renderNotifications();
});

/* Auto task check every 10 seconds */
function startAutoTaskCheck() {
  setInterval(checkDueTasks, 10000);
  checkDueTasks();
}

function checkDueTasks() {
  const now = new Date();
  allTasks.forEach(t => {
    if (!t.dueDate || t.status === 'completed') return;
    const due = new Date(t.dueDate);
    if (due < now) addNotification(`⚠ Task "${t.title}" is OVERDUE!`);
    else if (due - now < 24*60*60*1000) addNotification(`⏳ Task "${t.title}" is due SOON!`);
  });
  renderNotifications();
}

/* Helper */
function escapeHtml(s) {
  if (!s) return '';
  return s.replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' })[c]);
}

/* Init */
async function init() {
  const token = getToken();
  if (!token) return showAuth();
  const payload = JSON.parse(atob(token.split('.')[1]));
  me = { id: payload.id, name: payload.name, email: payload.email };
  onAuth();
}


/* ============================= */
/* 🔧 Re-add interactivity for filters and actions */
/* ============================= */

// Click on filter chips (All, Pending, Completed, etc.)
chips.forEach(c => c.addEventListener('click', async () => {
  chips.forEach(x => x.classList.remove('active'));
  c.classList.add('active');

  const filter = c.dataset.filter;
  let filtered = [...allTasks];
  if (filter === 'assignedToMe') {
    filtered = filtered.filter(t => t.assigneeId === me.id);
  } else if (filter === 'pending' || filter === 'in-progress' || filter === 'completed') {
    filtered = filtered.filter(t => t.status === filter);
  }
  renderTasks(filtered);
}));

// Search tasks
searchInput.addEventListener('input', () => {
  const query = searchInput.value.toLowerCase();
  const filtered = allTasks.filter(t => t.title.toLowerCase().includes(query));
  renderTasks(filtered);
});

// Sort tasks
sortSelect.addEventListener('change', () => {
  let sorted = [...allTasks];
  if (sortSelect.value === 'dueAsc') {
    sorted.sort((a, b) => (a.dueDate ? new Date(a.dueDate) : Infinity) - (b.dueDate ? new Date(b.dueDate) : Infinity));
  } else {
    sorted.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }
  renderTasks(sorted);
});

// Handle Edit / Status / Delete actions
taskListEl.addEventListener('click', async (e) => {
  const btn = e.target.closest('button');
  if (!btn) return;
  const id = btn.dataset.id;
  const action = btn.dataset.action;
  const task = allTasks.find(t => t.id === id);
  if (!task) return;

  if (action === 'edit') {
    // populate form
    editTaskId = task.id;
    taskTitle.value = task.title;
    taskDesc.value = task.description || '';
    assigneeSelect.value = task.assigneeId || '';
    taskDue.value = task.dueDate ? task.dueDate.slice(0, 16) : '';
    taskStatus.value = task.status;
    saveTaskBtn.textContent = 'Save Task';
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  if (action === 'status') {
    const newStatus = task.status === 'completed' ? 'pending' : 'completed';
    await fetch(API + '/api/tasks/' + id, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ status: newStatus })
    });
    await loadTasks();
  }

  if (action === 'delete') {
    if (!confirm('Delete this task?')) return;
    await fetch(API + '/api/tasks/' + id, { method: 'DELETE', headers: { ...authHeaders() } });
    await loadTasks();
  }
});


init();
