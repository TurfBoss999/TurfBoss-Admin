'use client';

import { useState, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { getSupabaseBrowserClient } from '@/lib/supabaseBrowser';
import { Property } from '@/types/database';
import {
  normalizeAddress,
  findPropertyByAddress,
  geocodeAddress,
  cleanEmail,
  emailProblem,
} from '@/lib/properties';

const supabase = getSupabaseBrowserClient();

interface PropertyFormProps {
  // Present when editing an existing property, absent when adding a new one
  property?: Property;
  onSaved?: (saved: Property) => void;
}

const inputClass =
  'mt-1 block w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500';

export default function PropertyForm({ property, onSaved }: PropertyFormProps) {
  const router = useRouter();
  const [address, setAddress] = useState(property?.address ?? '');
  const [clientName, setClientName] = useState(property?.client_name ?? '');
  const [clientEmail, setClientEmail] = useState(property?.client_email ?? '');
  const [notes, setNotes] = useState(property?.notes ?? '');

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Set when the address is already taken, so the message can link to the existing one
  const [duplicate, setDuplicate] = useState<{ id: string; address: string } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setDuplicate(null);
    setNotice(null);

    const normalized = normalizeAddress(address);
    if (!normalized) {
      setError('Enter an address.');
      return;
    }

    const emailError = emailProblem(clientEmail);
    if (emailError) {
      setError(emailError);
      return;
    }

    setSaving(true);
    try {
      // Only an address that actually changed is re-checked and re-geocoded
      const addressChanged = !property || normalized !== normalizeAddress(property.address);

      if (addressChanged) {
        const existing = await findPropertyByAddress(supabase, normalized, property?.id);
        if (existing) {
          setDuplicate(existing);
          setError('This address already exists.');
          return;
        }
      }

      let lat = property?.lat ?? null;
      let lng = property?.lng ?? null;
      if (addressChanged) {
        ({ lat, lng } = await geocodeAddress(normalized));
      }

      const fields = {
        address: addressChanged ? normalized : property!.address,
        lat,
        lng,
        client_name: clientName.trim() || null,
        client_email: cleanEmail(clientEmail) || null,
        notes: notes.trim() || null,
      };

      if (!property) {
        const { data, error: insertError } = await supabase
          .from('properties')
          .insert(fields)
          .select('id')
          .single();
        if (insertError) throw insertError;
        router.push(`/dashboard/properties/${data.id}`);
        return;
      }

      // Ask for the saved row back: row-level security skips a row it will not let you
      // update without raising an error, and no row back means nothing was saved.
      const { data: saved, error: updateError } = await supabase
        .from('properties')
        .update({ ...fields, updated_at: new Date().toISOString() })
        .eq('id', property.id)
        .select('*')
        .maybeSingle();
      if (updateError) throw updateError;
      if (!saved) throw new Error('The change was not saved. You may not have permission, or this property no longer exists.');

      setClientEmail(saved.client_email ?? '');
      setAddress(saved.address);
      setNotice(
        saved.lat == null || saved.lng == null
          ? 'Saved. We could not find a location for this address, so it shows as "Needs location".'
          : 'Saved.'
      );
      onSaved?.(saved as Property);
    } catch (err) {
      // 23505 = the database's unique index on address. The check above catches most
      // duplicates; this covers two saves of the same address landing at once.
      const failure = err as { code?: string; message?: string };
      setError(
        failure?.code === '23505'
          ? 'This address already exists.'
          : failure?.message || 'Failed to save the property.'
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div>
        <label htmlFor="address" className="block text-sm font-medium text-gray-700">
          Address <span className="text-red-500">*</span>
        </label>
        <input
          id="address"
          type="text"
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          placeholder="Street, city, state ZIP"
          className={inputClass}
        />
      </div>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <div>
          <label htmlFor="clientName" className="block text-sm font-medium text-gray-700">
            Client name
          </label>
          <input
            id="clientName"
            type="text"
            value={clientName}
            onChange={(e) => setClientName(e.target.value)}
            className={inputClass}
          />
        </div>
        <div>
          <label htmlFor="clientEmail" className="block text-sm font-medium text-gray-700">
            Client email
          </label>
          <input
            id="clientEmail"
            type="email"
            value={clientEmail}
            onChange={(e) => setClientEmail(e.target.value)}
            className={inputClass}
          />
        </div>
      </div>

      <div>
        <label htmlFor="notes" className="block text-sm font-medium text-gray-700">
          Office notes <span className="font-normal text-gray-500">(not shown to crews or clients)</span>
        </label>
        <textarea
          id="notes"
          rows={3}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          className={inputClass}
        />
      </div>

      {error && (
        <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
          {duplicate && (
            <>
              {' '}
              <Link href={`/dashboard/properties/${duplicate.id}`} className="font-medium underline">
                Open the existing property
              </Link>
              .
            </>
          )}
        </div>
      )}

      {notice && (
        <div role="status" className="rounded-lg border border-green-200 bg-green-50 p-4 text-sm text-green-800">
          {notice}
        </div>
      )}

      <div className="flex justify-end gap-3">
        <Link
          href="/dashboard/properties"
          className="rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          {property ? 'Back to list' : 'Cancel'}
        </Link>
        <button
          type="submit"
          disabled={saving}
          className="rounded-lg bg-green-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {saving ? 'Saving...' : property ? 'Save changes' : 'Add property'}
        </button>
      </div>
    </form>
  );
}
