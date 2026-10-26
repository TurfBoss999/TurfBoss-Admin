'use client';

// Shown instead of an endless spinner when the account could not be loaded in time.
export default function AccountLoadError() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-100 px-4">
      <div className="w-full max-w-sm rounded-xl bg-white p-6 text-center shadow">
        <p className="text-gray-800">Couldn&apos;t load your account.</p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="mt-4 rounded-lg bg-green-600 px-4 py-2 font-medium text-white transition-colors hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2"
        >
          Reload
        </button>
      </div>
    </div>
  );
}
