import { NextRequest, NextResponse } from 'next/server';
import { Resend } from 'resend';
import { createSupabaseServerClient } from '@/lib/supabaseServer';
import { requireAdmin, handleApiError } from '@/lib/requireAdmin';
import { renderTemplate } from '@/lib/emailTemplates';
import { ApiResponse, EmailTemplate } from '@/types/database';

interface SendEmailsRequest {
  template: EmailTemplate;
  subject: string;
  body: string;
  propertyIds: string[];
}

interface SendEmailsResult {
  sent: number;
  failed: number;
}

const VALID_TEMPLATES: EmailTemplate[] = ['storm_delay', 'service_completion'];

// POST /api/admin/emails/send - Compose-and-send for the storm/weather mass
// email tool. The Resend API key must never reach the browser, so the
// actual send always happens here. One recipient failing to send never
// blocks the rest of the batch; every attempt is logged to email_sends
// regardless of outcome.
export async function POST(
  request: NextRequest
): Promise<NextResponse<ApiResponse<SendEmailsResult>>> {
  try {
    const admin = await requireAdmin();

    const body: SendEmailsRequest = await request.json();

    if (!body.template || !VALID_TEMPLATES.includes(body.template)) {
      return NextResponse.json(
        { success: false, error: 'Invalid or missing template' },
        { status: 400 }
      );
    }
    if (!body.subject?.trim() || !body.body?.trim()) {
      return NextResponse.json(
        { success: false, error: 'Subject and body are required' },
        { status: 400 }
      );
    }
    if (!Array.isArray(body.propertyIds) || body.propertyIds.length === 0) {
      return NextResponse.json(
        { success: false, error: 'At least one recipient is required' },
        { status: 400 }
      );
    }

    const apiKey = process.env.RESEND_API_KEY;
    const fromEmail = process.env.RESEND_FROM_EMAIL;

    if (!apiKey || !fromEmail) {
      console.error('RESEND_API_KEY or RESEND_FROM_EMAIL is not configured');
      return NextResponse.json(
        { success: false, error: 'Email sending is not configured' },
        { status: 500 }
      );
    }

    const supabase = await createSupabaseServerClient();

    const { data: properties, error: propertiesError } = await supabase
      .from('properties')
      .select('id, address, client_name, client_email')
      .in('id', body.propertyIds);

    if (propertiesError) {
      return NextResponse.json(
        { success: false, error: propertiesError.message },
        { status: 500 }
      );
    }

    const recipients = (properties || []).filter(
      (p): p is typeof p & { client_email: string } => !!p.client_email
    );

    if (recipients.length === 0) {
      return NextResponse.json(
        { success: false, error: 'None of the selected properties have a client email on file' },
        { status: 400 }
      );
    }

    const resend = new Resend(apiKey);
    const origin = request.nextUrl.origin;

    const results = await Promise.allSettled(
      recipients.map(async (property) => {
        const tokens = {
          client_name: property.client_name,
          address: property.address,
          status_link: `${origin}/status/${property.id}`,
        };
        const subject = renderTemplate(body.subject, tokens);
        const html = renderTemplate(body.body, tokens).replace(/\n/g, '<br />');

        const { error: sendError } = await resend.emails.send({
          from: fromEmail,
          to: property.client_email,
          subject,
          html,
        });

        if (sendError) throw new Error(sendError.message);

        return { property, subject, renderedBody: renderTemplate(body.body, tokens) };
      })
    );

    const logRows = results.map((result, i) => {
      const property = recipients[i];
      if (result.status === 'fulfilled') {
        return {
          template: body.template,
          subject: result.value.subject,
          body: result.value.renderedBody,
          recipient_email: property.client_email,
          property_id: property.id,
          status: 'sent' as const,
          error_message: null,
          sent_by: admin.id,
        };
      }
      return {
        template: body.template,
        subject: renderTemplate(body.subject, {
          client_name: property.client_name,
          address: property.address,
          status_link: `${origin}/status/${property.id}`,
        }),
        body: renderTemplate(body.body, {
          client_name: property.client_name,
          address: property.address,
          status_link: `${origin}/status/${property.id}`,
        }),
        recipient_email: property.client_email,
        property_id: property.id,
        status: 'failed' as const,
        error_message: result.reason instanceof Error ? result.reason.message : 'Unknown error',
        sent_by: admin.id,
      };
    });

    const { error: logError } = await supabase.from('email_sends').insert(logRows);
    if (logError) {
      console.error('Failed to write email_sends log:', logError);
    }

    const sent = logRows.filter((r) => r.status === 'sent').length;
    const failed = logRows.filter((r) => r.status === 'failed').length;

    return NextResponse.json({ success: true, data: { sent, failed } });
  } catch (error) {
    const { message, status } = handleApiError(error);
    return NextResponse.json({ success: false, error: message }, { status });
  }
}
