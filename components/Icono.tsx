const PATHS: Record<string, string> = {
  cafetera:
    '<path d="M4 9h12v6a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5z"/><path d="M16 11h2a2 2 0 0 1 0 4h-2"/><path d="M8 3v3M12 3v3"/>',
  refri: '<rect x="6" y="2" width="12" height="20" rx="2"/><path d="M6 9h12M9 5v2M9 12v3"/>',
  horno: '<rect x="3" y="4" width="18" height="16" rx="2"/><rect x="6" y="9" width="12" height="8" rx="1"/><path d="M7 6.5h1M10 6.5h1"/>',
  vitrina:
    '<rect x="3" y="7" width="18" height="12" rx="2"/><path d="M3 13h18M7 16h4"/><path d="M8 2c0 1.2 1 1.2 1 2.4M12 2c0 1.2 1 1.2 1 2.4"/>',
  campana: '<path d="M8 3h8v5l5 6H3l5-6z"/><path d="M6 18h12M9 21h6"/>',
  clima: '<rect x="2" y="5" width="20" height="8" rx="2"/><path d="M6 10h12M7 16l-1 3M12 16v3M17 16l1 3"/>',
  general: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M5 19l2-2M17 7l2-2"/>',
};

export const ICONOS = Object.keys(PATHS);

export default function Icono({ nombre, size = 26 }: { nombre: string; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      dangerouslySetInnerHTML={{ __html: PATHS[nombre] ?? PATHS.general }}
    />
  );
}
