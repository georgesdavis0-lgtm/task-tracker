import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-server';

// GET /api/tasks — list tasks (default: active only)
// ?include_archived=true — return all tasks
// ?archived_only=true — return only archived tasks
export async function GET(req: NextRequest) {
  try {
    const includeArchived = req.nextUrl.searchParams.get('include_archived') === 'true';
    const archivedOnly = req.nextUrl.searchParams.get('archived_only') === 'true';

    const sb = getSupabaseAdmin();
    let query = sb.from('sprint_tasks').select('*');

    if (archivedOnly) {
      query = query.eq('archived', true);
    } else if (!includeArchived) {
      query = query.eq('archived', false);
    }

    const { data, error } = await query.order('id');

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal error' },
      { status: 500 }
    );
  }
}

// POST /api/tasks — create or update a task
export async function POST(req: NextRequest) {
  try {
    const task = await req.json();

    if (!task.title?.trim()) {
      return NextResponse.json({ error: 'Title is required' }, { status: 400 });
    }

    task.updated_at = new Date().toISOString();

    const sb = getSupabaseAdmin();
    const { data, error } = await sb
      .from('sprint_tasks')
      .upsert(task)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal error' },
      { status: 500 }
    );
  }
}

// DELETE /api/tasks?id=xxx — delete a task
export async function DELETE(req: NextRequest) {
  try {
    const id = req.nextUrl.searchParams.get('id');
    if (!id) {
      return NextResponse.json({ error: 'id is required' }, { status: 400 });
    }

    const sb = getSupabaseAdmin();
    const { error } = await sb.from('sprint_tasks').delete().eq('id', id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal error' },
      { status: 500 }
    );
  }
}
