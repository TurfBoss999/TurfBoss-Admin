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
