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
