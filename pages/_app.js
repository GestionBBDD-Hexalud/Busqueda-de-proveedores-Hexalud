// pages/_app.js
import Script from "next/script";
import "mapbox-gl/dist/mapbox-gl.css";
import "../styles/globals.css";

export default function MyApp({ Component, pageProps }) {
  return (
    <>
      {/* 🔑 Carga del script de Google Maps con la librería Places */}
      <Script
        src={`https://maps.googleapis.com/maps/api/js?key=${process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY}&libraries=places`}
        strategy="beforeInteractive"
      />

      {/* 🌐 Componente principal */}
      <Component {...pageProps} />
    </>
  );
}
