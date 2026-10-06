"use client";

export function PrintPageButton({
  label = "Print this page",
}: {
  label?: string;
}) {
  return (
    <button
      type="button"
      className="no-print"
      onClick={() => window.print()}
    >
      {label}
    </button>
  );
}
