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
import { DevTask, PROJECTS } from '@/lib/types';
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

function SortableQueueCard({ task, onQuickAction }: {
  task: DevTask;
  onQuickAction: (taskId: string, action: 'start' | 'done' | 'block') => void;
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
      <QueueCard task={task} onQuickAction={onQuickAction} dragHandleProps={{ ...attributes, ...listeners }} />
    </div>
  );
}

// ── Queue Card ──

function QueueCard({ task, onQuickAction, dragHandleProps, isOverlay }: {
  task: DevTask;
  onQuickAction: (taskId: string, action: 'start' | 'done' | 'block') => void;
  dragHandleProps?: Record<string, unknown>;
  isOverlay?: boolean;
}) {
  const proj = getProjectById(task.project);

  return (
    <div className={`queue-card bg-gray-900 border border-gray-800 rounded-lg p-3 priority-${task.priority} ${
      isOverlay ? 'queue-drag-overlay' : 'hover:border-gray-600'
    } transition-colors relative group`}>
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

function QueueColumn({ assignee, tasks, onQuickAction }: {
  assignee: string;
  tasks: DevTask[];
  onQuickAction: (taskId: string, action: 'start' | 'done' | 'block') => void;
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
            <SortableQueueCard key={task.id} task={task} onQuickAction={onQuickAction} />
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
        t => t.assignee === name && t.status !== 'done'
      );
      result[name] = mergeWithStoredOrder(assigneeTasks, queueOrder[name] || []);
    }
    return result;
  }, [allTasks, queueOrder]);

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
        <Link
          href="/"
          className="text-sm text-gray-400 hover:text-white transition-colors"
        >
          ← Back to Dashboard
        </Link>
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
