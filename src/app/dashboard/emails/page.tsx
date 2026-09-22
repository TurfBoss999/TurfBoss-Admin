'use client';

import { useState, useEffect, useMemo } from 'react';
import { getSupabaseBrowserClient } from '@/lib/supabaseBrowser';
import {
  EmailTemplate,
  EMAIL_TEMPLATE_LABELS,
  EmailSend,
} from '@/types/database';
import { EMAIL_TEMPLATE_DEFAULTS } from '@/lib/emailTemplates';

const supabase = getSupabaseBrowserClient();

interface Recipient {
  id: string;
  address: string;
  client_name: string | null;
  client_email: string;
}

interface EmailSendRow extends EmailSend {
  property: { address: string } | null;
}

function formatSentAt(iso: string): string {
  return new Date(iso).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export default function EmailsPage() {
  const [recipients, setRecipients] = useState<Recipient[]>([]);
  const [sentLog, setSentLog] = useState<EmailSendRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [template, setTemplate] = useState<EmailTemplate>('storm_delay');
  const [subject, setSubject] = useState(EMAIL_TEMPLATE_DEFAULTS.storm_delay.subject);
  const [body, setBody] = useState(EMAIL_TEMPLATE_DEFAULTS.storm_delay.body);
  const [search, setSearch] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [sendResult, setSendResult] = useState<{ sent: number; failed: number } | null>(null);

  async function fetchData() {
    try {
      setLoading(true);
      setError(null);

      const [propertiesRes, sendsRes] = await Promise.all([
        supabase
          .from('properties')
          .select('id, address, client_name, client_email')
          .not('client_email', 'is', null)
          .order('address', { ascending: true }),
        supabase
          .from('email_sends')
          .select('*, property:properties(address)')
          .order('created_at', { ascending: false })
          .limit(50),
      ]);

      if (propertiesRes.error) throw propertiesRes.error;
      if (sendsRes.error) throw sendsRes.error;

      setRecipients(propertiesRes.data as Recipient[]);
      setSentLog(sendsRes.data as EmailSendRow[]);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to fetch data';
      setError(message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchData();
  }, []);

  function selectTemplate(next: EmailTemplate) {
    setTemplate(next);
    setSubject(EMAIL_TEMPLATE_DEFAULTS[next].subject);
    setBody(EMAIL_TEMPLATE_DEFAULTS[next].body);
  }

  const filteredRecipients = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return recipients;
    return recipients.filter(
      (r) =>
        r.address.toLowerCase().includes(q) ||
        r.client_name?.toLowerCase().includes(q)
    );
  }, [recipients, search]);

  const allFilteredSelected =
    filteredRecipients.length > 0 &&
    filteredRecipients.every((r) => selectedIds.has(r.id));

  function toggleRecipient(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAllFiltered() {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allFilteredSelected) {
        filteredRecipients.forEach((r) => next.delete(r.id));
      } else {
        filteredRecipients.forEach((r) => next.add(r.id));
      }
      return next;
    });
  }

  async function handleSend() {
    if (selectedIds.size === 0 || !subject.trim() || !body.trim() || sending) return;

    setSending(true);
    setSendError(null);
    setSendResult(null);

    try {
      const res = await fetch('/api/admin/emails/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          template,
          subject,
          body,
          propertyIds: Array.from(selectedIds),
        }),
      });
      const json = await res.json();

      if (!json.success) {
        setSendError(json.error);
        return;
      }

      setSendResult(json.data);
      setSelectedIds(new Set());
      await fetchData();
    } catch (err) {
      setSendError(err instanceof Error ? err.message : 'Failed to send');
    } finally {
      setSending(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-green-600 border-t-transparent" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-700">
        {error}
        <button onClick={fetchData} className="mt-4 block text-red-700 underline">
          Try again
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Client Emails</h1>
        <p className="mt-1 text-sm text-gray-500">
          Send storm delay or service completion notices to clients on file
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Compose */}
        <div className="space-y-4 rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <div>
            <label className="block text-sm font-medium text-gray-700">Template</label>
            <div className="mt-2 flex gap-2">
              {(Object.keys(EMAIL_TEMPLATE_DEFAULTS) as EmailTemplate[]).map((key) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => selectTemplate(key)}
                  className={`rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                    template === key
                      ? 'bg-green-600 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  {EMAIL_TEMPLATE_LABELS[key]}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">Subject</label>
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">Message</label>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={8}
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
            />
            <p className="mt-1 text-xs text-gray-400">
              {'{{client_name}}, {{address}}, and {{status_link}} are filled in per recipient.'}
            </p>
          </div>

          <div>
            <div className="flex items-center justify-between">
              <label className="block text-sm font-medium text-gray-700">
                Recipients ({selectedIds.size} selected)
              </label>
              <button
                type="button"
                onClick={toggleSelectAllFiltered}
                className="text-xs font-medium text-green-600 hover:text-green-700"
              >
                {allFilteredSelected ? 'Deselect all' : 'Select all'}
              </button>
            </div>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by address or client name..."
              className="mt-2 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
            />
            <div className="mt-2 max-h-64 overflow-y-auto rounded-lg border border-gray-200">
              {filteredRecipients.length === 0 ? (
                <p className="p-4 text-sm text-gray-500">
                  {recipients.length === 0
                    ? 'No properties have a client email on file yet.'
                    : 'No matches.'}
                </p>
              ) : (
                filteredRecipients.map((r) => (
                  <label
                    key={r.id}
                    className="flex cursor-pointer items-center gap-3 border-b border-gray-100 px-3 py-2 text-sm last:border-b-0 hover:bg-gray-50"
                  >
                    <input
                      type="checkbox"
                      checked={selectedIds.has(r.id)}
                      onChange={() => toggleRecipient(r.id)}
                      className="h-4 w-4 rounded border-gray-300 text-green-600 focus:ring-green-500"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-gray-900">{r.address}</p>
                      <p className="truncate text-xs text-gray-500">
                        {r.client_name || 'No name on file'} &middot; {r.client_email}
                      </p>
                    </div>
                  </label>
                ))
              )}
            </div>
          </div>

          {sendError && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {sendError}
            </div>
          )}
          {sendResult && (
            <div className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-700">
              Sent {sendResult.sent}, failed {sendResult.failed}.
            </div>
          )}

          <button
            type="button"
            onClick={handleSend}
            disabled={sending || selectedIds.size === 0 || !subject.trim() || !body.trim()}
            className="w-full rounded-lg bg-green-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-green-700 disabled:cursor-not-allowed disabled:bg-gray-300"
          >
            {sending ? 'Sending...' : `Send to ${selectedIds.size} recipient${selectedIds.size === 1 ? '' : 's'}`}
          </button>
        </div>

        {/* Sent log */}
        <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-gray-900">Recent Sends</h2>
          <div className="mt-4 max-h-[32rem] overflow-y-auto">
            {sentLog.length === 0 ? (
              <p className="text-sm text-gray-500">Nothing sent yet.</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 text-left text-xs font-medium uppercase text-gray-500">
                    <th className="pb-2">Recipient</th>
                    <th className="pb-2">Template</th>
                    <th className="pb-2">Status</th>
                    <th className="pb-2">Sent</th>
                  </tr>
                </thead>
                <tbody>
                  {sentLog.map((send) => (
                    <tr key={send.id} className="border-b border-gray-100 last:border-b-0">
                      <td className="py-2 pr-2">
                        <p className="text-gray-900">{send.recipient_email}</p>
                        {send.property?.address && (
                          <p className="text-xs text-gray-500">{send.property.address}</p>
                        )}
                      </td>
                      <td className="py-2 pr-2 text-gray-600">
                        {EMAIL_TEMPLATE_LABELS[send.template]}
                      </td>
                      <td className="py-2 pr-2">
                        <span
                          className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                            send.status === 'sent'
                              ? 'bg-green-100 text-green-800'
                              : 'bg-red-100 text-red-800'
                          }`}
                          title={send.error_message || undefined}
                        >
                          {send.status === 'sent' ? 'Sent' : 'Failed'}
                        </span>
                      </td>
                      <td className="py-2 text-gray-500">{formatSentAt(send.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
