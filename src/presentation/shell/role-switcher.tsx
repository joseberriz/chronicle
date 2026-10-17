// "View as" role switcher. A UI preference only: the backend still authorizes by the union of all the user's roles.
// Shown only to people who hold 2+ of the app's roles. Switching remembers the role and goes to its landing page.

import { useNavigate } from 'react-router';
import { useIdentity } from '../app-context';
import { pickActiveRole, setActiveRole, useStoredActiveRole } from '../active-role';

const ROLES: readonly { readonly id: string; readonly label: string }[] = [
  { id: '2488f0af-0b56-4f5f-94ab-b0cc93a07710', label: 'Department Lead' },
  { id: '0265fb88-701a-429c-8edd-1c33607dc615', label: 'Oncologist / Nurse Practitioner' },
  { id: '707968e8-fcb8-4a58-bffa-c0106a7e8226', label: 'Patient' },
  { id: '1bf880b9-da9e-4c0e-b38c-5fa91a33640b', label: 'Nurse Navigator / Coach' },
  { id: '2dd4c7c0-dc13-4a43-8fb4-a180fea14932', label: 'Caregiver' },
  { id: '51ba4562-5ed7-4743-8be9-6e3bba0a4ed2', label: 'Hospital Analyst' },
  { id: '3944ecf8-0f91-4708-b9c1-00a5f2870a4d', label: 'External Aggregate-Only User' },
  { id: 'f1dae2a6-52fe-426b-b8ca-b00ee9267cba', label: 'Administrator' },
];

export function RoleSwitcher() {
  const { identity } = useIdentity();
  const navigate = useNavigate();
  const stored = useStoredActiveRole();
  const wanted = new Set((identity?.roles ?? []).map((r) => r.toLowerCase()));
  const held = ROLES.filter(
    (r) => wanted.has(r.id.toLowerCase()) || wanted.has(r.label.toLowerCase()),
  );
  if (held.length < 2) return null;
  const active = pickActiveRole(
    held.map((r) => r.id),
    stored,
  );
  return (
    <label className="fixed bottom-3 right-3 z-50 flex items-center gap-2 rounded-control border border-border bg-card px-3 py-2 text-xs text-foreground shadow-md">
      <span className="text-muted-foreground">View as</span>
      <select
        aria-label="View as role"
        className="rounded-control border border-input bg-background px-2 py-1 text-xs"
        value={active ?? ''}
        onChange={(e) => {
          setActiveRole(e.target.value);
          navigate('/');
        }}
      >
        {held.map((r) => (
          <option key={r.id} value={r.id}>
            {r.label}
          </option>
        ))}
      </select>
    </label>
  );
}
