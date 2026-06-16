"use client";

import { Label } from "@/components/ui/label";

export type SelectOption = { value: string; label: string } | string;

const defaultSelectClass =
  "h-10 w-full rounded-md border border-input bg-card px-3 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring";

export function Select({
  value,
  onChange,
  options,
  placeholder,
  className = defaultSelectClass,
  ...props
}: {
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
  className?: string;
} & React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className={className}
      {...props}
    >
      {placeholder ? <option value="">{placeholder}</option> : null}
      {options.map((option) => {
        const optionValue = typeof option === "string" ? option : option.value;
        const optionLabel = typeof option === "string" ? option : option.label;
        return (
          <option key={optionValue} value={optionValue}>
            {optionLabel}
          </option>
        );
      })}
    </select>
  );
}

export function SelectField({
  label,
  value,
  onChange,
  options,
  placeholder,
  className = defaultSelectClass,
  ...props
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
  className?: string;
} & React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <Select
        value={value}
        onChange={onChange}
        options={options}
        placeholder={placeholder}
        className={className}
        {...props}
      />
    </div>
  );
}
