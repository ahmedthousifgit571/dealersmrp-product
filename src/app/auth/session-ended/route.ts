import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE } from "@/lib/auth/jwt";

// Reached when the session cookie is still valid but the database no longer accepts it
// (user deactivated, password reset, role changed). Server Components can't clear cookies,
// so the DAL redirects here; this clears the cookie and shows the sign-in page.
export function GET(request: NextRequest) {
  const response = NextResponse.redirect(new URL("/login?ended=1", request.url));
  response.cookies.delete(SESSION_COOKIE);
  return response;
}
