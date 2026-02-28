'use client';

import { useState, useEffect } from 'react';
import { getSupabaseBrowserClient } from '@/lib/supabaseBrowser';
import { Crew } from '@/types/database';

const supabase = getSupabaseBrowserClient();

export default function TeamsPage() {
  const [crews, setCrews] = useState<Crew[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Add crew form state
  const [showForm, setShowForm] = useState(false);
  const [newName, setNewName] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [newTruckNumber, setNewTruckNumber] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Credentials display after successful creation
  const [createdCredentials, setCreatedCredentials] = useState<{ email: string; password: string; crewName: string } | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  // Edit crew state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editTruckNumber, setEditTruckNumber] = useState('');

  // Delete confirmation
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    fetchCrews();
  }, []);

  async function fetchCrews() {
    try {
      setLoading(true);
      setError(null);

      const { data, error: fetchError } = await supabase
        .from('crews')
        .select('*')
        .order('name', { ascending: true });

      if (fetchError) throw fetchError;
      setCrews(data as Crew[]);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to fetch crews';
      setError(message);
    } finally {
      setLoading(false);
    }
  }

  function generatePassword() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
    const specialChars = '!@#$%&*';
    let pass = '';
    for (let i = 0; i < 10; i++) {
      pass += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    // Insert a special char and a digit to ensure strength
    pass += specialChars.charAt(Math.floor(Math.random() * specialChars.length));
    pass += Math.floor(Math.random() * 10);
    setNewPassword(pass);
    setShowPassword(true);
  }

  async function copyToClipboard(text: string, field: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedField(field);
      setTimeout(() => setCopiedField(null), 2000);
    } catch {
      // Fallback
    }
  }

  async function handleAddCrew(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim()) {
      setFormError('Crew name is required');
      return;
    }
    if (!newEmail.trim()) {
      setFormError('Email is required for crew login');
      return;
    }
    if (!newPassword || newPassword.length < 6) {
      setFormError('Password must be at least 6 characters');
      return;
    }

    try {
      setSubmitting(true);
      setFormError(null);

      const res = await fetch('/api/admin/crews', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newName.trim(),
          phone: newPhone.trim() || undefined,
          truck_number: newTruckNumber.trim() || undefined,
          email: newEmail.trim(),
          password: newPassword,
        }),
      });

      const result = await res.json();

      if (!result.success) {
        throw new Error(result.error || 'Failed to add crew');
      }

      setCrews((prev) =>
        [...prev, result.data as Crew].sort((a, b) => a.name.localeCompare(b.name))
      );

      // Show credentials card
      setCreatedCredentials({
        email: newEmail.trim().toLowerCase(),
        password: newPassword,
        crewName: newName.trim(),
      });

      setNewName('');
      setNewPhone('');
      setNewTruckNumber('');
      setNewEmail('');
      setNewPassword('');
      setShowPassword(false);
      setShowForm(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to add crew';
      setFormError(message);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleUpdateCrew(id: string) {
    if (!editName.trim()) return;

    try {
      const { error: updateError } = await supabase
        .from('crews')
        .update({
          name: editName.trim(),
          phone: editPhone.trim() || null,
          truck_number: editTruckNumber.trim() || null,
        })
        .eq('id', id);

      if (updateError) throw updateError;

      setCrews((prev) =>
        prev
          .map((c) =>
            c.id === id
              ? { ...c, name: editName.trim(), phone: editPhone.trim() || null, truck_number: editTruckNumber.trim() || null }
              : c
          )
          .sort((a, b) => a.name.localeCompare(b.name))
      );
      setEditingId(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to update crew';
      alert(message);
    }
  }

  async function handleDeleteCrew(id: string) {
    try {
      const res = await fetch(`/api/admin/crews/${id}`, {
        method: 'DELETE',
      });

      const result = await res.json();

      if (!result.success) {
        throw new Error(result.error || 'Failed to delete crew');
      }

      setCrews((prev) => prev.filter((c) => c.id !== id));
      setDeletingId(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to delete crew';
      alert(message);
    }
  }

  function startEditing(crew: Crew) {
    setEditingId(crew.id);
    setEditName(crew.name);
    setEditPhone(crew.phone || '');
    setEditTruckNumber(crew.truck_number || '');
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="flex items-center space-x-2">
          <svg
            className="h-6 w-6 animate-spin text-green-600"
            fill="none"
            viewBox="0 0 24 24"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            />
          </svg>
          <span className="text-gray-600">Loading teams...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg bg-red-50 border border-red-200 p-6 text-center">
        <p className="text-red-600">{error}</p>
        <button onClick={fetchCrews} className="mt-4 text-red-700 underline">
          Try again
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Teams</h1>
          <p className="mt-1 text-sm text-gray-500">
            Manage your crews and team members
          </p>
        </div>
        <button
          onClick={() => {
            setShowForm(!showForm);
            setFormError(null);
            setCreatedCredentials(null);
            setNewName('');
            setNewPhone('');
            setNewTruckNumber('');
            setNewEmail('');
            setNewPassword('');
            setShowPassword(false);
          }}
          className="inline-flex items-center space-x-2 rounded-lg bg-green-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-green-700"
        >
          {showForm ? (
            <>
              <svg
                className="h-5 w-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
              <span>Cancel</span>
            </>
          ) : (
            <>
              <svg
                className="h-5 w-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 6v6m0 0v6m0-6h6m-6 0H6"
                />
              </svg>
              <span>Add Team</span>
            </>
          )}
        </button>
      </div>

      {/* Credentials Card - shown after successful creation */}
      {createdCredentials && (
        <div className="rounded-xl border-2 border-green-300 bg-green-50 p-6 shadow-sm">
          <div className="flex items-start justify-between">
            <div className="flex items-center space-x-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-green-100">
                <svg className="h-6 w-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <div>
                <h3 className="text-lg font-semibold text-gray-900">
                  {createdCredentials.crewName} Created Successfully!
                </h3>
                <p className="text-sm text-gray-500">
                  Share these login credentials with the crew. This is the only time the password will be shown.
                </p>
              </div>
            </div>
            <button
              onClick={() => setCreatedCredentials(null)}
              className="rounded-lg p-1 text-gray-400 hover:bg-gray-200 hover:text-gray-600"
            >
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <div className="mt-4 space-y-3 rounded-lg border border-gray-200 bg-white p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium uppercase tracking-wider text-gray-400">Email</p>
                <p className="mt-0.5 font-mono text-sm text-gray-900">{createdCredentials.email}</p>
              </div>
              <button
                onClick={() => copyToClipboard(createdCredentials.email, 'email')}
                className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                  copiedField === 'email'
                    ? 'bg-green-100 text-green-700'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {copiedField === 'email' ? 'Copied!' : 'Copy'}
              </button>
            </div>
            <div className="border-t border-gray-100" />
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium uppercase tracking-wider text-gray-400">Password</p>
                <p className="mt-0.5 font-mono text-sm text-gray-900">{createdCredentials.password}</p>
              </div>
              <button
                onClick={() => copyToClipboard(createdCredentials.password, 'password')}
                className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                  copiedField === 'password'
                    ? 'bg-green-100 text-green-700'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {copiedField === 'password' ? 'Copied!' : 'Copy'}
              </button>
            </div>
          </div>

          <button
            onClick={() => {
              copyToClipboard(
                `Email: ${createdCredentials.email}\nPassword: ${createdCredentials.password}`,
                'all'
              );
            }}
            className={`mt-4 inline-flex w-full items-center justify-center space-x-2 rounded-lg px-4 py-2.5 text-sm font-medium transition-colors ${
              copiedField === 'all'
                ? 'bg-green-600 text-white'
                : 'bg-gray-900 text-white hover:bg-gray-800'
            }`}
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
            </svg>
            <span>{copiedField === 'all' ? 'Copied All!' : 'Copy All Credentials'}</span>
          </button>
        </div>
      )}

      {/* Add Crew Form */}
      {showForm && (
        <div className="rounded-xl border border-green-200 bg-green-50 p-6 shadow-sm">
          <h2 className="mb-4 text-lg font-semibold text-gray-900">
            Add New Team
          </h2>
          <form onSubmit={handleAddCrew} className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label
                  htmlFor="crew-name"
                  className="mb-1 block text-sm font-medium text-gray-700"
                >
                  Team Name <span className="text-red-500">*</span>
                </label>
                <input
                  id="crew-name"
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="e.g. Alpha Crew"
                  className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
                  autoFocus
                />
              </div>
              <div>
                <label
                  htmlFor="crew-phone"
                  className="mb-1 block text-sm font-medium text-gray-700"
                >
                  Phone Number
                </label>
                <input
                  id="crew-phone"
                  type="tel"
                  value={newPhone}
                  onChange={(e) => setNewPhone(e.target.value)}
                  placeholder="e.g. (555) 123-4567"
                  className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
                />
              </div>
              <div>
                <label
                  htmlFor="crew-truck"
                  className="mb-1 block text-sm font-medium text-gray-700"
                >
                  Truck Number
                </label>
                <input
                  id="crew-truck"
                  type="text"
                  value={newTruckNumber}
                  onChange={(e) => setNewTruckNumber(e.target.value)}
                  placeholder="e.g. T-101"
                  className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
                />
              </div>
            </div>

            {/* Login Credentials Section */}
            <div className="border-t border-green-200 pt-4">
              <h3 className="mb-3 flex items-center space-x-2 text-sm font-semibold text-gray-900">
                <svg className="h-4 w-4 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                </svg>
                <span>Crew Portal Login Credentials</span>
              </h3>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label
                    htmlFor="crew-email"
                    className="mb-1 block text-sm font-medium text-gray-700"
                  >
                    Email <span className="text-red-500">*</span>
                  </label>
                  <input
                    id="crew-email"
                    type="email"
                    value={newEmail}
                    onChange={(e) => setNewEmail(e.target.value)}
                    placeholder="e.g. betacrew@turfboss.com"
                    className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
                  />
                </div>
                <div>
                  <label
                    htmlFor="crew-password"
                    className="mb-1 block text-sm font-medium text-gray-700"
                  >
                    Password <span className="text-red-500">*</span>
                  </label>
                  <div className="flex space-x-2">
                    <div className="relative flex-1">
                      <input
                        id="crew-password"
                        type={showPassword ? 'text' : 'password'}
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        placeholder="Min 6 characters"
                        className="w-full rounded-lg border border-gray-300 px-4 py-2.5 pr-10 text-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                      >
                        {showPassword ? (
                          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.878 9.878L3 3m6.878 6.878L21 21" />
                          </svg>
                        ) : (
                          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                          </svg>
                        )}
                      </button>
                    </div>
                    <button
                      type="button"
                      onClick={generatePassword}
                      className="whitespace-nowrap rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
                    >
                      Auto-Generate
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {formError && (
              <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-600">
                {formError}
              </div>
            )}

            <div className="flex justify-end space-x-3">
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="inline-flex items-center space-x-2 rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {submitting ? (
                  <>
                    <svg
                      className="h-4 w-4 animate-spin"
                      fill="none"
                      viewBox="0 0 24 24"
                    >
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                      />
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                      />
                    </svg>
                    <span>Adding...</span>
                  </>
                ) : (
                  <span>Add Team</span>
                )}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Teams List */}
      <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="border-b border-gray-200 px-6 py-4">
          <h2 className="text-lg font-semibold text-gray-900">
            All Teams ({crews.length})
          </h2>
        </div>

        {crews.length === 0 ? (
          <div className="px-6 py-12 text-center">
            <svg
              className="mx-auto h-12 w-12 text-gray-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"
              />
            </svg>
            <p className="mt-4 text-gray-500">No teams yet</p>
            <button
              onClick={() => setShowForm(true)}
              className="mt-4 text-sm font-medium text-green-600 hover:text-green-700"
            >
              Add your first team
            </button>
          </div>
        ) : (
          <div className="divide-y divide-gray-200">
            {crews.map((crew) => (
              <div
                key={crew.id}
                className="flex flex-col gap-3 px-4 py-4 transition-colors hover:bg-gray-50 sm:flex-row sm:items-center sm:justify-between sm:px-6"
              >
                {editingId === crew.id ? (
                  /* Edit Mode */
                  <div className="flex flex-1 flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
                    <input
                      type="text"
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      className="w-full rounded-lg border border-gray-300 px-3 py-1.5 text-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500 sm:w-auto"
                      autoFocus
                    />
                    <input
                      type="tel"
                      value={editPhone}
                      onChange={(e) => setEditPhone(e.target.value)}
                      placeholder="Phone"
                      className="w-full rounded-lg border border-gray-300 px-3 py-1.5 text-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500 sm:w-auto"
                    />
                    <input
                      type="text"
                      value={editTruckNumber}
                      onChange={(e) => setEditTruckNumber(e.target.value)}
                      placeholder="Truck #"
                      className="w-full rounded-lg border border-gray-300 px-3 py-1.5 text-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500 sm:w-auto"
                    />
                    <div className="flex space-x-2">
                      <button
                        onClick={() => handleUpdateCrew(crew.id)}
                        className="rounded-lg bg-green-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-green-700"
                      >
                        Save
                      </button>
                      <button
                        onClick={() => setEditingId(null)}
                        className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-100"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  /* View Mode */
                  <>
                    <div className="flex items-center space-x-4">
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-100 text-blue-600">
                        <svg
                          className="h-5 w-5"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"
                          />
                        </svg>
                      </div>
                      <div>
                        <p className="font-medium text-gray-900">{crew.name}</p>
                        <p className="text-sm text-gray-500">
                          {crew.phone || 'No phone'}
                          {crew.truck_number && (
                            <span className="ml-2 inline-flex items-center rounded bg-gray-100 px-1.5 py-0.5 text-xs font-medium text-gray-600">
                              🚛 {crew.truck_number}
                            </span>
                          )}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center space-x-2">
                      <button
                        onClick={() => startEditing(crew)}
                        className="rounded-lg border border-gray-300 p-2 text-gray-500 hover:bg-gray-100 hover:text-gray-700"
                        title="Edit"
                      >
                        <svg
                          className="h-4 w-4"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                          />
                        </svg>
                      </button>

                      {deletingId === crew.id ? (
                        <div className="flex items-center space-x-2">
                          <span className="text-xs text-red-600">Delete?</span>
                          <button
                            onClick={() => handleDeleteCrew(crew.id)}
                            className="rounded-lg bg-red-600 px-2 py-1 text-xs font-medium text-white hover:bg-red-700"
                          >
                            Yes
                          </button>
                          <button
                            onClick={() => setDeletingId(null)}
                            className="rounded-lg border border-gray-300 px-2 py-1 text-xs font-medium text-gray-700 hover:bg-gray-100"
                          >
                            No
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setDeletingId(crew.id)}
                          className="rounded-lg border border-gray-300 p-2 text-gray-500 hover:bg-red-50 hover:text-red-600"
                          title="Delete"
                        >
                          <svg
                            className="h-4 w-4"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                            />
                          </svg>
                        </button>
                      )}
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
