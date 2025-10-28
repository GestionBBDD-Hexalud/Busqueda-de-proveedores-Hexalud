// components/AddressAutocomplete.jsx
import React, { useEffect, useRef } from "react";

export default function AddressAutocomplete({ onSelect }) {
  const inputRef = useRef(null);
  const acRef = useRef(null);

  useEffect(() => {
    const tryInit = () => {
      if (!window.google || !window.google.maps || !window.google.maps.places) {
        // retry later if script still not loaded
        return;
      }
      if (!inputRef.current) return;

      acRef.current = new window.google.maps.places.Autocomplete(inputRef.current, {
        fields: ["formatted_address", "geometry", "address_components"],
        componentRestrictions: { country: "mx" },
        types: ["address"]
      });

      acRef.current.addListener("place_changed", () => {
        const place = acRef.current.getPlace();
        if (!place) return;
        if (!place.geometry) {
          onSelect?.({ address: place.formatted_address || "", lat: null, lng: null, raw: place });
          return;
        }
        const loc = place.geometry.location.toJSON();
        onSelect?.({ address: place.formatted_address, lat: loc.lat, lng: loc.lng, raw: place });
      });
    };

    // If google script is already loaded
    if (window.google && window.google.maps && window.google.maps.places) {
      tryInit();
    } else {
      // Poll for script (simple and robust)
      const interval = setInterval(() => {
        if (window.google && window.google.maps && window.google.maps.places) {
          clearInterval(interval);
          tryInit();
        }
      }, 500);
      return () => clearInterval(interval);
    }
  }, [onSelect]);

  return (
    <input
      ref={inputRef}
      type="text"
      placeholder="Escribe una dirección..."
      className="w-full border rounded px-3 py-2"
      aria-label="Autocompletado de dirección"
    />
  );
}
