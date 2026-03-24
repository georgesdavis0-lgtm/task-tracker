-- Feature Submissions table
-- Run this in your Supabase SQL Editor to create the table

CREATE TABLE IF NOT EXISTS feature_submissions (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type                text NOT NULL CHECK (type IN ('bug', 'feature', 'improvement')),
  title               text NOT NULL,
  description         text NOT NULL,
  submitted_by_name   text,
  submitted_by_email  text,
  submitted_by_phone  text,
  status              text NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'reviewed', 'accepted', 'declined')),
  linked_task_id      text, -- References sprint_tasks.id if converted to a task
  reviewed_at         timestamptz,
  created_at          timestamptz DEFAULT now()
);

-- Index for listing by status
CREATE INDEX IF NOT EXISTS idx_feature_submissions_status ON feature_submissions(status);
CREATE INDEX IF NOT EXISTS idx_feature_submissions_created ON feature_submissions(created_at DESC);
