import React from 'react';

interface ToggleProps {
  label: string;
  value: boolean;
  onChange: (value: boolean) => void;
}

export function Toggle({ label, value, onChange }: ToggleProps) {
  return (
    <button
      type="button"
      className="toggle-row"
      onClick={() => onChange(!value)}
      aria-pressed={value}
    >
      <span>{label}</span>
      <i className={value ? 'toggle on' : 'toggle'}>
        <b />
      </i>
    </button>
  );
}
