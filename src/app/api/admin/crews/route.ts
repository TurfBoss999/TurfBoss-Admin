import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient, createSupabaseAdminClient } from '@/lib/supabaseServer';
import { requireAdmin, handleApiError } from '@/lib/requireAdmin';
import { ApiResponse, Crew, CreateCrewDto } from '@/types/database';

// GET /api/admin/crews - Fetch all crews
export async function GET(): Promise<NextResponse<ApiResponse<Crew[]>>> {
  try {
    await requireAdmin();

    const supabase = await createSupabaseServerClient();

    const { data: crews, error } = await supabase
      .from('crews')
      .select('*')
      .order('name', { ascending: true });

    if (error) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      data: crews as Crew[],
    });
  } catch (error) {
    const { message, status } = handleApiError(error);
    return NextResponse.json({ success: false, error: message }, { status });
  }
}

// POST /api/admin/crews - Create a new crew with auth user & profile
export async function POST(request: NextRequest): Promise<NextResponse<ApiResponse<Crew>>> {
  try {
    await requireAdmin();

    const body: CreateCrewDto = await request.json();

    if (!body.name || body.name.trim() === '') {
      return NextResponse.json(
        { success: false, error: 'Crew name is required' },
        { status: 400 }
      );
    }

    if (!body.email || body.email.trim() === '') {
      return NextResponse.json(
        { success: false, error: 'Email is required for crew login' },
        { status: 400 }
      );
    }

    if (!body.password || body.password.length < 6) {
      return NextResponse.json(
        { success: false, error: 'Password must be at least 6 characters' },
        { status: 400 }
      );
    }

    const supabaseAdmin = createSupabaseAdminClient();

    // Step 1: Create the auth user (service role bypasses email confirmation)
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email: body.email.trim().toLowerCase(),
      password: body.password,
      email_confirm: true, // Auto-confirm the email
      user_metadata: {
        crew_name: body.name.trim(),
      },
    });

    if (authError) {
      return NextResponse.json(
        { success: false, error: `Failed to create login: ${authError.message}` },
        { status: 400 }
      );
    }

    const userId = authData.user.id;

    // Step 2: Create the crew row
    const { data: crew, error: crewError } = await supabaseAdmin
      .from('crews')
      .insert({
        name: body.name.trim(),
        phone: body.phone?.trim() || null,
        truck_number: body.truck_number?.trim() || null,
      })
      .select()
      .single();

    if (crewError) {
      // Rollback: delete the auth user we just created
      await supabaseAdmin.auth.admin.deleteUser(userId);
      return NextResponse.json(
        { success: false, error: crewError.message },
        { status: 500 }
      );
    }

    // Step 3: Create the profile linking auth user → crew
    const { error: profileError } = await supabaseAdmin
      .from('profiles')
      .upsert({
        id: userId,
        role: 'crew',
        crew_id: crew.id,
      });

    if (profileError) {
      // Rollback: delete crew and auth user
      await supabaseAdmin.from('crews').delete().eq('id', crew.id);
      await supabaseAdmin.auth.admin.deleteUser(userId);
      return NextResponse.json(
        { success: false, error: `Failed to create profile: ${profileError.message}` },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { success: true, data: crew as Crew },
      { status: 201 }
    );
  } catch (error) {
    const { message, status } = handleApiError(error);
    return NextResponse.json({ success: false, error: message }, { status });
  }
}
