// Keep Supabase's persistent max-age, path and SameSite defaults; only require HTTPS in production.
export const authCookieOptions = {
  secure: process.env.NODE_ENV === "production"
};
