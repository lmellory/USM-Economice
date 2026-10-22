import { describe, it, expect } from 'vitest';
import { initialView } from '../src/lib/entry-view.js';
describe('Bot keyboard entry sections', () => {
  it.each(['home', 'schedule', 'hw', 'study', 'settings'])('opens %s', (view) =>
    expect(initialView('?view=' + view)).toBe(view)
  );
  it.each(['', '?view=admin', '?view=unknown', '?view=<script>'])(
    'falls back safely for %s',
    (search) => expect(initialView(search)).toBe('home')
  );
});
