import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-server';

// GET /api/submit — list all submissions (for internal review)
export async function GET(req: NextRequest) {
  try {
    const sb = getSupabaseAdmin();
    const status = req.nextUrl.searchParams.get('status');

    let query = sb
      .from('feature_submissions')
      .select('*')
      .order('created_at', { ascending: false });

    if (status && status !== 'all') {
      query = query.eq('status', status);
    }

    const { data, error } = await query;

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

// POST /api/submit — public submission (no auth)
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    // Validate required fields
    if (!body.type || !['bug', 'feature', 'improvement'].includes(body.type)) {
      return NextResponse.json({ error: 'Valid type is required (bug, feature, improvement)' }, { status: 400 });
    }
    if (!body.title?.trim() || body.title.trim().length < 5) {
      return NextResponse.json({ error: 'Title must be at least 5 characters' }, { status: 400 });
    }
    if (!body.description?.trim() || body.description.trim().length < 20) {
      return NextResponse.json({ error: 'Description must be at least 20 characters' }, { status: 400 });
    }

    // Honeypot check
    if (body.honeypot) {
      return NextResponse.json({ success: true });
    }

    // Email format check
    if (body.submitted_by_email?.trim()) {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.submitted_by_email.trim())) {
        return NextResponse.json({ error: 'Invalid email address' }, { status: 400 });
      }
    }

    const sb = getSupabaseAdmin();
    const { data, error } = await sb
      .from('feature_submissions')
      .insert({
        type: body.type,
        title: body.title.trim(),
        description: body.description.trim(),
        submitted_by_name: body.submitted_by_name?.trim() || null,
        submitted_by_email: body.submitted_by_email?.trim() || null,
        submitted_by_phone: body.submitted_by_phone?.trim() || null,
        status: 'new',
        created_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) {
      console.error('Failed to save submission:', error);
      return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 });
    }

    return NextResponse.json({ success: true, id: data.id });
  } catch (err) {
    console.error('Submit error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Something went wrong' },
      { status: 500 }
    );
  }
}

// PUT /api/submit — update submission status (for internal review)
export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();

    if (!body.id) {
      return NextResponse.json({ error: 'id is required' }, { status: 400 });
    }

    const sb = getSupabaseAdmin();
    const updates: Record<string, unknown> = {};

    if (body.status) {
      if (!['new', 'reviewed', 'accepted', 'declined'].includes(body.status)) {
        return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
      }
      updates.status = body.status;
      if (body.status !== 'new' && !updates.reviewed_at) {
        updates.reviewed_at = new Date().toISOString();
      }
    }

    if (body.linked_task_id !== undefined) {
      updates.linked_task_id = body.linked_task_id || null;
    }

    const { data, error } = await sb
      .from('feature_submissions')
      .update(updates)
      .eq('id', body.id)
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
