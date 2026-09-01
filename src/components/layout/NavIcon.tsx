interface NavIconProps {
  name: string;
  className?: string;
}

const paths: Record<string, string> = {
  grid: 'M4 4h7v7H4V4zm9 0h7v7h-7V4zM4 13h7v7H4v-7zm9 0h7v7h-7v-7z',
  'trending-up': 'M3 17l6-6 4 4 8-8M21 7v6M21 7h-6',
  'pie-chart': 'M12 2v10l7.07 7.07A10 10 0 1 1 12 2z M22 12A10 10 0 0 0 12 2v10z',
  list: 'M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01',
  'bar-chart': 'M4 20V10M12 20V4M20 20v-6',
  user: 'M20 21a8 8 0 0 0-16 0 M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
  'life-buoy': 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8z M4.9 4.9l4.24 4.24M14.86 14.86l4.24 4.24M19.1 4.9l-4.24 4.24M9.14 14.86l-4.24 4.24',
  sun: 'M12 3v2M12 19v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42 M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z',
  moon: 'M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z',
  menu: 'M4 7h16M4 12h16M4 17h16',
  close: 'M6 6l12 12M18 6L6 18',
  bell: 'M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 0 1-3.46 0',
};

export function NavIcon({ name, className = 'h-5 w-5' }: NavIconProps) {
  const d = paths[name] ?? paths.grid;
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth={2}>
      <path d={d} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
