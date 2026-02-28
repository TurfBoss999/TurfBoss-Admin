import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabaseServer';
import { requireAdmin, handleApiError } from '@/lib/requireAdmin';
import { ApiResponse, JobWithCrew, UpdateJobDto } from '@/types/database';

interface RouteParams {
  params: Promise<{ id: string }>;
}

// GET /api/admin/jobs/[id] - Fetch single job
export async function GET(
  request: NextRequest,
  { params }: RouteParams
): Promise<NextResponse<ApiResponse<JobWithCrew>>> {
  try {
    await requireAdmin();

    const { id } = await params;
    const supabase = await createSupabaseServerClient();

    const { data: job, error } = await supabase
      .from('jobs')
      .select(`
        *,
        crew:crews(*)
      `)
      .eq('id', id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return NextResponse.json(
          { success: false, error: 'Job not found' },
          { status: 404 }
        );
      }
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      data: job as JobWithCrew,
    });
  } catch (error) {
    const { message, status } = handleApiError(error);
    return NextResponse.json({ success: false, error: message }, { status });
  }
}

// PUT /api/admin/jobs/[id] - Update job
export async function PUT(
  request: NextRequest,
  { params }: RouteParams
): Promise<NextResponse<ApiResponse<JobWithCrew>>> {
  try {
    await requireAdmin();

    const { id } = await params;
    const supabase = await createSupabaseServerClient();
    const body: UpdateJobDto = await request.json();

    // Build update object with only provided fields
    const updateData: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    if (body.date !== undefined) updateData.date = body.date;
    if (body.address !== undefined) updateData.address = body.address;
    if (body.service_type !== undefined) updateData.service_type = body.service_type;
    if (body.time_window_start !== undefined) updateData.time_window_start = body.time_window_start;
    if (body.time_window_end !== undefined) updateData.time_window_end = body.time_window_end;
    if (body.est_duration_min !== undefined) updateData.est_duration_min = body.est_duration_min;
    if (body.notes !== undefined) updateData.notes = body.notes;
    if (body.lat !== undefined) updateData.lat = body.lat;
    if (body.lng !== undefined) updateData.lng = body.lng;
    if (body.crew_id !== undefined) updateData.crew_id = body.crew_id;
    if (body.status !== undefined) updateData.status = body.status;

    const { data: job, error } = await supabase
      .from('jobs')
      .update(updateData)
      .eq('id', id)
      .select(`
        *,
        crew:crews(*)
      `)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return NextResponse.json(
          { success: false, error: 'Job not found' },
          { status: 404 }
        );
      }
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      data: job as JobWithCrew,
    });
  } catch (error) {
    const { message, status } = handleApiError(error);
    return NextResponse.json({ success: false, error: message }, { status });
  }
}

// DELETE /api/admin/jobs/[id] - Delete job
export async function DELETE(
  request: NextRequest,
  { params }: RouteParams
): Promise<NextResponse<ApiResponse<{ deleted: boolean }>>> {
  try {
    await requireAdmin();

    const { id } = await params;
    const supabase = await createSupabaseServerClient();

    const { error } = await supabase
      .from('jobs')
      .delete()
      .eq('id', id);

    if (error) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      data: { deleted: true },
    });
  } catch (error) {
    const { message, status } = handleApiError(error);
    return NextResponse.json({ success: false, error: message }, { status });
  }
}
