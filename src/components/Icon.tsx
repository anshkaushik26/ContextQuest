const PATHS: Record<string, string> = {
  tech: 'M4 14v-2a8 8 0 0 1 16 0v2 M4 14h3v6H5a1 1 0 0 1-1-1z M20 14h-3v6h2a1 1 0 0 0 1-1z',
  volunteer: 'M9 3h6l-1 5h-4z M12 8v2 M6 10h12v11H6z M9 15h6 M9 18h4',
  guard: 'M12 3l7 3v5c0 5-3.5 8.5-7 10-3.5-1.5-7-5-7-10V6z M9 12l2 2 4-4',
  alarm: 'M12 4a6 6 0 0 1 6 6v4l2 3H4l2-3v-4a6 6 0 0 1 6-6z M10 20a2 2 0 0 0 4 0 M3 6l2-2 M21 6l-2-2',
  notice: 'M4 5h16v11H8l-4 4z M12 8v4 M12 14.5v.5',
  dark: 'M9 18h6 M10 21h4 M12 3a6 6 0 0 0-4 10.5c.6.6 1 1.4 1 2.5h6c0-1.1.4-1.9 1-2.5A6 6 0 0 0 12 3z M4 4l16 16',
  generator: 'M3 8h14v10H3z M17 11h3v4h-3 M6 8V5h8v3 M7 13h2l-1 3 M12 12v3',
  door: 'M5 21V4l9-1v18 M14 4h5v17 M11 12h.5 M3 21h18',
  power: 'M13 2L4 14h7l-1 8 9-12h-7z',
  lock: 'M6 11h12v10H6z M8 11V8a4 4 0 0 1 8 0v3',
  check: 'M5 12l5 5 9-10',
  x: 'M6 6l12 12 M18 6L6 18',
  sound: 'M4 9h4l5-4v14l-5-4H4z M16 9a4 4 0 0 1 0 6 M18.5 6.5a8 8 0 0 1 0 11',
  mute: 'M4 9h4l5-4v14l-5-4H4z M17 9l5 6 M22 9l-5 6',
  copy: 'M8 8h12v12H8z M4 16V4h12',
  link: 'M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1 M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1',
  eye: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z',
  question: 'M9 9a3 3 0 1 1 4 2.8c-.7.3-1 1-1 1.7V14 M12 17.5v.5',
  left: 'M15 5l-7 7 7 7',
  right: 'M9 5l7 7-7 7',
  up: 'M5 15l7-7 7 7',
  down: 'M5 9l7 7 7-7',
  grip: 'M9 6h.01 M15 6h.01 M9 12h.01 M15 12h.01 M9 18h.01 M15 18h.01',
  pin: 'M9 3h6l-1 6 3 3H7l3-3z M12 12v9',
  pen: 'M4 20l4-1 11-11-3-3L5 16z M14 6l3 3',
  arrow: 'M5 12h14 M13 6l6 6-6 6',
  crown: 'M3 8l4 4 5-7 5 7 4-4-2 11H5z',
  spark: 'M12 3v4 M12 17v4 M3 12h4 M17 12h4 M6 6l2.5 2.5 M15.5 15.5L18 18 M6 18l2.5-2.5 M15.5 8.5L18 6',
  scale: 'M12 4v16 M5 20h14 M4 8h16 M4 8l-2 6a3 3 0 0 0 6 0z M20 8l-2 6a3 3 0 0 0 6 0z',
  flame: 'M12 3c1 4 5 5 5 10a5 5 0 0 1-10 0c0-3 2-4 2-6 1 1 1.5 2 1.5 3 1-2 1.5-4 1.5-7z',
};

export function Icon({ name, size = 18, stroke = 1.7, className = '' }: { name: string; size?: number; stroke?: number; className?: string }) {
  return (
    <svg
      className={`icon ${className}`}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={stroke}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={PATHS[name] ?? PATHS.question} />
    </svg>
  );
}
