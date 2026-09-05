import React from "react";

export function LoadingState({ label = "Chargement…" }: { label?: string }) {
  return (
    <div className="flex items-center justify-center py-16" role="status" aria-live="polite">
      <span className="h-4 w-4 mr-2 rounded-full border-2 border-gray-300 border-t-gray-700 animate-spin" />
      <span className="text-sm text-gray-600">{label}</span>
    </div>
  );
}

export function ErrorState({ message, children }: { message: string; children?: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-md py-16 text-center space-y-3" role="alert">
      <p className="text-red-600 text-sm">{message}</p>
      {children}
    </div>
  );
}
