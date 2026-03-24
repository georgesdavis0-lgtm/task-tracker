'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  DndContext,
  DragOverlay,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragEndEvent,
  type DragOverEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import Link from 'next/link';
import { DevTask, PROJECTS, AREAS, STATUSES } from '@/lib/types';
import './queue.css';

// ── Constants ──

const ASSIGNEES = ['George', 'Will'] as const;
const STORAGE_KEY = 'queue-order';

const STATUS_SORT: Record<string, number> = {
  'in-progress': 0, review: 1, todo: 2, blocked: 3,
};
const PRIORITY_SORT: Record<string, number> = {
  high: 0, medium: 1, low: 2,
};
const TYPE_SORT: Record<string, number> = {
  'Bug (Critical)': 0, 'Bug - Critical': 0,
  'Bug - High': 1,
  'Bug Fix': 2, 'Bug - Medium': 2,
  'Feature Gap': 3,
  'Enhancement': 4,
  'Refactor': 5,
  'Documentation': 6,
  'Discovery': 7,
};

const STATUS_LABELS: Record<string, string> = {
  todo: 'To Do', 'in-progress': 'In Progress', review: 'In Review', blocked: 'Blocked', done: 'Done',
};

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

function defaultSort(a: DevTask, b: DevTask): number {
  const s = (STATUS_SORT[a.status] ?? 9) - (STATUS_SORT[b.status] ?? 9);
  if (s !== 0) return s;
  const p = (PRIORITY_SORT[a.priority] ?? 9) - (PRIORITY_SORT[b.priority] ?? 9);
  if (p !== 0) return p;
  const t = (TYPE_SORT[a.type ?? ''] ?? 9) - (TYPE_SORT[b.type ?? ''] ?? 9);
  return t;
}

// ── localStorage helpers ──

function loadStoredOrder(): Record<string, string[]> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}

function saveStoredOrder(order: Record<string, string[]>) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(order));
}

function mergeWithStoredOrder(tasks: DevTask[], storedIds: string[]): DevTask[] {
  const taskMap = new Map(tasks.map(t => [t.id, t]));
  const ordered: DevTask[] = [];
  const seen = new Set<string>();

  for (const id of storedIds) {
    const task = taskMap.get(id);
    if (task) { ordered.push(task); seen.add(id); }
  }

  const remaining = tasks.filter(t => !seen.has(t.id)).sort(defaultSort);
  return [...ordered, ...remaining];
}

// ── Toast Component ──

function Toast({ message, type, onDismiss }: { message: string; type: 'success' | 'error'; onDismiss: () => void }) {
  const [exiting, setExiting] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setExiting(true), 2700);
    const t2 = setTimeout(onDismiss, 3000);
    return () => { clearTimeout(t); clearTimeout(t2); };
  }, [onDismiss]);

  return (
    <div className={`fixed top-4 right-4 z-50 rounded-lg px-4 py-3 text-sm font-medium shadow-lg ${
      exiting ? 'queue-toast-exit' : 'queue-toast'
    } ${type === 'success' ? 'bg-green-600 text-white' : 'bg-red-600 text-white'}`}>
      {message}
    </div>
  );
}

// ── Sortable Card ──

function SortableQueueCard({ task, onQuickAction, onClick }: {
  task: DevTask;
  onQuickAction: (taskId: string, action: 'start' | 'done' | 'block') => void;
  onClick: (task: DevTask) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: task.id,
    data: { task },
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div ref={setNodeRef} style={style} className={isDragging ? 'queue-card-dragging' : ''}>
      <QueueCard task={task} onQuickAction={onQuickAction} onClick={onClick} dragHandleProps={{ ...attributes, ...listeners }} />
    </div>
  );
}

// ── Queue Card ──

