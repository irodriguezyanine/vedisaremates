export function SiteFooter() {
  return (
    <footer className="mt-auto border-t border-black/10 bg-neutral-100 text-neutral-700">
      <div className="mx-auto max-w-7xl space-y-6 px-4 py-10 text-sm sm:px-6 lg:px-8">
        <p className="text-xs leading-relaxed text-neutral-600">
          La información publicada es referencial, complementada con fotografías y videos. Los vehículos se
          encuentran en exhibición para verificar su estado en forma presencial.{" "}
          <strong className="text-neutral-800">VEDISA REMATES</strong> garantiza la información publicada en
          nuestros recintos; una vez retirada de nuestras bodegas, se entiende aceptada a entera conformidad,
          sin derecho a reclamos posteriores respecto a su estado y equipamiento.
        </p>

        <div className="flex flex-wrap gap-4 border-t border-neutral-200 pt-6 text-neutral-600">
          <span className="hover:text-[#33C7E3] cursor-default">Ayuda</span>
          <span className="hover:text-[#33C7E3] cursor-default">Contáctenos</span>
          <span className="hover:text-[#33C7E3] cursor-default">Acerca de</span>
          <span className="hover:text-[#33C7E3] cursor-default">Términos y condiciones</span>
          <span className="hover:text-[#33C7E3] cursor-default">Política de privacidad</span>
          <span className="hover:text-[#33C7E3] cursor-default">Mapa del sitio</span>
        </div>

        <div className="space-y-2 border-t border-neutral-200 pt-6 text-sm">
          <p>
            <strong>Oficinas:</strong> Américo Vespucio 2880, Piso 7
          </p>
          <p>
            <strong>Exhibición:</strong> Arturo Prat 6457, Noviciado, Pudahuel
          </p>
          <p>
            <strong>Horario:</strong> Lun–Vie 9:00–13:00 / 14:00–17:00 · Sáb–Dom cerrado
          </p>
          <p className="rounded bg-white/80 px-3 py-2 text-neutral-700 ring-1 ring-neutral-200">
            <strong>Remates 100% online:</strong> puede revisar las unidades pre-compra presencialmente en
            nuestra bodega sin necesidad de garantía.
          </p>
        </div>

        <p className="border-t border-neutral-200 pt-6 text-xs text-neutral-500">
          © Copyright {new Date().getFullYear()} VEDISA REMATES. Todos los derechos reservados.
        </p>
      </div>
    </footer>
  );
}
