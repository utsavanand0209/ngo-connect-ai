import React, { useState, useEffect, useCallback } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet-routing-machine/dist/leaflet-routing-machine.css';
import { getNgos } from '../../services/api';
import L from 'leaflet';
import 'leaflet-routing-machine';

// Leaflet's default icon is not found in some setups.
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: require('leaflet/dist/images/marker-icon-2x.png'),
  iconUrl: require('leaflet/dist/images/marker-icon.png'),
  shadowUrl: require('leaflet/dist/images/marker-shadow.png'),
});

const userIcon = new L.Icon({
  iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-blue.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41]
});

const UserLocationMarker = ({ onLocationFound }) => {
  const map = useMap();
  const [position, setPosition] = useState(null);

  useEffect(() => {
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        const userPosition = [latitude, longitude];
        setPosition(userPosition);
        onLocationFound(userPosition);
        map.flyTo(userPosition, 13);
      },
      () => {
        console.log("Could not get user location");
      }
    );
  }, [map, onLocationFound]);

  return position === null ? null : (
    <Marker position={position} icon={userIcon}>
      <Popup>You are here</Popup>
    </Marker>
  );
};

const Routing = ({ start, end }) => {
  const map = useMap();

  useEffect(() => {
    if (!map || !start || !end) return;

    const routingControl = L.Routing.control({
      waypoints: [
        L.latLng(start[0], start[1]),
        L.latLng(end[0], end[1])
      ],
      routeWhileDragging: true
    }).addTo(map);

    return () => map.removeControl(routingControl);
  }, [map, start, end]);

  return null;
};

const MapFlyTo = ({ position }) => {
    const map = useMap();
  
    useEffect(() => {
      if (position) {
        map.flyTo(position, 15);
      }
    }, [map, position]);
  
    return null;
  }


const NgoMap = () => {
  const [ngos, setNgos] = useState([]);
  const [mapCenter, setMapCenter] = useState([12.9716, 77.5946]); // Bangalore center
  const [searchQuery, setSearchQuery] = useState('');
  const [tileLayer, setTileLayer] = useState('osm');
  const [userLocation, setUserLocation] = useState(null);
  const [destination, setDestination] = useState(null);
  const [selectedNgo, setSelectedNgo] = useState(null);

  const fetchNgos = useCallback(async (query) => {
    try {
      const response = await getNgos({ q: query });
      const ngosWithLocation = response.data.filter(ngo => ngo.location && ngo.location.coordinates);
      setNgos(ngosWithLocation);
      return ngosWithLocation;
    } catch (error) {
      console.error('Error fetching NGOs:', error);
      return [];
    }
  }, []);

  useEffect(() => {
    fetchNgos();
  }, [fetchNgos]);

  const handleSearch = async (e) => {
    e.preventDefault();
    const results = await fetchNgos(searchQuery);
    if (results.length > 0) {
        const foundNgo = results.find(ngo => ngo.name.toLowerCase() === searchQuery.toLowerCase());
        if(foundNgo) {
            setSelectedNgo(foundNgo);
        }
    }
  };

  const handleGetDirections = (ngo) => {
    if (userLocation) {
      setDestination([ngo.location.coordinates[1], ngo.location.coordinates[0]]);
    } else {
      alert("Please allow location access to get directions.");
    }
  };

  const tileLayers = {
    osm: {
      url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    },
    stamen: {
      url: 'https://stamen-tiles-{s}.a.ssl.fastly.net/toner/{z}/{x}/{y}{r}.png',
      attribution: 'Map tiles by <a href="http://stamen.com">Stamen Design</a>, <a href="http://creativecommons.org/licenses/by/3.0">CC BY 3.0</a> &mdash; Map data &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    },
    stamenWatercolor: {
        url: 'https://stamen-tiles-{s}.a.ssl.fastly.net/watercolor/{z}/{x}/{y}.png',
        attribution: 'Map tiles by <a href="http://stamen.com">Stamen Design</a>, <a href="http://creativecommons.org/licenses/by/3.0">CC BY 3.0</a> &mdash; Map data &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    }
  };

  return (
    <div style={{ position: 'relative', height: '100vh' }}>
      <div style={{ position: 'absolute', top: 10, right: 10, zIndex: 1000, background: 'white', padding: '10px', borderRadius: '5px' }}>
        <form onSubmit={handleSearch} style={{ marginBottom: '10px' }}>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search NGOs..."
            style={{ marginRight: '5px' }}
          />
          <button type="submit">Search</button>
        </form>
        <div>
          <label htmlFor="tile-layer-select">Map Style: </label>
          <select id="tile-layer-select" value={tileLayer} onChange={(e) => setTileLayer(e.target.value)}>
            <option value="osm">OpenStreetMap</option>
            <option value="stamen">Stamen Toner</option>
            <option value="stamenWatercolor">Stamen Watercolor</option>
          </select>
        </div>
      </div>
      <MapContainer center={mapCenter} zoom={12} style={{ height: '100%', width: '100%' }}>
        <TileLayer
          key={tileLayer}
          url={tileLayers[tileLayer].url}
          attribution={tileLayers[tileLayer].attribution}
        />
        <UserLocationMarker onLocationFound={setUserLocation} />
        {ngos.map(ngo => (
          <Marker key={ngo.id} position={[ngo.location.coordinates[1], ngo.location.coordinates[0]]}>
            <Popup>
              {ngo.name}
              <br />
              <button onClick={() => handleGetDirections(ngo)}>
                Get Directions
              </button>
            </Popup>
          </Marker>
        ))}
        {userLocation && destination && <Routing start={userLocation} end={destination} />}
        {selectedNgo && <MapFlyTo position={[selectedNgo.location.coordinates[1], selectedNgo.location.coordinates[0]]} />}
      </MapContainer>
    </div>
  );
};

export default NgoMap;
