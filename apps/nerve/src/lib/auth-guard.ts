import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions, type AppRole } from "./auth";

// Generic guard. Default requires founder. Supervisor pages call
// requireSession({ role: "supervisor" }).
//
// On role mismatch we redirect to the appropriate login page rather
// than forbidding outright — keeps the UX honest about which login
// the user needs.
export async function requireSession(opts: { role?: AppRole } = {}) {
  const session = await getServerSession(authOptions);
  const required: AppRole = opts.role ?? "founder";
  if (!session) {
    redirect(required === "supervisor" ? "/supervisor/login" : "/login");
  }
  const userRole = (session.user as { role?: AppRole }).role ?? "founder";
  if (userRole !== required) {
    // Hard isolation: a founder cannot peek into supervisor view and
    // vice versa. Per spec.
    redirect(required === "supervisor" ? "/supervisor/login" : "/login");
  }
  return session;
}
