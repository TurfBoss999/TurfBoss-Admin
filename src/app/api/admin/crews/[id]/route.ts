import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '@/lib/supabaseServer';
import { requireAdmin, handleApiError } from '@/lib/requireAdmin';
import { ApiResponse } from '@/types/database';

interface RouteParams {
  params: Promise<{ id: string }>;
}

// DELETE /api/admin/crews/[id] - Delete a crew and its associated auth user
export async function DELETE(
  request: NextRequest,
  { params }: RouteParams
): Promise<NextResponse<ApiResponse<{ deleted: boolean }>>> {
  try {
    await requireAdmin();

    const { id } = await params;
    const supabaseAdmin = createSupabaseAdminClient();

    // 1. Find profiles linked to this crew (to get auth user ids)
    const { data: profiles } = await supabaseAdmin
      .from('profiles')
      .select('id')
      .eq('crew_id', id);

    // 2. Unassign this crew from any jobs
    await supabaseAdmin
      .from('jobs')
      .update({ crew_id: null })
      .eq('crew_id', id);

    // 3. Delete profiles FIRST (they have FK to crews), then auth users
    if (profiles && profiles.length > 0) {
      for (const profile of profiles) {
        // Delete profile first (removes FK constraint to crews)
        await supabaseAdmin.from('profiles').delete().eq('id', profile.id);
        // Then delete auth user
        await supabaseAdmin.auth.admin.deleteUser(profile.id);
      }
    }

    // 4. Now delete the crew (no more FK constraints)
    const { error: crewError } = await supabaseAdmin
      .from('crews')
      .delete()
      .eq('id', id);

    if (crewError) {
      return NextResponse.json(
        { success: false, error: crewError.message },
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
