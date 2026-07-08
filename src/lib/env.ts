// Acceso centralizado a variables de entorno con mensajes claros si falta alguna.
// OJO: el acceso debe ser estático (process.env.NOMBRE literal). Un lookup
// dinámico (process.env[nombre]) no se inlinea y llega vacío al proxy.

function required(name: string, v: string | undefined): string {
  if (!v) {
    throw new Error(
      `Falta la variable de entorno ${name}. Revisa tu .env.local (ver .env.example).`,
    );
  }
  return v;
}

export const env = {
  get supabaseUrl() {
    return required(
      "NEXT_PUBLIC_SUPABASE_URL",
      process.env.NEXT_PUBLIC_SUPABASE_URL,
    );
  },
  get supabaseAnonKey() {
    return required(
      "NEXT_PUBLIC_SUPABASE_ANON_KEY",
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    );
  },
  get supabaseServiceRoleKey() {
    return required(
      "SUPABASE_SERVICE_ROLE_KEY",
      process.env.SUPABASE_SERVICE_ROLE_KEY,
    );
  },
  get anthropicApiKey() {
    return required("ANTHROPIC_API_KEY", process.env.ANTHROPIC_API_KEY);
  },
  // OpenAI. Opcional: si está, el OCR usa OpenAI.
  get openaiApiKey() {
    return process.env.OPENAI_API_KEY || "";
  },
  // Gemini (Google AI Studio). Opcional.
  get geminiApiKey() {
    return process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || "";
  },
  // Proveedor del OCR según la key presente (precedencia: OpenAI → Gemini → Claude).
  get ocrProvider(): "openai" | "gemini" | "anthropic" {
    if (this.openaiApiKey) return "openai";
    if (this.geminiApiKey) return "gemini";
    return "anthropic";
  },
  get ocrModel() {
    if (process.env.OCR_MODEL) return process.env.OCR_MODEL;
    if (this.ocrProvider === "openai") return "gpt-4o-mini";
    if (this.ocrProvider === "gemini") return "gemini-2.0-flash";
    return "claude-sonnet-4-6";
  },
};
