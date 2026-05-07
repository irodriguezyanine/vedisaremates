import type { ReactNode } from "react";

export type FaqEntry = {
  q: string;
  body: ReactNode;
};

export const FAQ_ITEMS: FaqEntry[] = [
  {
    q: "¿Cómo participar en los remates?",
    body: (
      <>
        <p>
          Completa el registro como nuevo usuario. Si ya estás registrado, ingresa con tu usuario y contraseña
          tras pagar la garantía.
        </p>
        <p className="mt-2">
          Al terminar el registro recibirás un código de verificación en tu correo. Para activar tu cuenta debes
          pagar la garantía ($300.000) por transferencia o depósito. Si transfieres, incluye tu{" "}
          <strong>nombre de usuario</strong> en el comentario.
        </p>
      </>
    ),
  },
  {
    q: "¿Dónde depositar o transferir la garantía?",
    body: (
      <>
        <p>Cuenta Banco de Chile — corriente — N° 08490043006 — RUT 76.114.336-0 — Razón social Vedisa Remates.</p>
        <p className="mt-2">
          Consultas de pago:{" "}
          <a href="mailto:pagos@vedisaremates.cl" className="font-bold text-emerald-700 hover:underline">
            pagos@vedisaremates.cl
          </a>
        </p>
      </>
    ),
  },
  {
    q: "¿Cómo activo mi cuenta después de pagar la garantía?",
    body: (
      <>
        <p>
          Envía el comprobante, el <strong>RUT de quien transfirió</strong> y tu <strong>usuario</strong> por
          WhatsApp <strong>+56 9 8932 3397</strong> o a{" "}
          <a className="font-bold text-emerald-700 hover:underline" href="mailto:pagos@vedisaremates.cl">
            pagos@vedisaremates.cl
          </a>
          . Recibirás confirmación cuando la cuenta esté habilitada.
        </p>
      </>
    ),
  },
  {
    q: "¿Dónde se exhiben los vehículos?",
    body: (
      <p>
        Bodega <strong>Arturo Prat 6457, Noviciado, Pudahuel</strong> — entrada norte, portón al final de Juan
        de La Fuente. Consulta horarios vigentes en la web o Contact Center.
      </p>
    ),
  },
  {
    q: "¿Contraseña olvidada?",
    body: (
      <p>
        Usa «¿Olvidó su contraseña?» en el inicio de sesión cuando integremos Supabase Auth. Si no llega el
        correo, revisa spam y contáctanos.
      </p>
    ),
  },
  {
    q: "¿Por qué no recibo correos?",
    body: (
      <ul className="mt-2 list-disc space-y-1 pl-5">
        <li>Revisa spam y filtros corporativos.</li>
        <li>Outlook/Hotmail a veces bloquean activación — preferimos Gmail o correo empresa.</li>
        <li>Verifica que el correo registrado sea el correcto.</li>
      </ul>
    ),
  },
  {
    q: "¿Nombre de usuario no válido?",
    body: (
      <p>
        Solo letras, números, guión y guión bajo. Sin espacios. Ejemplo: <code className="rounded bg-neutral-100 px-1">MI_USUARIO</code>.
      </p>
    ),
  },
  {
    q: "¿Usuario o correo ya existe?",
    body: (
      <p>
        Ambos deben ser únicos. Si el correo existe, usa recuperación de contraseña para acceder nuevamente.
      </p>
    ),
  },
];
