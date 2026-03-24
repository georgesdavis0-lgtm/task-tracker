'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import Link from 'next/link';
import {
  DndContext,
  DragOverlay,
  closestCenter,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  useDroppable,
  type DragStartEvent,
  type DragEndEvent,
  type DragOverEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { DevTask, PROJECTS, AREAS, STATUSES, STATUS_LABELS, FeatureSubmission, SUBMISSION_TYPE_LABELS, SUBMISSION_STATUS_LABELS, SUBMISSION_STATUSES } from '@/lib/types';

function getProjectById(id: string) {
  return PROJECTS.find((p) => p.id === id) || { id, name: id, color: '#64748b' };
}

function getTypeClass(type: string | null) {
  if (!type) return '';
  if (type.startsWith('Bug')) return 'type-bug';
  if (type === 'Feature Gap') return 'type-feature';
  if (type === 'Enhancement') return 'type-enhancement';
  return '';
}

// ── Board drag-and-drop components ──

function BoardTaskCard({ task, dragHandleProps, isOverlay }: {
  task: DevTask;
  dragHandleProps?: Record<string, unknown>;
  isOverlay?: boolean;
}) {
  const proj = getProjectById(task.project);
  return (
    <div
      className={`bg-gray-900 border border-gray-800 rounded-lg p-3 transition-colors priority-${task.priority} ${
        isOverlay ? 'shadow-2xl opacity-95 cursor-grabbing' : 'hover:border-gray-600 cursor-pointer'
      }`}
    >
      <div className="flex gap-2">
        <div
          {...dragHandleProps}
          className="board-drag-handle flex-shrink-0 mt-0.5 text-gray-600 hover:text-gray-400 transition-colors"
        >
          <svg width="10" height="16" viewBox="0 0 10 16" fill="currentColor">
            <circle cx="2.5" cy="2.5" r="1.5" />
            <circle cx="7.5" cy="2.5" r="1.5" />
            <circle cx="2.5" cy="8" r="1.5" />
            <circle cx="7.5" cy="8" r="1.5" />
            <circle cx="2.5" cy="13.5" r="1.5" />
            <circle cx="7.5" cy="13.5" r="1.5" />
          </svg>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between mb-1.5">
            <span
              className="text-xs px-1.5 py-0.5 rounded"
              style={{ background: `${proj.color}20`, color: proj.color }}
            >
              {proj.name}
            </span>
            <span className="text-xs text-gray-500">{task.sprint || ''}</span>
          </div>
          {task.area && <div className="text-xs text-gray-500 mb-1">{task.area}</div>}
          <div className="text-sm font-medium mb-2">{task.title}</div>
          <div className="flex items-center justify-between text-xs text-gray-500">
            <span>#{task.id}</span>
            <div className="flex items-center gap-2">
              {task.type && (
                <span className={`px-1.5 py-0.5 rounded ${getTypeClass(task.type)}`}>{task.type}</span>
              )}
              {task.assignee && <span>{task.assignee}</span>}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function SortableBoardCard({ task, onEdit }: { task: DevTask; onEdit: (task: DevTask) => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: task.id,
    data: { status: task.status },
  });
  const style = { transform: CSS.Transform.toString(transform), transition };
  return (
    <div
      ref={setNodeRef}
      style={style}
      className={isDragging ? 'opacity-30' : ''}
      onClick={() => !isDragging && onEdit(task)}
    >
      <BoardTaskCard task={task} dragHandleProps={{ ...attributes, ...listeners }} />
    </div>
  );
}

function DroppableBoardColumn({ status, label, tasks, onEdit }: {
  status: string;
  label: string;
  tasks: DevTask[];
  onEdit: (task: DevTask) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: status });
  const ids = useMemo(() => tasks.map((t) => t.id), [tasks]);

  return (
    <div className="min-w-[280px] flex-1">
      <div className="flex items-center justify-between mb-3 px-1">
        <h3 className="font-semibold text-sm text-gray-300">{label}</h3>
        <span className="text-xs bg-gray-800 px-2 py-0.5 rounded-full text-gray-400">{tasks.length}</span>
      </div>
      <SortableContext items={ids} strategy={verticalListSortingStrategy}>
        <div
          ref={setNodeRef}
          className={`space-y-2 min-h-[80px] rounded-lg p-1 transition-colors ${
            isOver ? 'bg-blue-900/20 ring-1 ring-blue-700/40 ring-inset' : ''
          }`}
        >
          {tasks.map((task) => (
            <SortableBoardCard key={task.id} task={task} onEdit={onEdit} />
          ))}
        </div>
      </SortableContext>
    </div>
  );
}

export default function Home() {
  const [tasks, setTasks] = useState<DevTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncStatus, setSyncStatus] = useState('Loading...');
  const [view, setView] = useState<'board' | 'list' | 'submissions'>('board');
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState({ sprint: 'all', priority: 'all', area: 'all', project: 'all', assignee: 'all' });
  const [sortField, setSortField] = useState('id');
  const [sortAsc, setSortAsc] = useState(true);
  const [modalTask, setModalTask] = useState<DevTask | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showArchived, setShowArchived] = useState<'active' | 'archived'>('active');
  const [archiving, setArchiving] = useState(false);
  const [allSprints, setAllSprints] = useState<string[]>([]);

  // Board drag-and-drop state
  const [activeId, setActiveId] = useState<string | null>(null);
  const dragOriginRef = useRef<string | null>(null);
  const tasksRef = useRef(tasks);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  // Submissions state
  const [submissions, setSubmissions] = useState<FeatureSubmission[]>([]);
  const [subFilter, setSubFilter] = useState('all');
  const [expandedSubId, setExpandedSubId] = useState<string | null>(null);
  const [subActioning, setSubActioning] = useState<string | null>(null);
  const [acceptingSubmission, setAcceptingSubmission] = useState<FeatureSubmission | null>(null);

  const loadSubmissions = useCallback(async () => {
    try {
      const res = await fetch('/api/submit');
      if (res.ok) {
        const data = await res.json();
        setSubmissions(Array.isArray(data) ? data : []);
      }
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    loadSubmissions();
    const interval = setInterval(loadSubmissions, 30000);
    return () => clearInterval(interval);
  }, [loadSubmissions]);

  const newSubmissionCount = useMemo(() => submissions.filter(s => s.status === 'new').length, [submissions]);

  const filteredSubmissions = useMemo(() => {
    if (subFilter === 'all') return submissions;
    return submissions.filter(s => s.status === subFilter);
  }, [submissions, subFilter]);

  async function updateSubmission(id: string, updates: Record<string, unknown>) {
    setSubActioning(id);
    try {
      const res = await fetch('/api/submit', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, ...updates }),
      });
      if (res.ok) await loadSubmissions();
    } catch { /* ignore */ }
    setSubActioning(null);
  }

  // Load tasks
  const loadTasks = useCallback(async () => {
    try {
      const param = showArchived === 'archived' ? '?archived_only=true' : '';
      const res = await fetch(`/api/tasks${param}`);
      if (!res.ok) throw new Error('Failed to load');
      const data = await res.json();
      setTasks(data);
      setSyncStatus('Connected');
    } catch {
      setSyncStatus('Error');
    } finally {
      setLoading(false);
    }
  }, [showArchived]);

  // Load all sprints (including from archived tasks) for the filter dropdown
  const loadAllSprints = useCallback(async () => {
    try {
      const res = await fetch('/api/tasks?include_archived=true');
      if (!res.ok) return;
      const data: DevTask[] = await res.json();
      const sprintSet = [...new Set(data.map((t) => t.sprint).filter(Boolean))]
        .sort((a, b) => {
          const na = parseInt((a as string).replace('Sprint ', ''), 10);
          const nb = parseInt((b as string).replace('Sprint ', ''), 10);
          return na - nb;
        }) as string[];
      setAllSprints(sprintSet);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    loadTasks();
    loadAllSprints();
    const interval = setInterval(loadTasks, 30000);
    return () => clearInterval(interval);
  }, [loadTasks, loadAllSprints]);

  // Filter tasks
  const areas = useMemo(
    () => [...new Set(tasks.map((t) => t.area).filter(Boolean))].sort() as string[],
    [tasks]
  );

  // Use allSprints (from all tasks including archived) so archived sprints remain in dropdown
  const sprints = useMemo(
    () => allSprints.length > 0 ? allSprints : [...new Set(tasks.map((t) => t.sprint).filter(Boolean))]
        .sort((a, b) => {
          const na = parseInt((a as string).replace('Sprint ', ''), 10);
          const nb = parseInt((b as string).replace('Sprint ', ''), 10);
          return na - nb;
        }) as string[],
    [tasks, allSprints]
  );

  const assignees = useMemo(
    () => [...new Set(tasks.map((t) => t.assignee).filter(Boolean))].sort() as string[],
    [tasks]
  );

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return tasks.filter((t) => {
      if (filters.sprint !== 'all' && t.sprint !== filters.sprint) return false;
      if (filters.priority !== 'all' && t.priority !== filters.priority) return false;
      if (filters.area !== 'all' && t.area !== filters.area) return false;
      if (filters.project !== 'all' && t.project !== filters.project) return false;
      if (filters.assignee !== 'all' && t.assignee !== filters.assignee) return false;
      if (
        q &&
        !t.title.toLowerCase().includes(q) &&
        !t.id.toLowerCase().includes(q) &&
        !(t.description || '').toLowerCase().includes(q)
      )
        return false;
      return true;
    });
  }, [tasks, search, filters]);

  // Stats
  const stats = useMemo(() => {
    const total = filtered.length;
    const done = filtered.filter((t) => t.status === 'done').length;
    const inProg = filtered.filter((t) => t.status === 'in-progress').length;
    const inReview = filtered.filter((t) => t.status === 'review').length;
    const blocked = filtered.filter((t) => t.status === 'blocked').length;
    const high = filtered.filter((t) => t.priority === 'high' && t.status !== 'done').length;
    const totalHours = filtered.reduce((s, t) => s + (t.est_hours || 0), 0);
    return { total, done, inProg, inReview, blocked, high, totalHours };
  }, [filtered]);

  // Sort for list view
  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      const va = String((a as unknown as Record<string, unknown>)[sortField] ?? '');
      const vb = String((b as unknown as Record<string, unknown>)[sortField] ?? '');
      const cmp = String(va).toLowerCase().localeCompare(String(vb).toLowerCase());
      return sortAsc ? cmp : -cmp;
    });
  }, [filtered, sortField, sortAsc]);

  // CRUD
  async function saveTask(task: DevTask) {
    setSaving(true);
    try {
      const res = await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(task),
      });
      if (!res.ok) {
        const err = await res.json();
        alert('Save failed: ' + err.error);
        return;
      }
      const saved = await res.json();
      setTasks((prev) => {
        const idx = prev.findIndex((t) => t.id === saved.id);
        if (idx >= 0) {
          const next = [...prev];
          next[idx] = saved;
          return next;
        }
        return [...prev, saved];
      });
      // If this was an accepted submission, link the task to it
      if (acceptingSubmission) {
        await updateSubmission(acceptingSubmission.id, {
          status: 'accepted',
          linked_task_id: saved.id,
        });
        setAcceptingSubmission(null);
      }
      setModalOpen(false);
      setSyncStatus('Saved');
      setTimeout(() => setSyncStatus('Connected'), 2000);
    } catch {
      alert('Save failed');
    } finally {
      setSaving(false);
    }
  }

  async function deleteTask(id: string) {
    if (!confirm('Delete this task?')) return;
    try {
      const res = await fetch(`/api/tasks?id=${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error();
      setTasks((prev) => prev.filter((t) => t.id !== id));
      setModalOpen(false);
      setSyncStatus('Deleted');
      setTimeout(() => setSyncStatus('Connected'), 2000);
    } catch {
      alert('Delete failed');
    }
  }

  // ── Board drag-and-drop handlers ──

  // Keep a ref to the latest tasks to avoid stale closure in event handlers
  useEffect(() => { tasksRef.current = tasks; }, [tasks]);

  function handleDragStart(event: DragStartEvent) {
    const id = String(event.active.id);
    setActiveId(id);
    const task = tasksRef.current.find((t) => t.id === id);
    dragOriginRef.current = task?.status ?? null;
  }

  function handleDragOver(event: DragOverEvent) {
    const { active, over } = event;
    if (!over) return;

    const activeTaskId = String(active.id);
    const overId = String(over.id);
    const current = tasksRef.current;
    const activeTask = current.find((t) => t.id === activeTaskId);
    if (!activeTask) return;

    // Determine target status: either a column id or another task's column
    let targetStatus: string | null = null;
    if ((STATUSES as readonly string[]).includes(overId)) {
      targetStatus = overId;
    } else {
      const overTask = current.find((t) => t.id === overId);
      if (overTask) targetStatus = overTask.status;
    }

    if (!targetStatus || activeTask.status === targetStatus) return;

    setTasks((prev) =>
      prev.map((t) => t.id === activeTaskId ? { ...t, status: targetStatus } : t)
    );
  }

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    const activeTaskId = String(active.id);
    const originalStatus = dragOriginRef.current;

    setActiveId(null);
    dragOriginRef.current = null;

    const task = tasksRef.current.find((t) => t.id === activeTaskId);
    if (!task || !originalStatus) return;

    // Revert if dropped outside any target
    if (!over) {
      setTasks((prev) =>
        prev.map((t) => t.id === activeTaskId ? { ...t, status: originalStatus } : t)
      );
      return;
    }

    // Nothing changed
    if (task.status === originalStatus) return;

    // Persist the new status
    try {
      const res = await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(task),
      });
      if (!res.ok) throw new Error('Failed to update task status');
      const saved = await res.json();
      setTasks((prev) => prev.map((t) => t.id === saved.id ? saved : t));
      setSyncStatus('Saved');
      setTimeout(() => setSyncStatus('Connected'), 2000);
    } catch {
      // Revert on failure
      setTasks((prev) =>
        prev.map((t) => t.id === activeTaskId ? { ...t, status: originalStatus } : t)
      );
      setSyncStatus('Error');
      setTimeout(() => setSyncStatus('Connected'), 2000);
    }
  }

  async function archiveTasks(ids: string[]) {
    if (ids.length === 0) return;
    setArchiving(true);
    try {
      const res = await fetch('/api/tasks/archive', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids }),
      });
      if (!res.ok) throw new Error();
      const result = await res.json();
      setTasks((prev) => prev.filter((t) => !ids.includes(t.id)));
      setSyncStatus(`Archived ${result.archived_count}`);
      setTimeout(() => setSyncStatus('Connected'), 2000);
    } catch {
      alert('Archive failed');
    } finally {
      setArchiving(false);
    }
  }

  async function unarchiveTasks(ids: string[]) {
    if (ids.length === 0) return;
    setArchiving(true);
    try {
      const res = await fetch('/api/tasks/unarchive', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids }),
      });
      if (!res.ok) throw new Error();
      const result = await res.json();
      setTasks((prev) => prev.filter((t) => !ids.includes(t.id)));
      setSyncStatus(`Unarchived ${result.unarchived_count}`);
      setTimeout(() => setSyncStatus('Connected'), 2000);
    } catch {
      alert('Unarchive failed');
    } finally {
      setArchiving(false);
    }
  }

  async function archiveSingleTask(id: string) {
    await archiveTasks([id]);
    setModalOpen(false);
  }

  async function unarchiveSingleTask(id: string) {
    await unarchiveTasks([id]);
    setModalOpen(false);
  }

  function handleSort(field: string) {
    if (sortField === field) setSortAsc(!sortAsc);
    else {
      setSortField(field);
      setSortAsc(true);
    }
  }

  function openNew() {
    setAcceptingSubmission(null);
    setModalTask(null);
    setModalOpen(true);
  }

  function openEdit(task: DevTask) {
    setAcceptingSubmission(null);
    setModalTask(task);
    setModalOpen(true);
  }

  function acceptSubmission(sub: FeatureSubmission) {
    // Map submission type to task type
    const typeMap: Record<string, string> = {
      bug: 'Bug Fix',
      feature: 'Feature Gap',
      improvement: 'Enhancement',
    };
    // Pre-fill a new task from the submission
    const prefilled: DevTask = {
      id: '',
      title: sub.title,
      description: sub.description + (sub.submitted_by_name ? `\n\nSubmitted by: ${sub.submitted_by_name}` : '') + (sub.submitted_by_email ? ` (${sub.submitted_by_email})` : ''),
      project: 'crm',
      priority: 'medium',
      status: 'todo',
      assignee: '',
      created: new Date().toISOString().split('T')[0],
      completed: '',
      sprint: 'Sprint 8',
      area: '',
      type: typeMap[sub.type] || 'Enhancement',
      blocked_by: '',
      est_hours: 0,
      notes: '',
      updated_at: '',
      archived: false,
    };
    setAcceptingSubmission(sub);
    setModalTask(prefilled);
    setModalOpen(true);
  }

  // Keyboard shortcuts
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setModalOpen(false);
      if (
        e.key === 'n' &&
        !modalOpen &&
        !['INPUT', 'TEXTAREA', 'SELECT'].includes((e.target as HTMLElement).tagName)
      ) {
        e.preventDefault();
        openNew();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [modalOpen]);

  // Active task for DragOverlay
  const activeTask = activeId ? tasks.find((t) => t.id === activeId) ?? null : null;

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-lg text-gray-400">Loading tasks...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-4 md:p-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-bold">RoofingLogic Task Tracker</h1>
          <span
            className={`text-xs px-2 py-1 rounded-full ${
              syncStatus === 'Connected'
                ? 'bg-green-900/50 text-green-400'
                : syncStatus === 'Error'
                  ? 'bg-red-900/50 text-red-400'
                  : 'bg-yellow-900/50 text-yellow-400'
            }`}
          >
            {syncStatus}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="text"
            placeholder="Search tasks..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-sm w-48 focus:outline-none focus:border-blue-500"
          />
          <button
            onClick={openNew}
            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-1.5 rounded-lg text-sm font-medium transition-colors"
          >
            + New Task
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="flex gap-1">
          {['board', 'list'].map((v) => (
            <button
              key={v}
              onClick={() => setView(v as 'board' | 'list' | 'submissions')}
              className={`px-3 py-1 rounded text-sm capitalize ${
                view === v && showArchived === 'active' ? 'bg-gray-700 text-white' : 'text-gray-400 hover:text-white'
              }`}
            >
              {v}
            </button>
          ))}
          <button
            onClick={() => setView('submissions')}
            className={`px-3 py-1 rounded text-sm flex items-center gap-1.5 ${
              view === 'submissions' ? 'bg-gray-700 text-white' : 'text-gray-400 hover:text-white'
            }`}
          >
            Submissions
            {newSubmissionCount > 0 && (
              <span className="bg-blue-600 text-white text-xs px-1.5 py-0.5 rounded-full min-w-[18px] text-center">
                {newSubmissionCount}
              </span>
            )}
          </button>
          <Link
            href="/queue"
            className="px-3 py-1 rounded text-sm text-gray-400 hover:text-white hover:bg-gray-700 transition-colors"
          >
            Queue
          </Link>
          <div className="h-4 w-px bg-gray-700" />
          <button
            onClick={() => {
              setShowArchived(showArchived === 'active' ? 'archived' : 'active');
              if (view === 'submissions') setView('board');
            }}
            className={`px-3 py-1 rounded text-sm flex items-center gap-1.5 ${
              showArchived === 'archived' ? 'bg-amber-600/30 text-amber-400' : 'text-gray-500 hover:text-gray-300'
            }`}
          >
            {showArchived === 'archived' ? '📦 Archived' : 'Archived'}
          </button>
        </div>
        {view !== 'submissions' && <>
        <div className="h-4 w-px bg-gray-700" />
        <select
          value={filters.sprint}
          onChange={(e) => setFilters((f) => ({ ...f, sprint: e.target.value }))}
          className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs"
        >
          <option value="all">All Sprints</option>
          {sprints.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <div className="flex gap-1">
          {['all', 'high', 'medium', 'low'].map((p) => (
            <button
              key={p}
              onClick={() => setFilters((f) => ({ ...f, priority: p }))}
              className={`px-2 py-1 rounded text-xs capitalize ${
                filters.priority === p
                  ? p === 'high'
                    ? 'bg-red-600 text-white'
                    : p === 'medium'
                      ? 'bg-yellow-600 text-white'
                      : p === 'low'
                        ? 'bg-green-600 text-white'
                        : 'bg-blue-600 text-white'
                  : 'bg-gray-800 text-gray-400 hover:text-white'
              }`}
            >
              {p === 'all' ? 'All Priority' : p}
            </button>
          ))}
        </div>
        <select
          value={filters.area}
          onChange={(e) => setFilters((f) => ({ ...f, area: e.target.value }))}
          className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs"
        >
          <option value="all">All Areas</option>
          {areas.map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </select>
        <select
          value={filters.project}
          onChange={(e) => setFilters((f) => ({ ...f, project: e.target.value }))}
          className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs"
        >
          <option value="all">All Projects</option>
          {PROJECTS.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <select
          value={filters.assignee}
          onChange={(e) => setFilters((f) => ({ ...f, assignee: e.target.value }))}
          className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs"
        >
          <option value="all">All Assignees</option>
          {assignees.map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </select>
        </>}
      </div>

      {/* Stats — hidden in submissions view */}
      {view !== 'submissions' && <div className="flex flex-wrap items-center gap-4 mb-5 text-sm text-gray-400">
        <span>
          <span className="text-white font-semibold">{stats.total}</span> total
        </span>
        <span>
          <span className="text-green-400 font-semibold">{stats.done}</span> done
        </span>
        <span>
          <span className="text-blue-400 font-semibold">{stats.inProg}</span> in progress
        </span>
        <span>
          <span className="text-purple-400 font-semibold">{stats.inReview}</span> in review
        </span>
        <span>
          <span className="text-red-400 font-semibold">{stats.blocked}</span> blocked
        </span>
        <span>
          <span className="text-orange-400 font-semibold">{stats.high}</span> high priority open
        </span>
        <span>
          <span className="text-white font-semibold">{stats.totalHours}</span> est. hours
        </span>
        {showArchived === 'active' && stats.done > 0 && (
          <>
            <div className="h-4 w-px bg-gray-700" />
            <button
              onClick={() => {
                const doneIds = filtered.filter((t) => t.status === 'done').map((t) => t.id);
                if (doneIds.length === 0) return;
                if (!confirm(`Archive ${doneIds.length} done task(s)?`)) return;
                archiveTasks(doneIds);
              }}
              disabled={archiving}
              className="text-xs px-2.5 py-1 rounded bg-amber-600/20 text-amber-400 hover:bg-amber-600/30 disabled:opacity-50 transition-colors"
            >
              {archiving ? 'Archiving...' : `Archive All Done (${stats.done})`}
            </button>
          </>
        )}
        {showArchived === 'active' && filtered.length > 0 && (
          <button
            onClick={() => {
              const ids = filtered.map((t) => t.id);
              if (!confirm(`Archive ${ids.length} filtered task(s)?`)) return;
              archiveTasks(ids);
            }}
            disabled={archiving}
            className="text-xs px-2.5 py-1 rounded bg-gray-700 text-gray-300 hover:bg-gray-600 disabled:opacity-50 transition-colors"
          >
            Archive Filtered ({filtered.length})
          </button>
        )}
        {showArchived === 'archived' && filtered.length > 0 && (
          <button
            onClick={() => {
              const ids = filtered.map((t) => t.id);
              if (!confirm(`Unarchive ${ids.length} task(s)?`)) return;
              unarchiveTasks(ids);
            }}
            disabled={archiving}
            className="text-xs px-2.5 py-1 rounded bg-blue-600/20 text-blue-400 hover:bg-blue-600/30 disabled:opacity-50 transition-colors"
          >
            Unarchive Filtered ({filtered.length})
          </button>
        )}
      </div>}

      {/* Board View */}
      {view === 'board' && (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragStart={handleDragStart}
          onDragOver={handleDragOver}
          onDragEnd={handleDragEnd}
        >
          <div className={`flex gap-4 overflow-x-auto pb-4${showArchived === 'archived' ? ' opacity-50' : ''}`}>
            {STATUSES.map((status) => {
              const col = filtered.filter((t) => t.status === status);
              return (
                <DroppableBoardColumn
                  key={status}
                  status={status}
                  label={STATUS_LABELS[status]}
                  tasks={col}
                  onEdit={openEdit}
                />
              );
            })}
          </div>
          <DragOverlay>
            {activeTask ? <BoardTaskCard task={activeTask} isOverlay /> : null}
          </DragOverlay>
        </DndContext>
      )}

      {/* List View */}
      {view === 'list' && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-gray-400 border-b border-gray-800">
                {[
                  { key: 'id', label: 'ID' },
                  { key: 'sprint', label: 'Sprint' },
                  { key: 'area', label: 'Area' },
                  { key: 'title', label: 'Title' },
                  { key: 'type', label: 'Type' },
                  { key: 'priority', label: 'Priority' },
                  { key: 'status', label: 'Status' },
                  { key: 'assignee', label: 'Assignee' },
                  { key: 'created', label: 'Created' },
                  { key: 'updated_at', label: 'Updated' },
                ].map((col) => (
                  <th
                    key={col.key}
                    onClick={() => handleSort(col.key)}
                    className="py-2 px-3 cursor-pointer hover:text-white text-xs font-medium"
                  >
                    {col.label} {sortField === col.key ? (sortAsc ? '▲' : '▼') : ''}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sorted.map((task) => (
                <tr
                  key={task.id}
                  onClick={() => openEdit(task)}
                  className={`border-b border-gray-800/50 hover:bg-gray-900 cursor-pointer${showArchived === 'archived' ? ' opacity-50' : ''}`}
                >
                  <td className="py-2 px-3 text-gray-500">#{task.id}</td>
                  <td className="py-2 px-3">{task.sprint || ''}</td>
                  <td className="py-2 px-3 whitespace-nowrap">{task.area || ''}</td>
                  <td className="py-2 px-3">{task.title}</td>
                  <td className="py-2 px-3">
                    {task.type && (
                      <span className={`px-1.5 py-0.5 rounded text-xs ${getTypeClass(task.type)}`}>
                        {task.type}
                      </span>
                    )}
                  </td>
                  <td className="py-2 px-3">
                    <span
                      className={
                        task.priority === 'high'
                          ? 'text-red-400'
                          : task.priority === 'medium'
                            ? 'text-yellow-400'
                            : 'text-green-400'
                      }
                    >
                      {task.priority}
                    </span>
                  </td>
                  <td className="py-2 px-3">
                    <span
                      className={`px-2 py-0.5 rounded text-xs status-${task.status}`}
                    >
                      {task.status}
                    </span>
                  </td>
                  <td className="py-2 px-3">{task.assignee || ''}</td>
                  <td className="py-2 px-3 text-gray-500 whitespace-nowrap">{task.created || ''}</td>
                  <td className="py-2 px-3 text-gray-500 whitespace-nowrap">
                    {task.updated_at ? new Date(task.updated_at).toLocaleDateString() : ''}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Submissions View */}
      {view === 'submissions' && (
        <div>
          {/* Submission filters */}
          <div className="flex flex-wrap gap-2 mb-4">
            {['all', ...SUBMISSION_STATUSES].map(s => (
              <button
                key={s}
                onClick={() => setSubFilter(s)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                  subFilter === s ? 'bg-gray-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-white'
                }`}
              >
                {s === 'all' ? 'All' : SUBMISSION_STATUS_LABELS[s]}
                {s === 'new' && newSubmissionCount > 0 && (
                  <span className="ml-1 bg-blue-600 text-white px-1.5 py-0.5 rounded-full text-xs">
                    {newSubmissionCount}
                  </span>
                )}
              </button>
            ))}
          </div>

          {filteredSubmissions.length === 0 ? (
            <div className="rounded-xl border border-gray-800 bg-gray-900 p-12 text-center text-gray-500">
              No submissions found.
            </div>
          ) : (
            <div className="space-y-3">
              {filteredSubmissions.map(sub => {
                const isExpanded = expandedSubId === sub.id;
                return (
                  <div key={sub.id} className="rounded-xl border border-gray-800 bg-gray-900 transition-colors hover:border-gray-700">
                    <button
                      type="button"
                      onClick={() => setExpandedSubId(isExpanded ? null : sub.id)}
                      className="flex w-full items-center gap-3 px-4 py-3 text-left"
                    >
                      <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${
                        sub.type === 'bug' ? 'type-bug' : sub.type === 'feature' ? 'type-feature' : 'type-enhancement'
                      }`}>
                        {SUBMISSION_TYPE_LABELS[sub.type]}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-sm font-medium">{sub.title}</span>
                      {sub.submitted_by_name && (
                        <span className="hidden shrink-0 text-xs text-gray-500 sm:inline">{sub.submitted_by_name}</span>
                      )}
                      <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${
                        sub.status === 'new' ? 'bg-blue-500/20 text-blue-400'
                        : sub.status === 'reviewed' ? 'bg-amber-500/20 text-amber-400'
                        : sub.status === 'accepted' ? 'bg-green-500/20 text-green-400'
                        : 'bg-zinc-500/20 text-zinc-400'
                      }`}>
                        {SUBMISSION_STATUS_LABELS[sub.status]}
                      </span>
                      <span className="shrink-0 text-xs text-gray-600">
                        {new Date(sub.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                      </span>
                      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"
                        className={`shrink-0 text-gray-600 transition-transform ${isExpanded ? 'rotate-180' : ''}`}>
                        <path d="M4 6l4 4 4-4" />
                      </svg>
                    </button>

                    {isExpanded && (
                      <div className="border-t border-gray-800 px-4 py-4 space-y-4">
                        <div>
                          <p className="mb-1 text-xs font-medium uppercase tracking-wide text-gray-500">Description</p>
                          <p className="whitespace-pre-wrap text-sm text-gray-300">{sub.description}</p>
                        </div>

                        {(sub.submitted_by_name || sub.submitted_by_email || sub.submitted_by_phone) && (
                          <div>
                            <p className="mb-1 text-xs font-medium uppercase tracking-wide text-gray-500">Contact</p>
                            <div className="flex flex-wrap gap-4 text-sm text-gray-400">
                              {sub.submitted_by_name && <span>{sub.submitted_by_name}</span>}
                              {sub.submitted_by_email && (
                                <a href={`mailto:${sub.submitted_by_email}`} className="text-blue-400 hover:underline">
                                  {sub.submitted_by_email}
                                </a>
                              )}
                              {sub.submitted_by_phone && <span>{sub.submitted_by_phone}</span>}
                            </div>
                          </div>
                        )}

                        {sub.image_urls && sub.image_urls.length > 0 && (
                          <div>
                            <p className="mb-1 text-xs font-medium uppercase tracking-wide text-gray-500">Screenshots</p>
                            <div className="flex gap-2">
                              {sub.image_urls.map((url: string, i: number) => (
                                <a key={i} href={url} target="_blank" rel="noopener noreferrer">
                                  <img
                                    src={url}
                                    alt={`Attachment ${i + 1}`}
                                    className="h-24 w-24 rounded-lg border border-gray-700 object-cover hover:border-blue-500 transition-colors"
                                  />
                                </a>
                              ))}
                            </div>
                          </div>
                        )}

                        {sub.linked_task_id && (
                          <div className="text-xs text-gray-500">
                            Linked to task: <span className="text-blue-400">{sub.linked_task_id}</span>
                          </div>
                        )}

                        <div className="flex flex-wrap gap-2 pt-1">
                          {sub.status === 'new' && (
                            <>
                              <button
                                onClick={() => updateSubmission(sub.id, { status: 'reviewed' })}
                                disabled={subActioning === sub.id}
                                className="rounded-lg bg-amber-600 hover:bg-amber-700 px-4 py-2 text-xs font-medium text-white transition-colors disabled:opacity-50"
                              >
                                {subActioning === sub.id ? 'Updating...' : 'Mark Reviewed'}
                              </button>
                              <button
                                onClick={() => acceptSubmission(sub)}
                                disabled={subActioning === sub.id}
                                className="rounded-lg bg-green-600 hover:bg-green-700 px-4 py-2 text-xs font-medium text-white transition-colors disabled:opacity-50"
                              >
                                Accept
                              </button>
                              <button
                                onClick={() => updateSubmission(sub.id, { status: 'declined' })}
                                disabled={subActioning === sub.id}
                                className="rounded-lg bg-zinc-600 hover:bg-zinc-700 px-4 py-2 text-xs font-medium text-white transition-colors disabled:opacity-50"
                              >
                                Decline
                              </button>
                            </>
                          )}
                          {sub.status === 'reviewed' && (
                            <>
                              <button
                                onClick={() => acceptSubmission(sub)}
                                disabled={subActioning === sub.id}
                                className="rounded-lg bg-green-600 hover:bg-green-700 px-4 py-2 text-xs font-medium text-white transition-colors disabled:opacity-50"
                              >
                                Accept
                              </button>
                              <button
                                onClick={() => updateSubmission(sub.id, { status: 'declined' })}
                                disabled={subActioning === sub.id}
                                className="rounded-lg bg-zinc-600 hover:bg-zinc-700 px-4 py-2 text-xs font-medium text-white transition-colors disabled:opacity-50"
                              >
                                Decline
                              </button>
                            </>
                          )}
                          {sub.status === 'declined' && (
                            <button
                              onClick={() => updateSubmission(sub.id, { status: 'new' })}
                              disabled={subActioning === sub.id}
                              className="rounded-lg bg-blue-600 hover:bg-blue-700 px-4 py-2 text-xs font-medium text-white transition-colors disabled:opacity-50"
                            >
                              Reopen
                            </button>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Modal */}
      {modalOpen && (
        <TaskModal
          task={modalTask}
          saving={saving}
          sprints={sprints}
          onSave={saveTask}
          onDelete={deleteTask}
          onClose={() => { setModalOpen(false); setAcceptingSubmission(null); }}
          isAccepting={!!acceptingSubmission}
          showArchived={showArchived}
          onArchive={archiveSingleTask}
          onUnarchive={unarchiveSingleTask}
          archiving={archiving}
        />
      )}
    </div>
  );
}

// ------- Task Modal -------

function TaskModal({
  task,
  saving,
  sprints,
  onSave,
  onDelete,
  onClose,
  isAccepting,
  showArchived,
  onArchive,
  onUnarchive,
  archiving,
}: {
  task: DevTask | null;
  saving: boolean;
  sprints: string[];
  onSave: (t: DevTask) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
  isAccepting?: boolean;
  showArchived: 'active' | 'archived';
  onArchive: (id: string) => void;
  onUnarchive: (id: string) => void;
  archiving: boolean;
}) {
  const [addingSprint, setAddingSprint] = useState(false);
  const [newSprintNum, setNewSprintNum] = useState('');
  const [form, setForm] = useState<DevTask>(
    task || {
      id: '',
      title: '',
      description: '',
      project: 'crm',
      priority: 'medium',
      status: 'todo',
      assignee: '',
      created: new Date().toISOString().split('T')[0],
      completed: '',
      sprint: 'Sprint 8',
      area: 'Calc Engine',
      type: 'Enhancement',
      blocked_by: '',
      est_hours: 0,
      notes: '',
      updated_at: '',
      archived: false,
    }
  );

  function set(field: string, value: string | number) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const data = { ...form };
    if (!data.id) {
      data.id =
        'S' +
        (data.sprint || '').replace('Sprint ', '') +
        '-' +
        String(Date.now()).slice(-3);
    }
    onSave(data);
  }

  return (
    <div
      className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <form
        onSubmit={handleSubmit}
        className="bg-gray-900 border border-gray-700 rounded-xl w-full max-w-lg max-h-[90vh] overflow-y-auto p-6"
      >
        <h2 className="text-lg font-semibold mb-4">
          {isAccepting ? 'Accept Submission → Create Task' : task && task.id ? 'Edit Task' : 'New Task'}
        </h2>

        <div className="space-y-3">
          <div>
            <label className="block text-xs text-gray-400 mb-1">Title *</label>
            <input
              required
              autoFocus
              value={form.title}
              onChange={(e) => set('title', e.target.value)}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
            />
          </div>

          <div>
            <label className="block text-xs text-gray-400 mb-1">Description</label>
            <textarea
              value={form.description || ''}
              onChange={(e) => set('description', e.target.value)}
              rows={3}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500 resize-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-400 mb-1">Project</label>
              <select
                value={form.project}
                onChange={(e) => set('project', e.target.value)}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm"
              >
                {PROJECTS.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Sprint</label>
              {addingSprint ? (
                <div className="flex gap-1">
                  <input
                    type="number"
                    min={1}
                    placeholder="#"
                    value={newSprintNum}
                    onChange={(e) => setNewSprintNum(e.target.value)}
                    className="w-16 bg-gray-800 border border-gray-700 rounded-lg px-2 py-2 text-sm focus:outline-none focus:border-blue-500"
                    autoFocus
                  />
                  <button
                    type="button"
                    onClick={() => {
                      if (newSprintNum) {
                        set('sprint', `Sprint ${newSprintNum}`);
                        setAddingSprint(false);
                        setNewSprintNum('');
                      }
                    }}
                    className="bg-blue-600 hover:bg-blue-700 text-white px-2 py-1 rounded-lg text-xs"
                  >
                    Add
                  </button>
                  <button
                    type="button"
                    onClick={() => { setAddingSprint(false); setNewSprintNum(''); }}
                    className="text-gray-400 hover:text-white px-1 text-xs"
                  >
                    ✕
                  </button>
                </div>
              ) : (
                <div className="flex gap-1">
                  <select
                    value={form.sprint || ''}
                    onChange={(e) => set('sprint', e.target.value)}
                    className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm"
                  >
                    <option value="">Select sprint...</option>
                    {sprints.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                    {form.sprint && !sprints.includes(form.sprint) && (
                      <option value={form.sprint}>{form.sprint}</option>
                    )}
                  </select>
                  <button
                    type="button"
                    onClick={() => setAddingSprint(true)}
                    className="bg-gray-700 hover:bg-gray-600 text-white px-2 py-1 rounded-lg text-xs whitespace-nowrap"
                  >
                    + New
                  </button>
                </div>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-400 mb-1">Area</label>
              <select
                value={form.area || ''}
                onChange={(e) => set('area', e.target.value)}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm"
              >
                <option value="">Select area...</option>
                {AREAS.map((a) => (
                  <option key={a} value={a}>
                    {a}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Type</label>
              <select
                value={form.type || ''}
                onChange={(e) => set('type', e.target.value)}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm"
              >
                {['Enhancement', 'Bug Fix', 'Bug (Critical)', 'Feature Gap', 'Refactor', 'Documentation'].map(
                  (t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  )
                )}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs text-gray-400 mb-1">Priority</label>
              <select
                value={form.priority}
                onChange={(e) => set('priority', e.target.value)}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm"
              >
                {['high', 'medium', 'low'].map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Status</label>
              <select
                value={form.status}
                onChange={(e) => set('status', e.target.value)}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm"
              >
                {STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {STATUS_LABELS[s]}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Est. Hours</label>
              <input
                type="number"
                min={0}
                step={0.5}
                value={form.est_hours}
                onChange={(e) => set('est_hours', parseFloat(e.target.value) || 0)}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-400 mb-1">Assignee</label>
              <input
                value={form.assignee}
                onChange={(e) => set('assignee', e.target.value)}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Blocked By</label>
              <input
                value={form.blocked_by}
                onChange={(e) => set('blocked_by', e.target.value)}
                placeholder="Task ID"
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs text-gray-400 mb-1">Notes</label>
            <textarea
              value={form.notes}
              onChange={(e) => set('notes', e.target.value)}
              rows={2}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500 resize-none"
            />
          </div>
        </div>

        <div className="flex items-center justify-between mt-6">
          <div className="flex items-center gap-3">
            {task && task.id && !isAccepting && (
              <button
                type="button"
                onClick={() => onDelete(task.id)}
                className="text-red-400 hover:text-red-300 text-sm"
              >
                Delete
              </button>
            )}
            {task && task.id && !isAccepting && showArchived === 'active' && (
              <button
                type="button"
                onClick={() => onArchive(task.id)}
                disabled={archiving}
                className="text-amber-400 hover:text-amber-300 text-sm disabled:opacity-50"
              >
                {archiving ? 'Archiving...' : 'Archive'}
              </button>
            )}
            {task && task.id && showArchived === 'archived' && (
              <button
                type="button"
                onClick={() => onUnarchive(task.id)}
                disabled={archiving}
                className="text-blue-400 hover:text-blue-300 text-sm disabled:opacity-50"
              >
                {archiving ? 'Unarchiving...' : 'Unarchive'}
              </button>
            )}
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm text-gray-400 hover:text-white"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white px-4 py-2 rounded-lg text-sm font-medium"
            >
              {saving ? 'Saving...' : isAccepting ? 'Accept & Create' : task && task.id ? 'Update' : 'Create'}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
