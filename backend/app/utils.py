from datetime import date, datetime, time
from decimal import Decimal, InvalidOperation
from typing import Any


def normalize_text(value: Any) -> str:
    return " ".join(str(value or "").strip().lower().split())


def money_to_float(value: Any, default: float = 0) -> float:
    if value is None or value == "":
        return default
    if isinstance(value, (int, float)):
        return float(value)
    raw = str(value).strip()
    if not raw:
        return default
    cleaned = raw.replace("Rp", "").replace("rp", "").replace(" ", "")
    if "," in cleaned and "." in cleaned:
        cleaned = cleaned.replace(".", "").replace(",", ".")
    elif "." in cleaned and cleaned.count(".") == 1 and len(cleaned.split(".")[-1]) == 3:
        cleaned = cleaned.replace(".", "")
    else:
        cleaned = cleaned.replace(",", ".")
    try:
        return float(Decimal(cleaned))
    except (InvalidOperation, ValueError):
        return default


def parse_period(value: date | datetime | str | None) -> str:
    if isinstance(value, datetime):
        return value.strftime("%Y-%m")
    if isinstance(value, date):
        return value.strftime("%Y-%m")
    if isinstance(value, str):
        parsed = parse_date(value)
        if parsed:
            return parsed.strftime("%Y-%m")
        if len(value) >= 7:
            return value[:7]
    return date.today().strftime("%Y-%m")


def parse_date(value: Any) -> date | None:
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    if not value:
        return None
    text = str(value).strip()
    for fmt in ("%Y-%m-%d", "%d/%m/%Y", "%d/%m%Y", "%d-%m-%Y", "%d %B %Y", "%d %b %Y"):
        try:
            return datetime.strptime(text, fmt).date()
        except ValueError:
            continue
    months = {
        "januari": 1,
        "februari": 2,
        "maret": 3,
        "april": 4,
        "mei": 5,
        "juni": 6,
        "juli": 7,
        "agustus": 8,
        "september": 9,
        "oktober": 10,
        "november": 11,
        "desember": 12,
    }
    parts = text.lower().split()
    if len(parts) >= 3 and parts[1] in months:
        try:
            return date(int(parts[2]), months[parts[1]], int(parts[0]))
        except ValueError:
            return None
    return None


def parse_time(value: Any) -> time | None:
    if isinstance(value, time):
        return value
    if isinstance(value, datetime):
        return value.time().replace(second=0, microsecond=0)
    if not value:
        return None
    text = str(value).strip()
    for fmt in ("%H:%M", "%H:%M:%S"):
        try:
            return datetime.strptime(text, fmt).time()
        except ValueError:
            continue
    return None


def round_money(value: float) -> float:
    return round(float(value or 0), 2)
