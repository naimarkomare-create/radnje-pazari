import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { authCookieOptions } from "@/lib/supabase/cookie-options";
import {
  isConfirmedInvalidSessionError,
  isSupabaseAuthCookieName
} from "@/lib/supabase/auth-errors";

type CookieToSet = {
  name: string;
  value: string;
  options: CookieOptions;
};

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({
    request: {
      headers: request.headers
    }
  });

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    return response;
  }

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookieOptions: authCookieOptions,
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet: CookieToSet[]) {
        cookiesToSet.forEach(({ name, value }) => {
          request.cookies.set(name, value);
        });

        response = NextResponse.next({
          request: {
            headers: request.headers
          }
        });

        cookiesToSet.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, options);
        });
      }
    }
  });

  const hadAuthCookie = request.cookies
    .getAll()
    .some((cookie) => isSupabaseAuthCookieName(cookie.name));
  const {
    data: { user },
    error
  } = await supabase.auth.getUser();
  const pathname = request.nextUrl.pathname;
  const confirmedMissingSession =
    !user && (!error || isConfirmedInvalidSessionError(error));

  if (
    confirmedMissingSession &&
    (isProtectedPage(pathname) || (pathname === "/login" && hadAuthCookie))
  ) {
    return redirectToLogin({
      request,
      response,
      sessionExpired: hadAuthCookie
    });
  }

  if (pathname.startsWith("/api/") && !user && error && !confirmedMissingSession) {
    const temporaryResponse = NextResponse.json(
      {
        error: "Provera sesije trenutno nije dostupna. Pokušajte ponovo."
      },
      { status: 503 }
    );
    copyResponseCookies(response, temporaryResponse);
    temporaryResponse.headers.set("Cache-Control", "private, no-store");
    return temporaryResponse;
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|api/cron|api/cleanup-shelf-photos|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js|map|woff|woff2|ttf|xlsx|webmanifest)$).*)"
  ]
};

function isProtectedPage(pathname: string) {
  return (
    pathname === "/" ||
    pathname === "/admin" ||
    pathname.startsWith("/admin/") ||
    pathname === "/store" ||
    pathname.startsWith("/store/") ||
    pathname === "/povrati" ||
    pathname.startsWith("/povrati/")
  );
}

function redirectToLogin({
  request,
  response,
  sessionExpired
}: {
  request: NextRequest;
  response: NextResponse;
  sessionExpired: boolean;
}) {
  const loginUrl = request.nextUrl.clone();
  loginUrl.pathname = "/login";
  loginUrl.search = sessionExpired ? "?reason=session_expired" : "";

  const redirectResponse = NextResponse.redirect(loginUrl);

  copyResponseCookies(response, redirectResponse);

  if (sessionExpired) {
    request.cookies
      .getAll()
      .filter((cookie) => isSupabaseAuthCookieName(cookie.name))
      .forEach((cookie) => {
        redirectResponse.cookies.set({
          name: cookie.name,
          value: "",
          maxAge: 0,
          path: "/",
          sameSite: "lax",
          secure: process.env.NODE_ENV === "production"
        });
      });
  }

  redirectResponse.headers.set("Cache-Control", "private, no-store");
  return redirectResponse;
}

function copyResponseCookies(source: NextResponse, target: NextResponse) {
  source.cookies.getAll().forEach((cookie) => {
    target.cookies.set(cookie);
  });
}
