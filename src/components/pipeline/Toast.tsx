"use client";

type ToastProps = {
  message: string | null;
  isError?: boolean;
};

export function Toast({ message, isError }: ToastProps) {
  if (!message) return null;
  return (
    <p className="toast" style={{ background: isError ? "#8f2d2d" : "#1c1915" }}>
      {message}
    </p>
  );
}
