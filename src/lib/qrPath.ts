/**
 * Matriz de módulos de un QR → un único `d` de SVG `<path>`.
 *
 * Se separa del componente porque es acá donde algo puede romperse en
 * silencio: si se invierten `x` e `y`, el QR sale transpuesto y ningún lector
 * lo levanta, pero en pantalla se ve igual de "correcto" que uno bueno. Con
 * la función aparte se puede testear la orientación sin renderizar React.
 *
 * Un solo `<path>` en vez de un `<rect>` por módulo: mismo dibujo, un nodo.
 */
export function qrPath(matrix: readonly (readonly boolean[])[]): string {
  let d = "";
  for (let y = 0; y < matrix.length; y++) {
    const row = matrix[y];
    if (!row) continue;
    for (let x = 0; x < row.length; x++) {
      // `M<x> <y>` = columna, fila. El orden importa: la matriz se indexa
      // [fila][columna], el SVG se dibuja [x][y].
      if (row[x]) d += `M${x} ${y}h1v1h-1z`;
    }
  }
  return d;
}
