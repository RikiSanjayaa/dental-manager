import { Button } from "@cloudflare/kumo/components/button";
import { DatePicker } from "@cloudflare/kumo/components/date-picker";
import { Popover } from "@cloudflare/kumo/components/popover";
import { CalendarDays } from "lucide-react";

export function dateToString(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function stringToDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
}

type SingleProps = {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
};

export function DatePickerPopover({ value, onChange, placeholder = "Pilih tanggal", disabled }: SingleProps) {
  return (
    <Popover>
      <Popover.Trigger
        render={
          <Button type="button" variant="secondary" disabled={disabled} className="w-full justify-between">
            <span>{value || placeholder}</span>
            <CalendarDays size={16} />
          </Button>
        }
      />
      <Popover.Content align="start" sideOffset={8} className="p-2" positionMethod="fixed">
        <DatePicker
          mode="single"
          selected={value ? stringToDate(value) : undefined}
          onChange={(date) => {
            if (date) onChange(dateToString(date));
          }}
          showOutsideDays
        />
      </Popover.Content>
    </Popover>
  );
}

type MultipleProps = {
  value: Date[];
  onChange: (value: Date[]) => void;
  triggerLabel: string;
  disabled?: boolean;
  defaultMonth?: Date;
  isDateDisabled?: (date: Date) => boolean;
};

export function MultiDatePickerPopover({
  value,
  onChange,
  triggerLabel,
  disabled,
  defaultMonth,
  isDateDisabled,
}: MultipleProps) {
  return (
    <Popover>
      <Popover.Trigger
        render={
          <Button type="button" variant="secondary" icon={<CalendarDays size={16} />} disabled={disabled}>
            {triggerLabel}
          </Button>
        }
      />
      <Popover.Content align="start" sideOffset={8} className="p-2" positionMethod="fixed">
        <DatePicker
          mode="multiple"
          selected={value}
          onChange={(dates) => onChange((dates as Date[] | undefined) ?? [])}
          defaultMonth={defaultMonth}
          disabled={isDateDisabled}
          showOutsideDays
        />
      </Popover.Content>
    </Popover>
  );
}
