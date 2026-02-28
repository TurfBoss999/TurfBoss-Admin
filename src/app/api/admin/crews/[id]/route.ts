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

    // First, find the profile that links to this crew to get the auth user id
    const { data: profiles } = await supabaseAdmin
      .from('profiles')
      .select('id')
      .eq('crew_id', id);

    // Unassign this crew from any jobs before deleting
    await supabaseAdmin
      .from('jobs')
      .update({ crew_id: null })
      .eq('crew_id', id);

    // Delete the crew
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

    // Delete associated auth users (if any profiles were linked)
    if (profiles && profiles.length > 0) {
      for (const profile of profiles) {
        // Delete profile first
        await supabaseAdmin.from('profiles').delete().eq('id', profile.id);
        // Then delete auth user
        await supabaseAdmin.auth.admin.deleteUser(profile.id);
      }
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
