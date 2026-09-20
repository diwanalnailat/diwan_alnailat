"use client";

import "../public/phone.css";

export function saudiLocalPhone(value: string) {
  return value
    .replace(/[٠-٩]/g, (n) => String(n.charCodeAt(0) - 1632))
    .replace(/[۰-۹]/g, (n) => String(n.charCodeAt(0) - 1776))
    .replace(/[^0-9]/g, "")
    .replace(/^(?:00966|966)/, "")
    .replace(/^0(?=5)/, "");
}

export default function SaudiPhoneInput({
  id,
  value,
  onChange,
  disabled,
  describedBy,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  describedBy?: string;
}) {
  return (
    <div className="saudi-phone-field" dir="ltr">
      <span className="saudi-phone-prefix" aria-label="رمز دولة السعودية +966">
        +966
      </span>
      <input
        id={id}
        name="phone"
        type="tel"
        dir="ltr"
        autoComplete="tel-national"
        inputMode="tel"
        placeholder="5XXXXXXXX"
        pattern="5[0-9]{8}"
        maxLength={20}
        title="رقم الجوال السعودي: 9 أرقام تبدأ بـ5"
        value={value}
        onChange={(event) => onChange(saudiLocalPhone(event.target.value))}
        required
        disabled={disabled}
        aria-describedby={describedBy}
      />
    </div>
  );
}
