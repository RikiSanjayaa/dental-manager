import { useOutletContext } from "react-router-dom";

import type { UserMe } from "./api";

export function isAdministrator(user?: Pick<UserMe, "role"> | null) {
  return user?.role === "admin";
}

export function isOperator(user?: Pick<UserMe, "role"> | null) {
  return user?.role === "operator";
}

export function isDoctor(user?: Pick<UserMe, "role"> | null) {
  return user?.role === "doctor";
}

export function roleLabel(role: UserMe["role"]) {
  if (role === "admin") return "Admin";
  if (role === "doctor") return "Dokter";
  return "Operator";
}

export function useCurrentUser() {
  return useOutletContext<{ user: UserMe }>().user;
}