function QueueCard({ task, onQuickAction, onClick, dragHandleProps, isOverlay }: {
  task: DevTask;
  onQuickAction: (taskId: string, action: 'start' | 'done' | 'block') => void;
  onClick?: (task: DevTask) => void;
  dragHandleProps?: Record<string, unknown>;
  isOverlay?: boolean;
}) {
  const proj = getProjectById(task.project);

  return (
    <div
      className={`queue-card bg-gray-900 border border-gray-800 rounded-lg p-3 priority-${task.priority} ${
        isOverlay ? 'queue-drag-overlay' : 'hover:border-gray-600 cursor-pointer'
      } transition-colors relative group`}
      onClick={() => !isOverlay && onClick?.(task)}
    >
      <div className="flex gap-2">
        {/* Drag handle */}
        <div
          {...dragHandleProps}
          className="queue-drag-handle flex-shrink-0 mt-0.5 text-gray-600 hover:text-gray-400 transition-colors"
        >
          <svg width="12" height="20" viewBox="0 0 12 20" fill="currentColor">
            <circle cx="3" cy="3" r="1.5" />
            <circle cx="9" cy="3" r="1.5" />
            <circle cx="3" cy="10" r="1.5" />
            <circle cx="9" cy="10" r="1.5" />
            <circle cx="3" cy="17" r="1.5" />
            <circle cx="9" cy="17" r="1.5" />
          </svg>
        </div>

        <div className="flex-1 min-w-0">
          {/* Top row: project + sprint */}
          <div className="flex items-center justify-between mb-1">
            <span
              className="text-xs px-1.5 py-0.5 rounded"
              style={{ background: `${proj.color}20`, color: proj.color }}
            >
              {proj.name}
            </span>
            <span className="text-xs text-gray-500">{task.sprint || ''}</span>
          </div>

          {/* Area */}
          {task.area && <div className="text-xs text-gray-500 mb-1">{task.area}</div>}

          {/* Title */}
          <div className="text-sm font-medium mb-2 line-clamp-2" title={task.title}>
            {task.title}
          </div>

          {/* Bottom row: ID, type, status, est hours */}
          <div className="flex items-center flex-wrap gap-1.5 text-xs text-gray-500">
            <span>#{task.id}</span>
            {task.type && (
              <span className={`px-1.5 py-0.5 rounded ${getTypeClass(task.type)}`}>
                {task.type}
              </span>
            )}
            <span className={`status-${task.status} px-1.5 py-0.5 rounded`}>
              {STATUS_LABELS[task.status] || task.status}
            </span>
            {task.est_hours > 0 && (
              <span className="text-gray-400">{task.est_hours}h</span>
            )}
          </div>

          {/* Blocked indicator */}
          {task.blocked_by && (
            <div className="mt-1.5 text-xs text-red-400 flex items-center gap-1">
              <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
                <path d="M8 1a7 7 0 100 14A7 7 0 008 1zM4.5 7.5h7v1h-7v-1z" />
              </svg>
              Blocked by {task.blocked_by}
            </div>
          )}
        </div>
      </div>

      {/* Quick actions - visible on hover */}
      {!isOverlay && (
        <div className="queue-card-actions absolute top-2 right-2 flex gap-1">
          {task.status !== 'in-progress' && (
            <button
              onClick={(e) => { e.stopPropagation(); onQuickAction(task.id, 'start'); }}
              title="Start"
              className="w-6 h-6 flex items-center justify-center rounded bg-blue-600/80 hover:bg-blue-600 text-white text-xs transition-colors"
            >
              ▶
            </button>
          )}
          {task.status !== 'done' && (
            <button
              onClick={(e) => { e.stopPropagation(); onQuickAction(task.id, 'done'); }}
              title="Mark Done"
              className="w-6 h-6 flex items-center justify-center rounded bg-green-600/80 hover:bg-green-600 text-white text-xs transition-colors"
            >
              ✓
            </button>
          )}
          {task.status !== 'blocked' && (
            <button
              onClick={(e) => { e.stopPropagation(); onQuickAction(task.id, 'block'); }}
              title="Block"
              className="w-6 h-6 flex items-center justify-center rounded bg-red-600/80 hover:bg-red-600 text-white text-xs transition-colors"
            >
              ✕
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ── Queue Column ──

function QueueColumn({ assignee, tasks, onQuickAction, onTaskClick }: {
  assignee: string;
  tasks: DevTask[];
  onQuickAction: (taskId: string, action: 'start' | 'done' | 'block') => void;
  onTaskClick: (task: DevTask) => void;
}) {
  const totalHours = tasks.reduce((s, t) => s + (t.est_hours || 0), 0);
  const inProgress = tasks.filter(t => t.status === 'in-progress').length;
  const ids = useMemo(() => tasks.map(t => t.id), [tasks]);

  return (
    <div className="flex-1 min-w-[320px]">
      <div className="flex items-center justify-between mb-4 px-1">
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-semibold">{assignee}&apos;s Queue</h2>
          <span className="text-xs bg-gray-800 px-2 py-0.5 rounded-full text-gray-400">
            {tasks.length}
          </span>
        </div>
        <div className="flex items-center gap-3 text-xs text-gray-500">
          {inProgress > 0 && (
            <span><span className="text-blue-400 font-medium">{inProgress}</span> active</span>
          )}
          <span><span className="text-white font-medium">{totalHours}</span>h total</span>
        </div>
      </div>

      <SortableContext items={ids} strategy={verticalListSortingStrategy}>
        <div className="space-y-2 min-h-[100px]" data-column={assignee}>
          {tasks.length === 0 && (
            <div className="text-center text-gray-600 text-sm py-8 border border-dashed border-gray-800 rounded-lg">
              No tasks assigned
            </div>
          )}
          {tasks.map(task => (
            <SortableQueueCard key={task.id} task={task} onQuickAction={onQuickAction} onClick={onTaskClick} />
          ))}
        </div>
      </SortableContext>
    </div>
  );
}

// ── Main Page ──

export default function QueuePage() {
  const [allTasks, setAllTasks] = useState<DevTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncStatus, setSyncStatus] = useState('Loading...');
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [queueOrder, setQueueOrder] = useState<Record<string, string[]>>({});
  const [activeId, setActiveId] = useState<string | null>(null);
  const [editingTask, setEditingTask] = useState<DevTask | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [addToQueueOpen, setAddToQueueOpen] = useState(false);
  const [addToQueueSearch, setAddToQueueSearch] = useState('');
  const orderInitialized = useRef(false);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  // ── Fetch tasks ──
  const loadTasks = useCallback(async () => {
    try {
      const res = await fetch('/api/tasks');
      if (!res.ok) throw new Error('Failed to load');
      const data = await res.json();
      setAllTasks(data);
      setSyncStatus('Connected');
    } catch {
      setSyncStatus('Error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadTasks();
    const interval = setInterval(loadTasks, 30000);
    return () => clearInterval(interval);
  }, [loadTasks]);

  // ── Load stored order once ──
  useEffect(() => {
    if (!orderInitialized.current) {
      setQueueOrder(loadStoredOrder());
      orderInitialized.current = true;
    }
  }, []);

  // ── Derive columns ──
  const columns = useMemo(() => {
    const result: Record<string, DevTask[]> = {};
    for (const name of ASSIGNEES) {
      const assigneeTasks = allTasks.filter(
        t => t.assignee === name && t.status !== 'done' && !t.archived
      );
      result[name] = mergeWithStoredOrder(assigneeTasks, queueOrder[name] || []);
    }
    return result;
  }, [allTasks, queueOrder]);

  // ── Sprints for modal ──
  const sprints = useMemo(
    () =>
      [...new Set(allTasks.map(t => t.sprint).filter(Boolean))]
        .sort((a, b) => {
          const na = parseInt((a as string).replace('Sprint ', ''), 10);
          const nb = parseInt((b as string).replace('Sprint ', ''), 10);
          return na - nb;
        }) as string[],
    [allTasks]
  );

  // ── Unassigned tasks for "Add to Queue" ──
  const unassignedTasks = useMemo(() => {
    const q = addToQueueSearch.toLowerCase();
    return allTasks.filter(t =>
      t.status !== 'done' &&
      !t.archived &&
      !ASSIGNEES.includes(t.assignee as typeof ASSIGNEES[number]) &&
      (!q || t.title.toLowerCase().includes(q) || t.id.toLowerCase().includes(q))
    );
  }, [allTasks, addToQueueSearch]);

  // ── Task click → open edit modal ──
  function handleTaskClick(task: DevTask) {
    setEditingTask(task);
    setModalOpen(true);
  }

  // ── Save from modal ──
  async function handleModalSave(task: DevTask) {
    setSaving(true);
    const ok = await saveTask(task);
    setSaving(false);
    if (ok) {
      setModalOpen(false);
      setEditingTask(null);
      setToast({ message: `${task.id} updated`, type: 'success' });
      await loadTasks();
    } else {
      setToast({ message: `Failed to save ${task.id}`, type: 'error' });
    }
  }

  // ── Delete from modal ──
  async function handleModalDelete(id: string) {
    if (!confirm('Delete this task?')) return;
    try {
      const res = await fetch(`/api/tasks?id=${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error();
      setAllTasks(prev => prev.filter(t => t.id !== id));
      setModalOpen(false);
      setEditingTask(null);
      setToast({ message: `${id} deleted`, type: 'success' });
    } catch {
      setToast({ message: 'Delete failed', type: 'error' });
    }
  }

  // ── Assign task to queue ──
  async function assignToQueue(taskId: string, assignee: string) {
    const task = allTasks.find(t => t.id === taskId);
    if (!task) return;
    const updated = { ...task, assignee };
    const ok = await saveTask(updated);
    if (ok) {
      setToast({ message: `${task.id} → ${assignee}'s queue`, type: 'success' });
      await loadTasks();
    } else {
      setToast({ message: 'Failed to assign', type: 'error' });
    }
  }

  // ── Persist order ──
  function updateOrder(newOrder: Record<string, string[]>) {
    setQueueOrder(newOrder);
    saveStoredOrder(newOrder);
  }

  // ── Save task to API ──
  async function saveTask(task: DevTask): Promise<boolean> {
    try {
      const res = await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(task),
      });
      if (!res.ok) throw new Error('Save failed');
      const saved = await res.json();
      setAllTasks(prev => prev.map(t => t.id === saved.id ? saved : t));
      return true;
    } catch {
      return false;
    }
  }

  // ── Quick actions ──
  async function handleQuickAction(taskId: string, action: 'start' | 'done' | 'block') {
    const task = allTasks.find(t => t.id === taskId);
    if (!task) return;

    let updates: Partial<DevTask> = {};

    if (action === 'start') {
      updates = { status: 'in-progress' };
    } else if (action === 'done') {
      updates = { status: 'done', completed: new Date().toISOString().split('T')[0] };
    } else if (action === 'block') {
      const blockerId = window.prompt('Enter blocker task ID:');
      if (!blockerId) return;
      updates = { status: 'blocked', blocked_by: blockerId };
    }

    // Optimistic update
    const original = { ...task };
    const updated = { ...task, ...updates };
    setAllTasks(prev => prev.map(t => t.id === taskId ? updated : t));

    const ok = await saveTask(updated);
    if (ok) {
      setToast({ message: `${task.id} → ${STATUS_LABELS[updates.status!] || updates.status}`, type: 'success' });
      // Remove from queue order if done
      if (action === 'done') {
        const newOrder = { ...queueOrder };
        for (const name of ASSIGNEES) {
          if (newOrder[name]) {
            newOrder[name] = newOrder[name].filter(id => id !== taskId);
          }
        }
        updateOrder(newOrder);
      }
    } else {
      // Revert
      setAllTasks(prev => prev.map(t => t.id === taskId ? original : t));
      setToast({ message: `Failed to update ${task.id}`, type: 'error' });
    }
  }

  // ── DnD handlers ──
  function findColumn(taskId: string): string | null {
    for (const name of ASSIGNEES) {
      if (columns[name]?.some(t => t.id === taskId)) return name;
    }
    return null;
  }

  function handleDragStart(event: DragStartEvent) {
    setActiveId(String(event.active.id));
  }

  function handleDragOver(event: DragOverEvent) {
    const { active, over } = event;
    if (!over) return;

    const activeCol = findColumn(String(active.id));
    // Determine over column: either from the task's column or the droppable container
    let overCol = findColumn(String(over.id));
    if (!overCol) {
      // over might be a column container data attribute
      const overElement = document.querySelector(`[data-column]`);
      if (overElement) overCol = overElement.getAttribute('data-column');
    }

    if (!activeCol || !overCol || activeCol === overCol) return;

    // Move task between columns in state
    const activeTask = allTasks.find(t => t.id === String(active.id));
    if (!activeTask) return;

    setAllTasks(prev =>
      prev.map(t => t.id === activeTask.id ? { ...t, assignee: overCol! } : t)
    );
  }

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    setActiveId(null);

    if (!over) return;

    const activeId = String(active.id);
    const overId = String(over.id);
    const activeCol = findColumn(activeId);

    if (!activeCol) return;

    const colTasks = columns[activeCol] || [];
    const oldIndex = colTasks.findIndex(t => t.id === activeId);
    const newIndex = colTasks.findIndex(t => t.id === overId);

    if (oldIndex === -1) return;

    // Check if assignee changed (cross-column drag)
    const originalTask = allTasks.find(t => t.id === activeId);
    if (!originalTask) return;

    const assigneeChanged = originalTask.assignee !== activeCol;

    if (assigneeChanged) {
      // Persist the reassignment
      const updated = { ...originalTask, assignee: activeCol };
      const ok = await saveTask(updated);
      if (ok) {
        setToast({ message: `Moved "${originalTask.title}" to ${activeCol}'s queue`, type: 'success' });
      } else {
        // Revert
        setAllTasks(prev =>
          prev.map(t => t.id === activeId ? { ...t, assignee: originalTask.assignee } : t)
        );
        setToast({ message: 'Failed to reassign task', type: 'error' });
        return;
      }
    }

    // Reorder within column
    if (newIndex !== -1 && oldIndex !== newIndex) {
      const reordered = arrayMove(colTasks, oldIndex, newIndex);
      const newOrder = { ...queueOrder, [activeCol]: reordered.map(t => t.id) };
      updateOrder(newOrder);
    } else {
      // Just persist the current order
      const newOrder = { ...queueOrder, [activeCol]: colTasks.map(t => t.id) };
      updateOrder(newOrder);
    }
  }

  // ── Active task for drag overlay ──
  const activeTask = activeId ? allTasks.find(t => t.id === activeId) : null;

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-lg text-gray-400">Loading queue...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-4 md:p-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-bold">My Work Queue</h1>
          <span className={`text-xs px-2 py-1 rounded-full ${
            syncStatus === 'Connected'
              ? 'bg-green-900/50 text-green-400'
              : syncStatus === 'Error'
                ? 'bg-red-900/50 text-red-400'
                : 'bg-yellow-900/50 text-yellow-400'
          }`}>
            {syncStatus}
          </span>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setAddToQueueOpen(true)}
            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-1.5 rounded-lg text-sm font-medium transition-colors"
          >
            + Add to Queue
          </button>
          <Link
            href="/"
            className="text-sm text-gray-400 hover:text-white transition-colors"
          >
            ← Dashboard
          </Link>
        </div>
      </div>

      {/* Columns */}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
      >
        <div className="flex gap-6 overflow-x-auto pb-4">
          {ASSIGNEES.map(name => (
            <QueueColumn
              key={name}
              assignee={name}
              tasks={columns[name] || []}
              onQuickAction={handleQuickAction}
              onTaskClick={handleTaskClick}
            />
          ))}
        </div>

        <DragOverlay>
          {activeTask ? (
            <QueueCard
              task={activeTask}
              onQuickAction={() => {}}
              isOverlay
            />
          ) : null}
        </DragOverlay>
      </DndContext>

      {/* Task Edit Modal */}
      {modalOpen && editingTask && (
        <TaskEditModal
          task={editingTask}
          saving={saving}
          sprints={sprints}
          onSave={handleModalSave}
          onDelete={handleModalDelete}
          onClose={() => { setModalOpen(false); setEditingTask(null); }}
        />
      )}

      {/* Add to Queue Modal */}
      {addToQueueOpen && (
        <div
          className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4"
          onClick={(e) => { if (e.target === e.currentTarget) { setAddToQueueOpen(false); setAddToQueueSearch(''); } }}
        >
          <div className="bg-gray-900 border border-gray-700 rounded-xl w-full max-w-lg max-h-[80vh] flex flex-col">
            <div className="p-4 border-b border-gray-800">
              <h2 className="text-lg font-semibold mb-3">Add Task to Queue</h2>
              <input
                autoFocus
                type="text"
                placeholder="Search unassigned tasks..."
                value={addToQueueSearch}
                onChange={(e) => setAddToQueueSearch(e.target.value)}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
              />
              <p className="text-xs text-gray-500 mt-2">
                {unassignedTasks.length} unassigned task{unassignedTasks.length !== 1 ? 's' : ''} found
              </p>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-2">
              {unassignedTasks.length === 0 && (
                <div className="text-center text-gray-500 text-sm py-8">
                  No unassigned tasks found
                </div>
              )}
              {unassignedTasks.slice(0, 50).map(task => (
                <div
                  key={task.id}
                  className={`bg-gray-800 border border-gray-700 rounded-lg p-3 priority-${task.priority}`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs text-gray-500">#{task.id}</span>
                    {task.type && (
                      <span className={`text-xs px-1.5 py-0.5 rounded ${getTypeClass(task.type)}`}>
                        {task.type}
                      </span>
                    )}
                  </div>
                  <div className="text-sm font-medium mb-2">{task.title}</div>
                  <div className="flex items-center gap-2">
                    {ASSIGNEES.map(name => (
                      <button
                        key={name}
                        onClick={() => { assignToQueue(task.id, name); }}
                        className="bg-blue-600/80 hover:bg-blue-600 text-white px-3 py-1 rounded text-xs font-medium transition-colors"
                      >
                        → {name}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <div className="p-4 border-t border-gray-800">
              <button
                onClick={() => { setAddToQueueOpen(false); setAddToQueueSearch(''); }}
                className="text-sm text-gray-400 hover:text-white"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onDismiss={() => setToast(null)}
        />
      )}
    </div>
  );
}

// ── Task Edit Modal (replicated from page.tsx to avoid modifying it) ──

function TaskEditModal({
  task,
  saving,
  sprints,
  onSave,
  onDelete,
  onClose,
}: {
  task: DevTask;
  saving: boolean;
  sprints: string[];
  onSave: (t: DevTask) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
}) {
  const [form, setForm] = useState<DevTask>(task);

  function set(field: string, value: string | number) {
    setForm(f => ({ ...f, [field]: value }));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    onSave(form);
  }

  return (
    <div
      className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <form
        onSubmit={handleSubmit}
        className="bg-gray-900 border border-gray-700 rounded-xl w-full max-w-lg max-h-[90vh] overflow-y-auto p-6"
      >
        <h2 className="text-lg font-semibold mb-4">Edit Task — {task.id}</h2>

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
              <select value={form.project} onChange={(e) => set('project', e.target.value)} className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm">
                {PROJECTS.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Sprint</label>
              <select value={form.sprint || ''} onChange={(e) => set('sprint', e.target.value)} className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm">
                <option value="">Select sprint...</option>
                {sprints.map(s => <option key={s} value={s}>{s}</option>)}
                {form.sprint && !sprints.includes(form.sprint) && <option value={form.sprint}>{form.sprint}</option>}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-400 mb-1">Area</label>
              <select value={form.area || ''} onChange={(e) => set('area', e.target.value)} className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm">
                <option value="">Select area...</option>
                {AREAS.map(a => <option key={a} value={a}>{a}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Type</label>
              <select value={form.type || ''} onChange={(e) => set('type', e.target.value)} className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm">
                {['Enhancement', 'Bug Fix', 'Bug (Critical)', 'Feature Gap', 'Refactor', 'Documentation'].map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs text-gray-400 mb-1">Priority</label>
              <select value={form.priority} onChange={(e) => set('priority', e.target.value)} className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm">
                {['high', 'medium', 'low'].map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Status</label>
              <select value={form.status} onChange={(e) => set('status', e.target.value)} className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm">
                {STATUSES.map(s => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Est. Hours</label>
              <input type="number" min={0} step={0.5} value={form.est_hours} onChange={(e) => set('est_hours', parseFloat(e.target.value) || 0)} className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-400 mb-1">Assignee</label>
              <select value={form.assignee} onChange={(e) => set('assignee', e.target.value)} className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm">
                <option value="">Unassigned</option>
                {ASSIGNEES.map(a => <option key={a} value={a}>{a}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Blocked By</label>
              <input value={form.blocked_by} onChange={(e) => set('blocked_by', e.target.value)} placeholder="Task ID" className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500" />
            </div>
          </div>

          <div>
            <label className="block text-xs text-gray-400 mb-1">Notes</label>
            <textarea value={form.notes} onChange={(e) => set('notes', e.target.value)} rows={2} className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500 resize-none" />
          </div>
        </div>

        <div className="flex items-center justify-between mt-6">
          <button type="button" onClick={() => onDelete(task.id)} className="text-red-400 hover:text-red-300 text-sm">
            Delete
          </button>
          <div className="flex gap-2">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-400 hover:text-white">
              Cancel
            </button>
            <button type="submit" disabled={saving} className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white px-4 py-2 rounded-lg text-sm font-medium">
              {saving ? 'Saving...' : 'Update'}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
