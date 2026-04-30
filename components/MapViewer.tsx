import { useEffect, useRef } from 'react';
import { MapContainer, TileLayer, useMapEvents, useMap, LayersControl, GeoJSON } from 'react-leaflet';
import { RegionGeometry, Coordinates, RegionAnalysis, AVAILABLE_INDICES } from '../types';
import L from 'leaflet';
import 'leaflet-draw';
import 'leaflet-draw/dist/leaflet.draw.css';
import { MapPin, MousePointer2, Square, Hexagon } from 'lucide-react';
import { Legend } from './Legend';

interface MapViewerProps {
  onLocationSelect: (coords: Coordinates) => void;
  analysis: RegionAnalysis | null;
  activeOverlay: string | null;
  onOverlayAdd: (name: string) => void;
  onOverlayRemove: (name: string) => void;
  drawingMode: boolean;
  onDrawCreate: (geojson: any) => void;
  customGeometry: any;
  selectedRegion: RegionGeometry | null;
}

const MapEvents: React.FC<{ 
  onSelect: (c: Coordinates) => void; 
  onOverlayAdd: (name: string) => void; 
  onOverlayRemove: (name: string) => void;
  drawingMode: boolean;
  onDrawCreate: (geojson: any) => void;
}> = ({ onSelect, onOverlayAdd, onOverlayRemove, drawingMode, onDrawCreate }) => {
  const map = useMap();
  const drawControlRef = useRef<L.Control.Draw | null>(null);

  useEffect(() => {
    if (drawingMode) {
      const drawControl = new L.Control.Draw({
        draw: { polygon: {}, polyline: false, rectangle: {}, circle: false, marker: false, circlemarker: false },
        edit: { featureGroup: new L.FeatureGroup().addTo(map), remove: true }
      });
      drawControlRef.current = drawControl;
      map.addControl(drawControl);

      const handleDraw = (e: any) => {
        onDrawCreate(e.layer.toGeoJSON());
      };

      map.on(L.Draw.Event.CREATED, handleDraw);
      return () => {
        map.off(L.Draw.Event.CREATED, handleDraw);
        if (drawControlRef.current) map.removeControl(drawControlRef.current);
      };
    }
  }, [drawingMode, map, onDrawCreate]);

  useMapEvents({
    click(e) { if (!drawingMode) onSelect({ lat: e.latlng.lat, lng: e.latlng.lng }); },
    overlayadd(e) { onOverlayAdd(e.name); },
    overlayremove(e) { onOverlayRemove(e.name); },
  });
  return null;
};

const RegionLayer: React.FC<{ analysis: RegionAnalysis | null, customGeometry: any, selectedRegion: RegionGeometry | null }> = ({ analysis, customGeometry, selectedRegion }) => {
  const map = useMap();
  const targetGeometry = analysis?.regionGeometry || selectedRegion?.geometry || customGeometry;

  useEffect(() => {
    if (targetGeometry) {
      const layer = L.geoJSON(targetGeometry);
      map.fitBounds(layer.getBounds(), { padding: [20, 20], maxZoom: 12 });
    }
  }, [targetGeometry, map]);

  return targetGeometry ? <GeoJSON key={JSON.stringify(targetGeometry.coordinates?.[0]?.[0])} data={targetGeometry} style={{ color: '#10b981', weight: 2, fillOpacity: 0.1 }} /> : null;
};

