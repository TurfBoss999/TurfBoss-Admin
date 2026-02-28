import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabaseServer';
import { requireAdmin, handleApiError } from '@/lib/requireAdmin';
import { ApiResponse, JobWithCrew, CreateJobDto } from '@/types/database';

// GET /api/admin/jobs - Fetch all jobs with crew info
export async function GET(): Promise<NextResponse<ApiResponse<JobWithCrew[]>>> {
  try {
    await requireAdmin();

    const supabase = await createSupabaseServerClient();

    const { data: jobs, error } = await supabase
      .from('jobs')
      .select(`
        *,
        crew:crews(*)
      `)
      .order('date', { ascending: true });

    if (error) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      data: jobs as JobWithCrew[],
    });
  } catch (error) {
    const { message, status } = handleApiError(error);
    return NextResponse.json({ success: false, error: message }, { status });
  }
}

// POST /api/admin/jobs - Create a new job
export async function POST(
  request: NextRequest
): Promise<NextResponse<ApiResponse<JobWithCrew>>> {
  try {
    await requireAdmin();

    const supabase = await createSupabaseServerClient();
    const body: CreateJobDto = await request.json();

    // Validate required fields
    if (!body.date || !body.address || !body.service_type) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields: date, address, service_type' },
        { status: 400 }
      );
    }

    const { data: job, error } = await supabase
      .from('jobs')
      .insert({
        date: body.date,
        address: body.address,
        service_type: body.service_type,
        time_window_start: body.time_window_start || null,
        time_window_end: body.time_window_end || null,
        est_duration_min: body.est_duration_min || null,
        notes: body.notes || null,
        lat: body.lat || null,
        lng: body.lng || null,
        crew_id: body.crew_id || null,
        status: body.status || 'scheduled',
      })
      .select(`
        *,
        crew:crews(*)
      `)
      .single();

    if (error) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { success: true, data: job as JobWithCrew },
      { status: 201 }
    );
  } catch (error) {
    const { message, status } = handleApiError(error);
    return NextResponse.json({ success: false, error: message }, { status });
  }
}
