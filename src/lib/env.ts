// Acceso centralizado a variables de entorno con mensajes claros si falta alguna.

function required(name: string): string {
  const v = process.env[name];
  if (!v) {
    throw new Error(
      `Falta la variable de entorno ${name}. Revisa tu .env.local (ver .env.example).`,
    );
  }
  return v;
}

export const env = {
  get supabaseUrl() {
    return required("NEXT_PUBLIC_SUPABASE_URL");
  },
  get supabaseAnonKey() {
    return required("NEXT_PUBLIC_SUPABASE_ANON_KEY");
  },
  get supabaseServiceRoleKey() {
    return required("SUPABASE_SERVICE_ROLE_KEY");
  },
  get anthropicApiKey() {
    return required("ANTHROPIC_API_KEY");
  },
  // Gemini (Google AI Studio). Opcional: si está, el OCR usa Gemini.
  get geminiApiKey() {
    return process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || "";
  },
  get ocrProvider(): "gemini" | "anthropic" {
    return this.geminiApiKey ? "gemini" : "anthropic";
  },
  get ocrModel() {
    if (process.env.OCR_MODEL) return process.env.OCR_MODEL;
    return this.ocrProvider === "gemini"
      ? "gemini-2.0-flash"
      : "claude-sonnet-4-6";
  },
};
