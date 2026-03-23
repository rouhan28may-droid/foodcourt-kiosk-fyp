window.FC = window.FC || {};

(function () {
  const SUPABASE_URL = "https://nlirwrrnpslzumlqeijg.supabase.co";
  const SUPABASE_ANON_KEY = "sb_publishable_QJGJEqNfZnfEGUzPnI0cKw_0I7-yuUV";

  function validUrl(v) {
    return typeof v === "string" && /^https:\/\/.+/i.test(v);
  }

  if (!window.supabase || typeof window.supabase.createClient !== "function") {
    console.error("Supabase CDN library is not loaded before supabaseclient.js");
    FC.supabase = null;
    window.DB = null;
    return;
  }

  if (!validUrl(SUPABASE_URL)) {
    console.error("Invalid Supabase URL:", SUPABASE_URL);
    FC.supabase = null;
    window.DB = null;
    return;
  }

  if (!SUPABASE_ANON_KEY || typeof SUPABASE_ANON_KEY !== "string") {
    console.error("Invalid Supabase publishable key.");
    FC.supabase = null;
    window.DB = null;
    return;
  }

  try {
    const client = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true
      },
      realtime: {
        params: {
          eventsPerSecond: 10
        }
      }
    });

    FC.supabase = client;
    window.DB = client;
    console.log("Supabase client initialized.");
  } catch (err) {
    console.error("Failed to initialize Supabase client:", err);
    FC.supabase = null;
    window.DB = null;
  }
})();