"use client";

const WHATSAPP_DIRECT_URL = "https://api.whatsapp.com/send/?phone=56989323397&text&type=phone_number&app_absent=0";

export function FloatingWhatsAppButton() {
  return (
    <a
      href={WHATSAPP_DIRECT_URL}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Habla con nosotros por WhatsApp"
      className="fixed bottom-4 right-4 z-[70] inline-flex items-center gap-2 rounded-full border border-emerald-400/40 bg-emerald-500 px-3 py-2 text-xs font-bold text-white shadow-lg shadow-emerald-900/25 transition hover:bg-emerald-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300 focus-visible:ring-offset-2"
    >
      <svg viewBox="0 0 32 32" className="h-4 w-4" aria-hidden>
        <path
          fill="currentColor"
          d="M19.11 17.2c-.26-.13-1.52-.75-1.76-.84-.24-.09-.41-.13-.58.13-.17.26-.67.84-.82 1.01-.15.17-.3.2-.56.07-.26-.13-1.1-.41-2.1-1.3-.77-.69-1.3-1.54-1.45-1.8-.15-.26-.02-.4.11-.53.12-.12.26-.3.39-.45.13-.15.17-.26.26-.43.09-.17.04-.32-.02-.45-.07-.13-.58-1.4-.8-1.92-.21-.5-.43-.43-.58-.44l-.5-.01c-.17 0-.45.07-.69.32-.24.26-.91.89-.91 2.17 0 1.27.93 2.5 1.06 2.67.13.17 1.82 2.77 4.42 3.89.62.27 1.1.43 1.48.55.62.2 1.18.17 1.62.1.5-.07 1.52-.62 1.74-1.22.22-.6.22-1.11.15-1.22-.07-.11-.24-.17-.5-.3Z"
        />
        <path
          fill="currentColor"
          d="M16.01 5.33c-5.87 0-10.64 4.77-10.64 10.63 0 1.88.49 3.71 1.43 5.33L5.3 26.67l5.52-1.45a10.58 10.58 0 0 0 5.19 1.33h.01c5.86 0 10.63-4.77 10.63-10.63S21.88 5.33 16.01 5.33Zm0 19.36h-.01a8.72 8.72 0 0 1-4.45-1.22l-.32-.19-3.28.86.88-3.2-.21-.33a8.75 8.75 0 0 1-1.34-4.65c0-4.82 3.92-8.74 8.75-8.74 2.34 0 4.53.91 6.18 2.56a8.69 8.69 0 0 1 2.56 6.19c0 4.82-3.92 8.74-8.74 8.74Z"
        />
      </svg>
      <span>¡Habla con nosotros!</span>
    </a>
  );
}

