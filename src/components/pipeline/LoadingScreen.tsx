"use client";

type LoadingScreenProps = {
  label?: string;
};

export function LoadingScreen({ label = "Loading Spanwrap Pipeline…" }: LoadingScreenProps) {
  return (
    <div className="loading-screen" role="status" aria-live="polite" aria-busy="true">
      <div className="loading-screen-inner">
        <p className="brand">Spanwrap Pipeline</p>
        <div className="loading-spinner" aria-hidden="true" />
        <p className="loading-label">{label}</p>
      </div>
    </div>
  );
}
