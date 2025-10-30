// script.js - Updated with Overdue Logic

const STORAGE_KEY = "tm_tasks_v2";
let tasks = [];

const el = (id) => document.getElementById(id);
const qs = (sel) => document.querySelector(sel);

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function load() {
  try {
    tasks = JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
  } catch {
    tasks = [];
  }
}

function save() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
}

function escapeHtml(s) {
  return String(s).replace(/[&<>\"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

/**
 * Checks if a task is due within the next N hours (and not yet past due).
 * @param {string} dateString - The task's due date string.
 * @param {number} hours - The threshold in hours.
 */
function withinHours(dateString, hours) {
  if (!dateString) return false;
  const diff = new Date(dateString) - new Date();
  return diff <= hours * 3600 * 1000 && diff >= 0;
}

/**
 * Checks if a task is past its due date.
 * @param {string} dateString - The task's due date string.
 */
function isOverdue(dateString) {
    if (!dateString) return false;
    // Check if the due date is in the past AND the task is not completed
    return new Date(dateString) < new Date();
}

function render() {
  const list = el("taskList");
  list.innerHTML = "";
  const filter = document.querySelector(".filter-tabs .chip.active")?.dataset.filter || "all";
  const q = el("search").value.trim().toLowerCase();
  const sort = el("sort").value;

  let out = tasks.slice();
  if (filter === "active") out = out.filter((t) => !t.completed && !isOverdue(t.dueDate));
  if (filter === "completed") out = out.filter((t) => t.completed);
  // Add Overdue tasks to the 'Active' filter view if not completed
  if (filter === "all") out = out.filter(t => true); 
  if (filter === "dueSoon") out = out.filter((t) => t.dueDate && withinHours(t.dueDate, 24) && !t.completed);

  if (q) out = out.filter((t) => t.title.toLowerCase().includes(q) || t.description.toLowerCase().includes(q));

  out.sort((a, b) => {
    if (sort === "newest") return b.createdAt - a.createdAt;
    if (sort === "oldest") return a.createdAt - b.createdAt;
    // Handle null/empty due dates in sorting
    const dateA = a.dueDate ? new Date(a.dueDate) : (sort === 'dueAsc' ? new Date(8640000000000000) : new Date(-8640000000000000));
    const dateB = b.dueDate ? new Date(b.dueDate) : (sort === 'dueAsc' ? new Date(8640000000000000) : new Date(-8640000000000000));
    if (sort === "dueAsc") return dateA - dateB;
    if (sort === "dueDesc") return dateB - dateA;
    return 0;
  });

  if (out.length === 0) {
    list.innerHTML = `<div style="padding:25px;">No tasks found.</div>`;
    return;
  }

  for (const t of out) {
    const li = document.createElement("li");
    
    li.className = "task";
    if (t.completed) {
        li.classList.add("completed");
    } else if (t.dueDate && isOverdue(t.dueDate)) {
        // ⭐️ NEW: Add overdue class
        li.classList.add("overdue");
    } else if (t.dueDate && withinHours(t.dueDate, 24)) {
        li.classList.add("due-soon");
    }

    // Determine the status text
    let statusText = '';
    if (t.completed) {
        statusText = '<span style="color:var(--success);font-size:0.8rem;margin-left:8px;">(Completed)</span>';
    } else if (t.dueDate && isOverdue(t.dueDate)) {
        // ⭐️ NEW: Display Overdue status
        statusText = '<span style="color:var(--danger);font-size:0.8rem;margin-left:8px;font-weight:700;">(OVERDUE)</span>';
    }


    li.innerHTML = `
      <div class="task-title">
        <span class="task-title-text">${escapeHtml(t.title)}</span>
        ${statusText}
      </div>
      <div class="task-desc">${escapeHtml(t.description)}</div>
      <div class="meta">
        <div class="badge">Created: ${new Date(t.createdAt).toLocaleString()}</div>
        ${t.dueDate ? `<div class="badge">Due: ${new Date(t.dueDate).toLocaleString()}</div>` : ""}
      </div>
      <div class="actions">
        <button class="icon-btn btn-toggle" data-id="${t.id}" data-action="toggle">${t.completed ? "Undo" : "Done"}</button>
        <button class="icon-btn btn-edit" data-id="${t.id}" data-action="edit">Edit</button>
        <button class="icon-btn btn-delete" data-id="${t.id}" data-action="delete">Delete</button>
      </div>
    `;
    list.appendChild(li);
  }
}

const form = el("taskForm");
form.addEventListener("submit", (e) => {
  e.preventDefault();
  const id = el("taskId").value;
  const title = el("title").value.trim();
  const description = el("description").value.trim();
  const dueDate = el("dueDate").value ? el("dueDate").value + ':00' : null; 

  if (!title) {
    alert("Please enter a title");
    return;
  }

  if (id) {
    const idx = tasks.findIndex((t) => t.id === id);
    if (idx > -1) {
      tasks[idx].title = title;
      tasks[idx].description = description;
      tasks[idx].dueDate = dueDate;
      // Reset reminded status when editing due date
      tasks[idx].reminded = false; 
    }
  } else {
    tasks.push({ id: uid(), title, description, dueDate, completed: false, createdAt: Date.now(), reminded: false });
  }

  save();
  render();
  form.reset();
  el("taskId").value = "";
  el("saveBtn").textContent = "Add Task";
});

el("clearBtn").addEventListener("click", () => {
  form.reset();
  el("taskId").value = "";
  el("saveBtn").textContent = "Add Task";
});

el("taskList").addEventListener("click", (e) => {
  const btn = e.target.closest("button");
  if (!btn) return;
  const id = btn.dataset.id;
  const action = btn.dataset.action;
  const idx = tasks.findIndex((t) => t.id === id);
  if (idx === -1) return;

  if (action === "toggle") {
    tasks[idx].completed = !tasks[idx].completed;
  } else if (action === "edit") {
    const t = tasks[idx];
    el("taskId").value = t.id;
    el("title").value = t.title;
    el("description").value = t.description;
    el("dueDate").value = t.dueDate ? t.dueDate.slice(0, 16) : "";
    el("saveBtn").textContent = "Save Task";
  } else if (action === "delete") {
    if (confirm("Delete this task?")) {
      tasks.splice(idx, 1);
    }
  }

  save();
  render();
});

document.querySelectorAll(".filter-tabs .chip").forEach((c) => 
  c.addEventListener("click", () => {
    document.querySelectorAll(".filter-tabs .chip").forEach((x) => x.classList.remove("active"));
    c.classList.add("active");
    render();
  })
);

el("search").addEventListener("input", render);
el("sort").addEventListener("change", render);

function exportTasks() {
  const blob = new Blob([JSON.stringify(tasks, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "tasks_backup.json";
  a.click();
  URL.revokeObjectURL(url);
}

function importTasks(file) {
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const importedTasks = JSON.parse(e.target.result);
      if (Array.isArray(importedTasks)) {
        tasks = importedTasks;
        save();
        render();
        alert("Tasks imported successfully!");
      } else {
        throw new Error("Invalid format");
      }
    } catch {
      alert("Invalid JSON file format!");
    }
  };
  reader.readAsText(file);
}

el("exportBtn").addEventListener("click", exportTasks);
el("importBtn").addEventListener("click", () => el("importFile").click());
el("importFile").addEventListener("change", (e) => importTasks(e.target.files[0]));

el("clearAllBtn").addEventListener("click", () => {
  if (confirm("Are you sure you want to delete all tasks? This action cannot be undone.")) {
    tasks = [];
    save();
    render();
  }
});

el("themeToggle").addEventListener("click", () => {
  const current = document.body.dataset.theme === "dark" ? "light" : "dark";
  document.body.dataset.theme = current;
  el("themeToggle").textContent = current === "dark" ? "☀️" : "🌙";
  localStorage.setItem("theme", current);
});

function checkReminders() {
  const now = new Date();
  let reminderCount = 0;
  for (const t of tasks) {
    if (t.reminded || !t.dueDate || t.completed) continue;
    const diff = new Date(t.dueDate) - now;
    
    // Check if task is due within the next hour (60 minutes)
    if (diff <= 60 * 60 * 1000 && diff > 0) {
      alert(`⏰ Reminder: Task "${t.title}" is due in less than 1 hour!`);
      t.reminded = true;
      reminderCount++;
    }
  }
  if (reminderCount > 0) {
    save(); 
    render();
  }
}

window.addEventListener("load", () => {
  load();
  render();
  const savedTheme = localStorage.getItem("theme") || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  document.body.dataset.theme = savedTheme;
  el("themeToggle").textContent = savedTheme === "dark" ? "☀️" : "🌙";
  
  setInterval(checkReminders, 60000); 
});