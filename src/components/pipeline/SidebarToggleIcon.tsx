type SidebarToggleIconProps = {
  collapsed: boolean;
};

/** Panel collapse/expand glyph — arrow stays in the content pane, clear of the rail. */
export function SidebarToggleIcon({ collapsed }: SidebarToggleIconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M9 4v16" />
      {collapsed ? (
        <>
          <path d="M13 12h5" />
          <path d="M16 9l3 3-3 3" />
        </>
      ) : (
        <>
          <path d="M17 12h-4" />
          <path d="M15 9l-3 3 3 3" />
        </>
      )}
    </svg>
  );
}
