import { NextResponse, type NextRequest } from "next/server";

/** Sender ikke-indloggede brugere til login før /app og /onboarding. Den egentlige adgangskontrol sker på serveren. */
export function proxy(request: NextRequest) {
  const hasSession = request.cookies.has("fluks_session");
  if (!hasSession) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", request.nextUrl.pathname + request.nextUrl.search);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/app/:path*", "/onboarding/:path*"],
};
