// Minimal stroke icon set (24px grid), so the app has no icon dependency.
const PATHS: Record<string, string> = {
  overview: "M3 12a9 9 0 1 1 18 0M12 12l4.5-4.5M7 16h10",
  live: "M5 12a7 7 0 0 1 14 0M8.5 12a3.5 3.5 0 0 1 7 0M12 12v.01M3 19h18",
  timing: "M3 12h4l3-8 4 16 3-8h4",
  battles: "M13 2 4 14h7l-1 8 9-12h-7z",
  flag: "M5 21V4M5 4h11l-2 4 2 4H5",
  calendar: "M4 6h16v14H4zM4 10h16M8 3v4M16 3v4",
  history: "M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5M12 7v5l3 2",
  drivers: "M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM2 21a7 7 0 0 1 14 0M17 3.5a4 4 0 0 1 0 7.5M22 21a7 7 0 0 0-4.5-6.5",
  settings: "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z",
  play: "M7 4v16l13-8z",
  pause: "M7 4h4v16H7zM13 4h4v16h-4z",
  back: "M11 19 4 12l7-7M4 12h16",
  prev: "M19 20 9 12l10-8zM5 4v16",
  next: "M5 4l10 8-10 8zM19 4v16",
  fit: "M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5",
  expand: "M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7",
  shrink: "M4 14h6v6M20 10h-6V4M14 10l7-7M3 21l7-7",
  target: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM12 12v.01",
  plus: "M12 5v14M5 12h14",
  minus: "M5 12h14",
  chevron: "M9 18l6-6-6-6",
  chevronDown: "M6 9l6 6 6-6",
  menu: "M4 6h16M4 12h16M4 18h16",
  close: "M6 6l12 12M18 6 6 18",
  bell: "M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 0 1-3.4 0",
  star: "M12 3l2.8 5.7 6.2.9-4.5 4.4 1 6.2L12 17.3 6.5 20.2l1-6.2L3 9.6l6.2-.9z",
  info: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 16v-4M12 8h.01",
  live2: "M12 12v.01M8 8a5.7 5.7 0 0 0 0 8M16 8a5.7 5.7 0 0 1 0 8",
  wifiOff: "M3 3l18 18M8.5 16.4a5 5 0 0 1 7 0M5 12.6a10 10 0 0 1 5.2-2.5M19 12.6a10 10 0 0 0-2.4-1.6M2 8.8a15 15 0 0 1 4.2-2.7M22 8.8a15 15 0 0 0-11-3.7M12 20h.01",
  sidebar: "M4 4h16v16H4zM9 4v16",
  home: "M3 11.5 12 4l9 7.5M5.5 10v10h13V10M10 20v-6h4v6",
  sun: "M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4",
  cloud: "M7 18a4 4 0 0 1-.5-8A6 6 0 0 1 18 9.5 4.3 4.3 0 0 1 17 18z",
  rain: "M7 15a4 4 0 0 1-.5-8A6 6 0 0 1 18 6.5 4.3 4.3 0 0 1 17 15zM8 18l-1 3M12 18l-1 3M16 18l-1 3",
  thermo: "M14 14.8V5a2 2 0 1 0-4 0v9.8a4 4 0 1 0 4 0z",
  wind: "M3 8h11a3 3 0 1 0-3-3M3 12h15a3 3 0 1 1-3 3M3 16h7",
  drop: "M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11z",
  refresh: "M20 11a8 8 0 0 0-14.5-4M4 4v4h4M4 13a8 8 0 0 0 14.5 4M20 20v-4h-4",
  clock: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3 2",
  lap: "M5 21V4M5 4h11l-2 4 2 4H5",
  trophy: "M8 4h8v5a4 4 0 0 1-8 0zM8 6H4v1a4 4 0 0 0 4 4M16 6h4v1a4 4 0 0 1-4 4M12 13v4M8 21h8M10 17h4",
};

export function Icon({ name, size = 18, className, filled }: { name: keyof typeof PATHS | string; size?: number; className?: string; filled?: boolean }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d={PATHS[name] ?? ""} />
    </svg>
  );
}
