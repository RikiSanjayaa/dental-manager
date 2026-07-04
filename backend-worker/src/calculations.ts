export type TimeText = string | null | undefined;

export type AttendanceRuleShape = {
  timezone1_start: string;
  timezone1_end: string;
  timezone2_start: string;
  timezone2_end: string;
  overtime_min_minutes: number;
  overtime_max_minutes: number;
};

export type AttendanceRecordShape = {
  work_date: string;
  timezone1_in?: TimeText;
  timezone1_out?: TimeText;
  timezone2_in?: TimeText;
  timezone2_out?: TimeText;
  is_holiday: boolean | number;
  late_minutes?: number;
  early_leave_minutes?: number;
  absent_minutes?: number;
  is_absent?: boolean;
  total_minutes?: number;
  overtime_minutes?: number;
  is_sunday?: boolean;
  is_double_shift?: boolean;
};

export type DoctorTransactionShape = {
  qty: number;
  discount_amount: number;
  bhp_override?: number | null;
  price_override?: number | null;
  special_fee_amount: number;
  fee_rate?: number | null;
  service_amount?: number;
  doctor_fee_amount?: number;
  total_bill_amount?: number;
};

export type TreatmentShape = {
  bhp_cost: number;
  treatment_price: number;
} | null;

export type DoctorShape = {
  normal_fee_rate: number;
};

export type DoctorFeeRuleShape = {
  normal_fee_rate: number;
};

export type PayrollRecordShape = {
  base_salary?: number;
  working_days?: number;
  overtime_rate_per_minute?: number;
  overtime_minutes?: number;
  auto_sunday_count?: number;
  auto_double_shift_count?: number;
  sunday_count_override?: number | null;
  double_shift_count_override?: number | null;
  sunday_count?: number;
  double_shift_count?: number;
  double_shift_fee?: number;
  sunday_fee?: number;
  overtime_total?: number;
  bonus: number;
  position_allowance: number;
  bpjs_deduction?: number;
  other_deduction: number;
  pph21?: number;
  net_salary?: number;
  bank_name?: string | null;
  account_name?: string | null;
  account_number?: string | null;
};

export type EmployeeShape = {
  name: string;
  base_salary: number;
  working_days: number;
  is_training: boolean | number;
  bank_name?: string | null;
  account_name?: string | null;
  account_number?: string | null;
};

export type PayrollRuleShape = {
  default_base_salary: number;
  bpjs_jht_rate: number;
  overtime_rate_per_minute: number;
  pph21_threshold: number;
  pph21_rate: number;
  holiday_double_shift_fee: number;
};

export function roundMoney(value: number): number {
  return Math.round(value);
}

export function minutesOfDay(value: TimeText): number | null {
  if (!value) return null;
  const [hour, minute] = value.split(":").map(Number);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null;
  return hour * 60 + minute;
}

export function positiveDiff(later: TimeText, earlier: TimeText): number {
  const laterMinutes = minutesOfDay(later);
  const earlierMinutes = minutesOfDay(earlier);
  if (laterMinutes == null || earlierMinutes == null) return 0;
  return Math.max(laterMinutes - earlierMinutes, 0);
}

export function shiftOvertime(actualOut: TimeText, scheduledOut: TimeText, minMinutes: number, maxMinutes: number): number {
  const minutes = positiveDiff(actualOut, scheduledOut);
  return minutes > Math.max(minMinutes, 0) ? Math.min(minutes, Math.max(maxMinutes, 0)) : 0;
}

function shiftDuration(actualIn: TimeText, actualOut: TimeText): number {
  return positiveDiff(actualOut, actualIn);
}

function isTruthy(value: unknown): boolean {
  return value === true || value === 1 || value === "1";
}

function isSunday(dateText: string): boolean {
  return new Date(`${dateText}T00:00:00Z`).getUTCDay() === 0;
}

export function attendedDoubleShift(record: AttendanceRecordShape, _rule: AttendanceRuleShape): boolean {
  const hasBothShiftLogs = Boolean(record.timezone1_in || record.timezone1_out) && Boolean(record.timezone2_in || record.timezone2_out);
  return hasBothShiftLogs;
}

