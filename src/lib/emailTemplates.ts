import { EmailTemplate } from '@/types/database';

export interface TemplateTokens {
  client_name: string | null;
  address: string;
  status_link: string;
}

export const EMAIL_TEMPLATE_DEFAULTS: Record<EmailTemplate, { subject: string; body: string }> = {
  storm_delay: {
    subject: 'Weather Delay Notice - TurfBoss',
    body: `Hi {{client_name}},

Due to current weather conditions, service at {{address}} may be delayed. We'll be out as soon as it's safe to do so and will keep you updated.

Thank you for your patience,
TurfBoss`,
  },
  service_completion: {
    subject: 'Service Completed - TurfBoss',
    body: `Hi {{client_name}},

We've completed today's scheduled service at {{address}}. You can view the details here:
{{status_link}}

Thank you,
TurfBoss`,
  },
};

export function renderTemplate(text: string, tokens: TemplateTokens): string {
  return text
    .replaceAll('{{client_name}}', tokens.client_name?.trim() || 'there')
    .replaceAll('{{address}}', tokens.address)
    .replaceAll('{{status_link}}', tokens.status_link);
}

// Mobile Safari's Return key inserts U+2028 (LINE SEPARATOR) into textareas
// instead of a plain \n; U+2029 (PARAGRAPH SEPARATOR) is the same family.
// Built via String.fromCharCode rather than a literal/regex containing the
// characters themselves, since either is a real line terminator in JS
// source and can corrupt the very file it's written in.
const LINE_SEPARATOR = String.fromCharCode(0x2028);
const PARAGRAPH_SEPARATOR = String.fromCharCode(0x2029);

function stripSeparators(text: string): string {
  return text.split(LINE_SEPARATOR).join('\n').split(PARAGRAPH_SEPARATOR).join('\n');
}

// For the message body, a line separator is a meaningful line break.
export function sanitizeEmailText(text: string): string {
  return stripSeparators(text);
}

// A subject is a single header line - Resend (like any RFC 5322 sender)
// rejects a raw \n there outright. Collapse any line/paragraph separator,
// or a real \n from a paste, to a space instead so the subject stays valid
// no matter where the character came from.
export function sanitizeSubjectText(text: string): string {
  return stripSeparators(text).replace(/\n+/g, ' ').replace(/\s+/g, ' ').trim();
}
