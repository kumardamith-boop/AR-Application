import { useEffect, useState } from 'react';
import { MapContainer, Marker, TileLayer, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Btn, Modal, Note } from './ui.jsx';

const COLOMBO = [6.9271, 79.8612];
const pinIcon = L.divIcon({
  className: '',
  html: '<div style="width:26px;height:26px;border-radius:50% 50% 50% 0;background:#8e2a8c;transform:rotate(-45deg);border:3px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.35)"></div>',
  iconSize: [26, 26],
  iconAnchor: [13, 26],
});

function Recenter({ pos }) {
  const map = useMap();
  useEffect(() => { if (pos) map.setView(pos, Math.max(map.getZoom(), 16), { animate: false }); }, [pos, map]);
  return null;
}

function Clicker({ onPick }) {
  useMapEvents({ click: (e) => onPick([e.latlng.lat, e.latlng.lng]) });
  return null;
}

/** Small read-only map with the pickup pin. */
export function MapView({ lat, lng }) {
  if (lat == null || lng == null) return null;
  return (
    <div className="map-box">
      <MapContainer center={[lat, lng]} zoom={15} style={{ height: '100%', width: '100%' }} scrollWheelZoom={false}>
        <TileLayer attribution='&copy; OpenStreetMap contributors' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
        <Marker position={[lat, lng]} icon={pinIcon} />
      </MapContainer>
    </div>
  );
}

/** Pick the pickup point: tap the map or use the phone's location. */
export default function MapPicker({ lat, lng, onSave, onClose }) {
  const [pos, setPos] = useState(lat != null && lng != null ? [lat, lng] : null);
  const [msg, setMsg] = useState(null);
  const [jump, setJump] = useState(null);
  function here() {
    if (!navigator.geolocation) { setMsg('This device can\'t share its location.'); return; }
    navigator.geolocation.getCurrentPosition(
      (p) => { const at = [p.coords.latitude, p.coords.longitude]; setPos(at); setJump(at); setMsg(null); },
      () => setMsg('Location is blocked. Allow it in the browser, or tap the map instead.'),
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }
  return (
    <Modal title="Drop a pin" onClose={onClose} wide
      footer={<>
        {pos ? <Btn onClick={() => { onSave(null, null); onClose(); }}>Remove pin</Btn> : null}
        <Btn onClick={here}>Use my location</Btn>
        <Btn className="primary" disabled={!pos} onClick={() => { onSave(pos[0], pos[1]); onClose(); }}>Save pin</Btn>
      </>}>
      <p className="muted small">Tap the map where the driver should go.</p>
      {msg ? <Note kind="warn">{msg}</Note> : null}
      <div className="map-box tall" style={{ marginTop: 10 }}>
        <MapContainer center={pos || COLOMBO} zoom={pos ? 16 : 12} style={{ height: '100%', width: '100%' }} zoomAnimation={false} fadeAnimation={false} markerZoomAnimation={false}>
          <TileLayer attribution='&copy; OpenStreetMap contributors' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
          <Clicker onPick={setPos} />
          <Recenter pos={jump} />
          {pos ? <Marker position={pos} icon={pinIcon} /> : null}
        </MapContainer>
      </div>
    </Modal>
  );
}
