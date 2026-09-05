"use client";

/**
 * QR como SVG, generado **en el dispositivo**.
 *
 * El contenido es un enlace de invitación: quien lo tiene, entra al grupo. Por
 * eso NO se usa ningún generador de QR de terceros (los que arman la imagen
 * desde una URL tipo `api.qrserver.com/?data=<link>`): eso sería mandarle el
 * token de acceso a un servidor ajeno. `uqr` sólo calcula la matriz; el dibujo
 * se arma acá y nunca sale nada del dispositivo. Además funciona sin conexión.
 */
import { encode } from "uqr";
import { qrPath } from "@/lib/qrPath";

export function QrCode({
  value,
  label,
  size = 256,
}: {
  value: string;
  /** Nombre accesible: un QR es opaco para quien no puede escanearlo. */
  label: string;
  /** Lado del SVG en px (el QR es cuadrado). */
  size?: number;
}) {
  // `border: 4` = zona de silencio que pide la especificación. Va dentro de la
  // matriz, así el margen blanco viaja con la imagen y el QR se lee aunque
  // quede sobre un fondo de color.
  const { size: modules, data } = encode(value, { border: 4 });
  const d = qrPath(data);

  return (
    <svg
      viewBox={`0 0 ${modules} ${modules}`}
      width={size}
      height={size}
      role="img"
      aria-label={label}
      shapeRendering="crispEdges"
      className="h-auto w-full max-w-[256px]"
    >
      {/*
        Blanco y negro fijos, NO los tokens del tema: un QR tintado con la
        paleta (o invertido en modo oscuro) pierde contraste y hay lectores
        que no lo levantan. Es una imagen para una cámara, no para el ojo.
      */}
      <rect width={modules} height={modules} fill="#ffffff" />
      <path d={d} fill="#000000" />
    </svg>
  );
}
