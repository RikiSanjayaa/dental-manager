const OFFSET_PATTERN = /(?:Z|[+-]\d{2}:?\d{2})$/;

export function parseApiDateTime(value: string) {
  return new Date(OFFSET_PATTERN.test(value) ? value : `${value}Z`);
}

export function formatWitaDateTime(value: string, options: Intl.DateTimeFormatOptions) {
  return `${new Intl.DateTimeFormat("id-ID", {
    ...options,
    timeZone: "Asia/Makassar",
  }).format(parseApiDateTime(value))} WITA`;
}