export function calculateAttendanceRecord<T extends AttendanceRecordShape>(record: T, rule: AttendanceRuleShape): T {
  const hasAnyTime = Boolean(record.timezone1_in || record.timezone1_out || record.timezone2_in || record.timezone2_out);
  const dayOff = isTruthy(record.is_holiday);
  record.is_sunday = isSunday(record.work_date);

  if (!hasAnyTime) {
    record.late_minutes = 0;
    record.early_leave_minutes = 0;
    record.absent_minutes = dayOff ? 0 : positiveDiff(rule.timezone1_end, rule.timezone1_start);
    record.is_absent = !dayOff;
    record.total_minutes = 0;
    record.overtime_minutes = 0;
    record.is_double_shift = false;
    return record;
  }

  if (dayOff) {
    record.late_minutes = 0;
    record.early_leave_minutes = 0;
    record.absent_minutes = 0;
    record.is_absent = false;
    record.total_minutes = 0;
    record.overtime_minutes = 0;
    record.is_double_shift = attendedDoubleShift(record, rule);
    return record;
  }

  const late1 = positiveDiff(record.timezone1_in, rule.timezone1_start);
  const early1 = positiveDiff(rule.timezone1_end, record.timezone1_out);
  const late2 = positiveDiff(record.timezone2_in, rule.timezone2_start);
  const early2 = positiveDiff(rule.timezone2_end, record.timezone2_out);
  record.late_minutes = late1 + late2;
  record.early_leave_minutes = early1 + early2;
  record.absent_minutes = 0;
  record.is_absent = false;
  record.total_minutes = record.late_minutes + record.early_leave_minutes;
  record.overtime_minutes = Math.min(
    shiftOvertime(record.timezone1_out, rule.timezone1_end, rule.overtime_min_minutes, rule.overtime_max_minutes) +
      shiftOvertime(record.timezone2_out, rule.timezone2_end, rule.overtime_min_minutes, rule.overtime_max_minutes),
    rule.overtime_max_minutes
  );
  record.is_double_shift = attendedDoubleShift(record, rule);
  return record;
}

export function calculateDoctorTransaction<T extends DoctorTransactionShape>(
  transaction: T,
  treatment: TreatmentShape,
  doctor: DoctorShape,
  defaultRule: DoctorFeeRuleShape
): T {
  const bhp = transaction.bhp_override ?? treatment?.bhp_cost ?? 0;
  const price = transaction.price_override ?? treatment?.treatment_price ?? 0;
  const rate = transaction.fee_rate ?? doctor.normal_fee_rate ?? defaultRule.normal_fee_rate;
  const serviceAmount = price * transaction.qty - bhp * transaction.qty - transaction.discount_amount;
  const doctorFee = transaction.special_fee_amount ? transaction.special_fee_amount : serviceAmount * rate;
  const totalBill = price * transaction.qty - transaction.discount_amount;
  transaction.service_amount = roundMoney(serviceAmount);
  transaction.doctor_fee_amount = roundMoney(doctorFee);
  transaction.total_bill_amount = roundMoney(totalBill);
  return transaction;
}

export function effectiveBaseSalary(employee: EmployeeShape, rule: PayrollRuleShape): number {
  const baseSalary = employee.base_salary || rule.default_base_salary || 0;
  return isTruthy(employee.is_training) ? roundMoney(baseSalary * 0.8) : baseSalary;
}

export function calculatePayrollRecord<T extends PayrollRecordShape>(
  record: T,
  employee: EmployeeShape,
  rule: PayrollRuleShape,
  attendanceRows: AttendanceRecordShape[]
): T {
  record.base_salary = effectiveBaseSalary(employee, rule);
  record.working_days = employee.working_days || 25;
  record.overtime_rate_per_minute = rule.overtime_rate_per_minute;
  const autoOvertime = attendanceRows.reduce((sum, row) => sum + (row.overtime_minutes || 0), 0);
  const autoSunday = attendanceRows.filter(
    (row) => isTruthy(row.is_holiday) && Boolean(row.timezone1_in || row.timezone1_out || row.timezone2_in || row.timezone2_out)
  ).length;
  const autoDouble = attendanceRows.filter((row) => row.is_double_shift).length;
  record.overtime_minutes = autoOvertime;
  record.auto_sunday_count = autoSunday;
  record.auto_double_shift_count = autoDouble;
  record.sunday_count = record.sunday_count_override ?? autoSunday;
  record.double_shift_count = record.double_shift_count_override ?? autoDouble;
  const allowanceRate = rule.holiday_double_shift_fee || 90000;
  record.double_shift_fee = roundMoney(record.double_shift_count * allowanceRate);
  record.sunday_fee = roundMoney(record.sunday_count * allowanceRate);
  record.overtime_total = roundMoney(record.overtime_minutes * record.overtime_rate_per_minute);
  record.bpjs_deduction = roundMoney(record.base_salary * rule.bpjs_jht_rate);
  const gross =
    record.base_salary +
    record.double_shift_fee +
    record.sunday_fee +
    record.overtime_total +
    record.bonus +
    record.position_allowance;
  record.pph21 = roundMoney(gross > rule.pph21_threshold ? gross * rule.pph21_rate : 0);
  record.net_salary = roundMoney(gross - record.bpjs_deduction - record.other_deduction - record.pph21);
  record.bank_name = record.bank_name || employee.bank_name || null;
  record.account_name = record.account_name || employee.account_name || employee.name;
  record.account_number = record.account_number || employee.account_number || null;
  return record;
}
