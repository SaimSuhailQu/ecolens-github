import { useEffect, useRef } from 'react';
import { MapContainer, TileLayer, useMapEvents, useMap, LayersControl, GeoJSON, ZoomControl } from 'react-leaflet';
import { RegionGeometry, Coordinates, RegionAnalysis, AVAILABLE_INDICES } from '../types';
import L from 'leaflet';
import 'leaflet-draw';
import 'leaflet-draw/dist/leaflet.draw.css';
import icon from 'leaflet/dist/images/marker-icon.png';
import iconShadow from 'leaflet/dist/images/marker-shadow.png';
import iconRetina from 'leaflet/dist/images/marker-icon-2x.png';

// Fix for default marker icons in Leaflet with Vite/Webpack
delete (L.Icon.Default.prototype as any)._getIconUrl;

L.Icon.Default.mergeOptions({
  iconRetinaUrl: iconRetina,
  iconUrl: icon,
  shadowUrl: iconShadow,
});
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
  analysisCategory: string;
}

const LayerPlaceholder: React.FC = () => {
  return null; // Invisible layer until URL is loaded
};

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
        position: 'topright',
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
    contextmenu(e) { if (!drawingMode) onSelect({ lat: e.latlng.lat, lng: e.latlng.lng }); },
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

export const MapViewer: React.FC<MapViewerProps> = (props) => {
  const { 
    onLocationSelect, 
    analysis, 
    activeOverlay, 
    onOverlayAdd, 
    onOverlayRemove,
    drawingMode,
    onDrawCreate,
    customGeometry,
    selectedRegion,
    analysisCategory
  } = props;

  const getVisParams = () => {
    if (!activeOverlay) return null;
    const cleanName = activeOverlay.split(' (')[0].toLowerCase();
    const idx = AVAILABLE_INDICES.find(i => i.id === cleanName || i.name.toLowerCase() === cleanName || activeOverlay.includes(i.name));
    
    if (activeOverlay.startsWith('LULC')) {
      return { 
        params: { min: 0, max: 8, palette: ['#419BDF', '#397D49', '#88B053', '#7A87C6', '#E49635', '#DFC35A', '#C4281B', '#A59B8F', '#B39FE1'] }, 
        title: 'Land Cover' 
      };
    }

    if (!idx) return null;

    const palette = idx.category === 'Vegetation' ? ['#a50026', '#d73027', '#f46d43', '#fdae61', '#fee08b', '#ffffbf', '#d9ef8b', '#a6d96a', '#66bd63', '#1a9850', '#006837'] : 
                    idx.category === 'Water' ? ['#d7191c', '#fdae61', '#ffffbf', '#abd9e9', '#2c7bb6'] : 
                    idx.category === 'Burn' ? ['#000000', '#550000', '#aa0000', '#ff0000', '#ff5500', '#ffaa00', '#ffff00', '#00ff00'] : 
                    idx.category === 'Heat' ? ['#0d0887', '#5c01a6', '#9c179e', '#cc4678', '#ed7953', '#fdb32f', '#f0f921'] :
                    idx.id === 'pdsi' || idx.id === 'spei' ? ['#a50026', '#d73027', '#f46d43', '#fdae61', '#fee08b', '#ffffbf', '#d9ef8b', '#a6d96a', '#66bd63', '#1a9850', '#006837'] : ['#fde725', '#5ec962', '#21918c', '#3b528b', '#440154'];
    
    return { params: { 
      min: idx.category === 'Climate' ? -10 : idx.category === 'Heat' ? 10 : -1, 
      max: idx.category === 'Climate' ? 10 : idx.category === 'Heat' ? 50 : 1, 
      palette 
    }, title: idx.name };
  };

  const legendData = getVisParams();

  return (
    <div className="h-full w-full relative z-0">
      <MapContainer center={[20, 0]} zoom={2} scrollWheelZoom={true} className="h-full w-full bg-slate-900" zoomControl={false}>
        <ZoomControl position="topright" />
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
          
          {analysis && (
            <>
              {['Vegetation', 'Water', 'Burn', 'Urban', 'Geological', 'Climate', 'Heat']
                .filter(cat => analysisCategory === 'All' || cat === analysisCategory)
                .map(category => {
                  const categoryIndices = AVAILABLE_INDICES.filter(idx => idx.category === category && !['rainfall', 'temperature', 'pdsi', 'spei'].includes(idx.id));
                  return categoryIndices.map(idx => {
                    const viz = analysis.visualization?.[idx.id];
                    const isDefaultChecked = activeOverlay ? activeOverlay.includes(idx.name) : (idx.id === 'ndvi');
                    return (
                      <LayersControl.Overlay key={idx.id} name={`[${category}] ${idx.name} (${analysis.locationName})`} checked={isDefaultChecked}>
                        {viz?.url ? (
                          <TileLayer url={viz.url} attribution="Google Earth Engine" opacity={1.0} />
                        ) : (
                          <LayerPlaceholder />
                        )}
                      </LayersControl.Overlay>
                    );
                  });
                })}
              {/* Climate indices specifically */}
              {(analysisCategory === 'All' || analysisCategory === 'Climate') && ['pdsi', 'spei'].map(id => {
                const idx = AVAILABLE_INDICES.find(i => i.id === id);
                if (!idx) return null;
                const viz = analysis.visualization?.[idx.id];
                return (
                  <LayersControl.Overlay key={idx.id} name={`[Climate] ${idx.name} (${analysis.locationName})`}>
                    {viz?.url ? <TileLayer url={viz.url} attribution="Google Earth Engine" opacity={1.0} /> : <LayerPlaceholder />}
                  </LayersControl.Overlay>
                );
              })}
              {(analysisCategory === 'All' || analysisCategory === 'Urban') && analysis.visualization?.lulc?.url && (
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

      <div className="absolute bottom-[104px] right-6 z-[1000] flex flex-col gap-2 animate-in fade-in slide-in-from-right-4 duration-300">
        <div className="bg-slate-900/80 p-3 rounded-lg border border-slate-800 shadow-xl backdrop-blur-md w-40">
          <div className="flex items-center gap-2 mb-2">
            <Hexagon className="w-4 h-4 text-blue-400" />
            <span className="text-[10px] font-bold text-white uppercase tracking-wider">Map Controls</span>
          </div>
          <div className="flex flex-col gap-1.5">
             <div className="flex items-center gap-2 text-[9px] text-slate-400">
               <MousePointer2 size={10} className="text-slate-500" />
               <span>Click to select region</span>
             </div>
             <div className="flex items-center gap-2 text-[9px] text-slate-400">
               <Square size={10} className="text-slate-500" />
               <span>Draw custom areas</span>
             </div>
          </div>
        </div>
      </div>
    </div>
  );
};