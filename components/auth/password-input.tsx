"use client";

import { useId, useState } from "react";

type PasswordInputProps = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete?: string;
  required?: boolean;
  minLength?: number;
  placeholder?: string;
  className?: string;
  inputClassName?: string;
};

export function PasswordInput({
  label,
  value,
  onChange,
  autoComplete = "current-password",
  required = false,
  minLength,
  placeholder,
  className = "block text-sm font-medium text-neutral-700",
  inputClassName = "mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2 pr-16 text-neutral-900 shadow-sm focus:border-[#33C7E3] focus:outline-none focus:ring-1 focus:ring-[#33C7E3]",
}: PasswordInputProps) {
  const [visible, setVisible] = useState(false);
  const inputId = useId();

  return (
    <label className={className}>
      {label}
      <div className="relative">
        <input
          id={inputId}
          type={visible ? "text" : "password"}
          autoComplete={autoComplete}
          required={required}
          minLength={minLength}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          className={inputClassName}
        />
        <button
          type="button"
          onClick={() => setVisible((prev) => !prev)}
          aria-label={visible ? "Ocultar contraseña" : "Mostrar contraseña"}
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md px-2 py-1 text-xs font-semibold text-[#009ade] hover:bg-sky-50"
        >
          {visible ? "Ocultar" : "Mostrar"}
        </button>
      </div>
    </label>
  );
}
