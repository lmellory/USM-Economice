export type EntryView = 'home' | 'schedule' | 'hw' | 'study' | 'settings';
export function initialView(search: string): EntryView {
  const view = new URLSearchParams(search).get('view');
  return view && ['home', 'schedule', 'hw', 'study', 'settings'].includes(view)
    ? (view as EntryView)
    : 'home';
}
