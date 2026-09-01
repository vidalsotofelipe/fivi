/**
 * Constantes de idioma sin dependencias de `i18next`/React, para poder
 * importarlas desde el `layout.tsx` (server component) sin arrastrar la
 * inicialización de react-i18next al bundle del servidor.
 */

export const LANG_STORAGE_KEY = "fivi:lang";

/**
 * Script (sin JSX) que corre en `<head>` antes del paint: deja `<html lang>` en
 * el idioma efectivo (preferencia guardada > navegador > es) desde la primera
 * carga, así el atributo, el selector y el texto coinciden.
 */
export const langInitScript = `(function(){try{var s=localStorage.getItem('${LANG_STORAGE_KEY}');var l=(s==='es'||s==='en')?s:((navigator.language||'').toLowerCase().indexOf('en')===0?'en':'es');document.documentElement.lang=l;}catch(e){}})();`;
