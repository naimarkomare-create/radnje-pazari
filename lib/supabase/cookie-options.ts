// Leave Supabase's persistence/SameSite defaults intact; browser auth still needs cookie access.
export const authCookieOptions = {
  secure: process.env.NODE_ENV === "production"
};
