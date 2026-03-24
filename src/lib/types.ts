export interface DevTask {
  id: string;
  title: string;
  description: string | null;
  project: string;
  priority: string;
  status: string;
  assignee: string;
  created: string | null;
  completed: string;
  sprint: string | null;
  area: string | null;
  type: string | null;
  blocked_by: string;
  est_hours: number;
  notes: string;
  updated_at: string;
  archived: boolean;
}

export const PROJECTS = [
  { id: 'crm', name: 'Roof Estimate CRM', color: '#3b82f6' },
  { id: 'app', name: 'RoofingLogic App', color: '#10b981' },
  { id: 'marketing', name: 'RoofingLogic Marketing', color: '#f59e0b' },
  { id: 'xactimate', name: 'RoofingLogic Xactimate', color: '#8b5cf6' },
] as const;

export const AREAS = [
  'Calc Engine',
  'Canvass',
  'Crew Management',
  'CRM / Contacts',
  'Email',
  'Estimate Builder',
  'Financials',
  'Inspection Form',
  'Invoicing',
  'Job Board',
  'Job Configuration',
  'Landing Page',
  'Lead',
  'Material Orders',
  'Measurements/Parsing',
  'Navigation / Routing',
  'Platform/Workflow',
  'Proposals',
  'Sales/Settings',
  'Scheduling / Calendar',
  'Settings',
  'Template Selection',
  'UI/UX',
  'User Management',
] as const;

export const STATUSES = ['todo', 'in-progress', 'review', 'blocked', 'done'] as const;

export const STATUS_LABELS: Record<string, string> = {
  todo: 'To Do',
  'in-progress': 'In Progress',
  review: 'In Review',
  blocked: 'Blocked',
  done: 'Done',
};

// ── Feature Submissions (client-facing) ──

export interface FeatureSubmission {
  id: string;
  type: 'bug' | 'feature' | 'improvement';
  title: string;
  description: string;
  submitted_by_name: string | null;
  submitted_by_email: string | null;
  submitted_by_phone: string | null;
  status: 'new' | 'reviewed' | 'accepted' | 'declined';
  image_urls: string[] | null;
  linked_task_id: string | null; // ID of sprint_tasks entry if converted
  created_at: string;
  reviewed_at: string | null;
}

export const SUBMISSION_TYPES = ['bug', 'feature', 'improvement'] as const;

export const SUBMISSION_TYPE_LABELS: Record<string, string> = {
  bug: 'Bug Report',
  feature: 'Feature Request',
  improvement: 'Improvement',
};

export const SUBMISSION_STATUSES = ['new', 'reviewed', 'accepted', 'declined'] as const;

export const SUBMISSION_STATUS_LABELS: Record<string, string> = {
  new: 'New',
  reviewed: 'Reviewed',
  accepted: 'Accepted',
  declined: 'Declined',
};
