import { useOutletContext } from "react-router-dom";

import type { UserMe } from "./api";

export function isAdministrator(user?: Pick<UserMe, "role"> | null) {
  return user?.role === "admin";
}

export function roleLabel(role: UserMe["role"]) {
  return role === "admin" ? "Admin" : "Operator";
}

export function useCurrentUser() {
  return useOutletContext<{ user: UserMe }>().user;
}