export const MapViewer: React.FC<MapViewerProps> = ({ 
  onLocationSelect, 
  analysis, 
  activeOverlay, 
  onOverlayAdd, 
  onOverlayRemove,
  drawingMode,
  onDrawCreate,
  customGeometry,
  selectedRegion
}) => {
  const getVisParams = () => {
    if (!activeOverlay) return null;
    const cleanName = activeOverlay.split(' (')[0].toLowerCase();
    const idx = AVAILABLE_INDICES.find(i => i.id === cleanName || i.name.toLowerCase() === cleanName);
    
    if (activeOverlay.startsWith('LULC')) {
      return { 
        params: { min: 0, max: 8, palette: ['#419BDF', '#397D49', '#88B053', '#7A87C6', '#E49635', '#DFC35A', '#C4281B', '#A59B8F', '#B39FE1'] }, 
        title: 'Land Cover' 
      };
    }

    if (!idx) return null;

    const palette = idx.category === 'Vegetation' ? ['#ffffe5', '#f7fcb9', '#d9f0a3', '#addd8e', '#78c679', '#41ab5d', '#238443', '#006837', '#004529'] : 
                    idx.category === 'Water' ? ['red', 'yellow', 'green', 'cyan', 'blue'] : 
                    idx.category === 'Burn' ? ['#7a5230', '#d5a478', '#fff5d7', '#d4e7b0', '#397d49'] : 
                    idx.id === 'pdsi' || idx.id === 'spei' ? ['#ff0000', '#ffffff', '#0000ff'] : ['#008000', '#ffff00', '#ff0000'];
    
    return { params: { min: idx.category === 'Climate' ? -10 : -1, max: idx.category === 'Climate' ? 10 : 1, palette }, title: idx.name };
  };

  const legendData = getVisParams();

  return (
    <div className="h-full w-full relative z-0">
      <MapContainer center={[20, 0]} zoom={2} scrollWheelZoom={true} className="h-full w-full bg-slate-900">
        <LayersControl position="topright">
          <LayersControl.BaseLayer checked name="Dark Matter (CartoDB)">
            <TileLayer attribution='&copy; CARTO' url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png" />
          </LayersControl.BaseLayer>
          <LayersControl.BaseLayer name="Satellite (Esri)">
            <TileLayer attribution='&copy; Esri' url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}" />
          </LayersControl.BaseLayer>

          <LayersControl.Overlay checked name="Region Boundary">
            <RegionLayer analysis={analysis} customGeometry={customGeometry} selectedRegion={selectedRegion} />
          </LayersControl.Overlay>
          
          {analysis && analysis.visualization && (
            <>
              {['Vegetation', 'Water', 'Burn', 'Urban', 'Geological', 'Climate'].map(category => {
                const categoryIndices = AVAILABLE_INDICES.filter(idx => idx.category === category);
                return categoryIndices.map(idx => {
                  const viz = analysis.visualization?.[idx.id];
                  if (!viz?.url) return null;
                  return (
                    <LayersControl.Overlay key={idx.id} name={`[${category}] ${idx.name} (${analysis.locationName})`} checked={idx.id === 'ndvi'}>
                      <TileLayer url={viz.url} attribution="Google Earth Engine" opacity={1.0} />
                    </LayersControl.Overlay>
                  );
                });
              })}
              {analysis.visualization.lulc?.url && (
                <LayersControl.Overlay name={`[Urban] LULC Land Cover (${analysis.locationName})`}>
                  <TileLayer url={analysis.visualization.lulc.url} attribution="Google Earth Engine" opacity={1.0} />
                </LayersControl.Overlay>
              )}
            </>
          )}
        </LayersControl>
        
        <MapEvents 
          onSelect={onLocationSelect} 
          onOverlayAdd={onOverlayAdd} 
          onOverlayRemove={onOverlayRemove}
          drawingMode={drawingMode}
          onDrawCreate={onDrawCreate}
        />
      </MapContainer>

      {drawingMode && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-[1000] bg-slate-900/90 border border-emerald-500/50 text-emerald-400 px-4 py-2 rounded-full shadow-2xl flex items-center gap-3 backdrop-blur-md">
          <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></div>
          <span className="text-sm font-bold tracking-wide uppercase">Drawing Mode Active</span>
          <div className="text-[10px] text-emerald-500/60 font-medium">Click on map to define points. Double click to close.</div>
        </div>
      )}

      {legendData && (
        <div className="absolute bottom-6 right-6 z-[1000] animate-in fade-in slide-in-from-right-4 duration-300">
          <Legend title={legendData.title} visParams={legendData.params} />
        </div>
      )}

      <div className="absolute bottom-6 left-6 z-[1000] flex flex-col gap-2">
        <div className="bg-slate-900/80 p-3 rounded-lg border border-slate-800 shadow-xl backdrop-blur-md">
          <div className="flex items-center gap-2 mb-2">
            <Hexagon className="w-4 h-4 text-blue-400" />
            <span className="text-xs font-bold text-white uppercase tracking-wider">Map Controls</span>
          </div>
          <div className="flex flex-col gap-1.5">
             <div className="flex items-center gap-2 text-[10px] text-slate-400">
               <MousePointer2 size={12} className="text-slate-500" />
               <span>Click to select region</span>
             </div>
             <div className="flex items-center gap-2 text-[10px] text-slate-400">
               <Square size={12} className="text-slate-500" />
               <span>Draw custom analysis areas</span>
             </div>
          </div>
        </div>
      </div>
    </div>
  );
};