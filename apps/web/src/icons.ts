/** ไอคอนเส้น (stroke) แบบ inline SVG ใช้สีตาม currentColor */
const svg = (size: number, body: string, width = 2) =>
  `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;

export const icons = {
  drop: (s = 20) => svg(s, '<path d="M12 3s6 7 6 11a6 6 0 0 1-12 0c0-4 6-11 6-11z"/>', 2.2),
  search: (s = 20) => svg(s, '<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/>'),
  refresh: (s = 20) => svg(s, '<path d="M21 12a9 9 0 1 1-2.6-6.4"/><path d="M21 3v6h-6"/>'),
  close: (s = 18) => svg(s, '<path d="M6 6l12 12"/><path d="M18 6L6 18"/>'),
  back: (s = 22) => svg(s, '<path d="M15 5l-7 7 7 7"/>'),
  locate: (s = 22) => svg(s, '<circle cx="12" cy="12" r="4"/><path d="M12 2v3"/><path d="M12 19v3"/><path d="M2 12h3"/><path d="M19 12h3"/>'),
  layers: (s = 22) => svg(s, '<path d="M12 3l9 5-9 5-9-5 9-5z"/><path d="M3 13l9 5 9-5"/>'),
  map: (s = 22) => svg(s, '<path d="M9 4L3 6v14l6-2 6 2 6-2V4l-6 2-6-2z"/><path d="M9 4v14"/><path d="M15 6v14"/>'),
  alert: (s = 22) => svg(s, '<path d="M12 3l9 16H3l9-16z"/><path d="M12 10v4"/><path d="M12 17h.01"/>'),
  camera: (s = 22, w = 2) => svg(s, '<rect x="2" y="7" width="14" height="10" rx="2"/><path d="M16 11l6-3v8l-6-3"/>', w),
  info: (s = 22) => svg(s, '<circle cx="12" cy="12" r="9"/><path d="M12 11v6"/><path d="M12 7h.01"/>'),
  wave: (s = 14) => svg(s, '<path d="M3 12c3-3 6 3 9 0s6 3 9 0"/><path d="M3 18c3-3 6 3 9 0s6 3 9 0"/>', 2.4),
  rain: (s = 14) => svg(s, '<path d="M7 15l-2 4"/><path d="M12 15l-2 4"/><path d="M17 15l-2 4"/><path d="M6 12a4 4 0 1 1 1-7.9A5 5 0 0 1 17 6a3 3 0 1 1 1 6z"/>', 2.4),
  gate: (s = 14) => svg(s, '<path d="M4 20V6"/><path d="M20 20V6"/><path d="M4 9h16"/><path d="M8 9v11"/><path d="M12 9v11"/><path d="M16 9v11"/>', 2.2),
  forecast: (s = 14) => svg(s, '<path d="M3 17l6-6 4 4 8-8"/><path d="M15 7h6v6"/>', 2.4),
  external: (s = 16) => svg(s, '<path d="M7 17L17 7"/><path d="M8 7h9v9"/>', 2.2),
  pin: (s = 20) => svg(s, '<circle cx="12" cy="10" r="3"/><path d="M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11z"/>'),
  road: (s = 20) => svg(s, '<path d="M8 3L5 21"/><path d="M16 3l3 18"/><path d="M12 6v2"/><path d="M12 12v2"/>'),
  star: (s = 20) => svg(s, '<path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z"/>'),
  share: (s = 20) => svg(s, '<path d="M12 15V3"/><path d="M8 7l4-4 4 4"/><path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7"/>'),
  home: (s = 16) => svg(s, '<path d="M3 11l9-7 9 7"/><path d="M5 10v10h14V10"/>', 2.4),
  roadFlood: (s = 22) => svg(s, '<path d="M4 19h16"/><path d="M3 15c2-2 4 2 6 0s4 2 6 0 4 2 6 0"/><path d="M12 3v8"/><path d="M9 8l3 3 3-3"/>'),
};
