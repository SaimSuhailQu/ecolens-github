import React, { useState, useRef } from 'react';
import { MapViewer } from './components/MapViewer';
import { DynamicIndexChart, ClimateChart } from './components/Charts';
import { LandCoverDonut } from './components/LandCoverDonut';
import { LULCChart } from './components/LULCChart';
import { CodeBlock } from './components/CodeBlock';
import { analyzeRegionWithGEE, initializeGEE, getRegionFromCoords, getExportUrl, getCountries, getProvinces, getDistricts, getTehsils, getLazyMapId } from './services/earthEngineService';
import { Coordinates, RegionAnalysis, AnalysisStatus, AnalysisLevel, AVAILABLE_INDICES, RegionGeometry } from './types';
import toGeoJSON from 'togeojson';
import shp from 'shpjs';
import JSZip from 'jszip';
import {
  Activity,
  Code,
  Map as MapIcon,
  Loader2,
  Square,
  Terminal,
  Leaf,
  Calendar,
  Settings,
  Globe,
  AlertTriangle,
  Search,
  Download,
  X,
  Camera,
  FileText,
  Image as ImageIcon,
  Menu,
  ChevronLeft,
  MapPin
} from 'lucide-react';
import { unparse } from 'papaparse';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';

const App: React.FC = () => {
  const [selectedRegion, setSelectedRegion] = useState<RegionGeometry | null>(null);
  const [analysis, setAnalysis] = useState<RegionAnalysis | null>(null);
  const [status, setStatus] = useState<AnalysisStatus>(AnalysisStatus.IDLE);
  const [activeTab, setActiveTab] = useState<'dashboard' | 'code'>('dashboard');
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear() - 1);
  const [startDate, setStartDate] = useState<string>(`${selectedYear}-01-01`);
  const [endDate, setEndDate] = useState<string>(`${selectedYear}-12-31`);
  const [analysisLevel, setAnalysisLevel] = useState<AnalysisLevel>('0');
  const [resolution, setResolution] = useState<number>(30);
  const [activeOverlay, setActiveOverlay] = useState<string | null>(null);
  const [drawingMode, setDrawingMode] = useState<boolean>(false);
  const [customGeometry, setCustomGeometry] = useState<any>(null);
  const [pendingLocation, setPendingLocation] = useState<Coordinates | null>(null);
  const [exportIndices, setExportIndices] = useState<string[]>(['ndvi', 'ndwi', 'bsi']);
  const [isExporting, setIsExporting] = useState<boolean>(false);
  const [progress, setProgress] = useState<number>(0);

  // GEE State
  const [isGeeReady, setIsGeeReady] = useState<boolean>(false);
  const [showSettings, setShowSettings] = useState<boolean>(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState<boolean>(window.innerWidth >= 1024);

  // Hierarchical Selection State
  const [countries, setCountries] = useState<string[]>([]);
  const [provinces, setProvinces] = useState<string[]>([]);
  const [districts, setDistricts] = useState<string[]>([]);
  const [tehsils, setTehsils] = useState<{ name: string, geometry: any }[]>([]);
  const [selectedCountry, setSelectedCountry] = useState<string>('Pakistan');
  const [selectedProv, setSelectedProv] = useState<string>('');
  const [selectedDist, setSelectedDist] = useState<string>('');
  const [selectedTeh, setSelectedTeh] = useState<string>('');
  const [isHierarchyLoading, setIsHierarchyLoading] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [localSearchQuery, setLocalSearchQuery] = useState<string>('');
  const [localSearchResults, setLocalSearchResults] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState<string | null>(null); // 'global' or 'local'
  const [selectedDashboardCategory, setSelectedDashboardCategory] = useState<string>('All');
  const [analysisCategory, setAnalysisCategory] = useState<string>('Vegetation');

  const mapRef = useRef<HTMLDivElement>(null);
  const dashboardRef = useRef<HTMLDivElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const years = Array.from({ length: 10 }, (_, i) => new Date().getFullYear() - 1 - i);

  const handleStopAnalysis = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      setStatus(AnalysisStatus.IDLE);
      setErrorMessage("Analysis cancelled by user.");
    }
  };

  const handleRunAnalysis = async () => {
    if (!isGeeReady) return;

    setStatus(AnalysisStatus.LOADING);
    setAnalysis(null);
    setErrorMessage(null);
    setProgress(0);

    // Create a new AbortController for this analysis
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      let region: RegionGeometry | null = selectedRegion;

      if (analysisLevel === 'custom') {
        if (!customGeometry) {
          alert("Please draw or upload a custom area first.");
          setStatus(AnalysisStatus.IDLE);
          return;
        }
        region = {
          name: "Custom Area",
          geometry: customGeometry,
          center: pendingLocation || { lat: 0, lng: 0 }
        };
      } else if (pendingLocation && (!selectedRegion || selectedRegion.center !== pendingLocation)) {
        // Fetch administrative region if location changed or not yet selected
        region = await getRegionFromCoords(pendingLocation, analysisLevel, controller.signal);
        if (!region) {
          alert("No administrative region found at the selected location.");
          setStatus(AnalysisStatus.IDLE);
          return;
        }
        setSelectedRegion(region);
      }

      if (!region) {
        alert("Please select a location or define a custom area.");
        setStatus(AnalysisStatus.IDLE);
        return;
      }

      const result = await analyzeRegionWithGEE(
        region, 
        selectedYear, 
        analysisLevel, 
        resolution, 
        startDate, 
        endDate, 
        analysisCategory,
        controller.signal,
        (p) => setProgress(p)
      );
      setAnalysis(result);
      setStatus(AnalysisStatus.SUCCESS);
      setSelectedDashboardCategory(analysisCategory);

      // Update export indices to match the selected category
      const catIndices = analysisCategory === 'All'
        ? ['ndvi', 'ndwi', 'bsi']
        : AVAILABLE_INDICES.filter(i => i.category === analysisCategory).map(i => i.id);
      setExportIndices(catIndices);

      const defaultIndex = analysisCategory === 'All' ? 'ndvi' : (AVAILABLE_INDICES.find(i => i.category === analysisCategory)?.id || 'ndvi');
      setActiveOverlay(`${defaultIndex.toUpperCase()} (${result.locationName})`);

      // Close sidebar on small screens after analysis starts
      if (window.innerWidth < 1024) {
        setIsSidebarOpen(false);
      }
    } catch (e: any) {
      if (e.name === 'AbortError' || e.message === 'Aborted') {
        console.log("Analysis aborted");
        return;
      }
      console.error(e);
      setErrorMessage(e.message || "An unexpected error occurred during analysis.");
      setStatus(AnalysisStatus.ERROR);
    } finally {
      if (abortControllerRef.current === controller) {
        abortControllerRef.current = null;
      }
    }
  };

  const handleLocationSelect = (coords: Coordinates) => {
    setPendingLocation(coords);
    setCustomGeometry(null);
    setAnalysis(null);
    setActiveOverlay(null);
    setStatus(AnalysisStatus.IDLE);
    if (analysisLevel !== 'custom') {
      setSelectedRegion(null);
    }
  };

  React.useEffect(() => {
    if (isGeeReady) {
      getCountries().then(setCountries).catch(console.error);
      getProvinces(selectedCountry).then(setProvinces).catch(console.error);
    }
  }, [isGeeReady]);

  const handleCountryChange = async (country: string) => {
    setSelectedCountry(country);
    setSelectedProv('');
    setSelectedDist('');
    setSelectedTeh('');
    setProvinces([]);
    setDistricts([]);
    setTehsils([]);
    if (!country) return;
    setIsHierarchyLoading(true);
    try {
      const provs = await getProvinces(country);
      setProvinces(provs);
    } catch (e) {
      console.error(e);
    } finally {
      setIsHierarchyLoading(false);
    }
  };

  const handleProvChange = async (prov: string) => {
    setSelectedProv(prov);
    setSelectedDist('');
    setSelectedTeh('');
    setDistricts([]);
    setTehsils([]);
    if (!prov) return;
    setIsHierarchyLoading(true);
    try {
      const dists = await getDistricts(prov);
      setDistricts(dists);
    } catch (e) {
      console.error(e);
    } finally {
      setIsHierarchyLoading(false);
    }
  };

  const handleDistChange = async (dist: string) => {
    setSelectedDist(dist);
    setSelectedTeh('');
    setTehsils([]);
    if (!dist) return;
    setIsHierarchyLoading(true);
    try {
      const tehs = await getTehsils(dist);
      setTehsils(tehs);
    } catch (e) {
      console.error(e);
    } finally {
      setIsHierarchyLoading(false);
    }
  };

  const handleTehChange = (tehName: string) => {
    setSelectedTeh(tehName);
    const teh = tehsils.find(t => t.name === tehName);
    if (teh) {
      const region: RegionGeometry = {
        name: tehName,
        geometry: teh.geometry,
        center: { lat: 0, lng: 0 } // Center will be calculated by GEE
      };
      setSelectedRegion(region);
      setAnalysisLevel('3');
      setPendingLocation(null);
    }
  };

  const handleSearch = (query: string, type: 'global' | 'local') => {
    if (type === 'global') {
      setSearchQuery(query);
      setLocalSearchResults([]);
    } else {
      setLocalSearchQuery(query);
      setSearchResults([]);
    }

    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    if (query.length < 3) {
      type === 'global' ? setSearchResults([]) : setLocalSearchResults([]);
      setIsSearching(null);
      return;
    }

    setIsSearching(type);
    
    // Debounce the API call by 1000ms to comply with Nominatim's 1 request/sec limit
    searchTimeoutRef.current = setTimeout(async () => {
      try {
        const countryCode = selectedCountry === 'Pakistan' ? '&osm_tag=place:country&bbox=60,23,80,38' : ''; // Photon doesn't have strict countrycodes, using bbox for PK
        const url = type === 'global'
          ? `https://photon.komoot.io/api/?q=${encodeURIComponent(query)}&limit=5`
          : `https://photon.komoot.io/api/?q=${encodeURIComponent(query)}&limit=5${countryCode}`;

        const response = await fetch(url);
        
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const rawData = await response.json();
        
        // Map Photon GeoJSON format to Nominatim format so existing logic works
        const data = (rawData.features || []).map((f: any) => {
          const props = f.properties;
          const nameParts = [props.name, props.state, props.country].filter(Boolean);
          
          return {
            lat: f.geometry.coordinates[1].toString(),
            lon: f.geometry.coordinates[0].toString(),
            display_name: nameParts.join(', '),
            class: props.osm_key || '',
            type: props.osm_value || props.type || '',
            addresstype: props.type || '',
            place_rank: 20 // Photon doesn't return rank, default to 20
          };
        });
        
        type === 'global' ? setSearchResults(data) : setLocalSearchResults(data);
      } catch (e) {
        console.error("Nominatim search error:", e);
        type === 'global' ? setSearchResults([]) : setLocalSearchResults([]);
      } finally {
        setIsSearching(null);
      }
    }, 1000);
  };

  const handleSearchResultClick = async (result: any) => {
    const lat = parseFloat(result.lat);
    const lng = parseFloat(result.lon);
    setSearchQuery(result.display_name);
    setSearchResults([]);
    setLocalSearchResults([]);

    // Zoom to the location
    const coords = { lat, lng };
    setPendingLocation(coords);

    // Auto-analysis logic...
    if (isGeeReady) {
      // Determine appropriate level from Nominatim results
      let detectedLevel: AnalysisLevel = '2'; // Default to District
      const addrType = (result.addresstype || '').toLowerCase();
      const type = (result.type || '').toLowerCase();
      const category = (result.class || '').toLowerCase();
      const displayName = (result.display_name || '').toLowerCase();
      const rank = result.place_rank || 20;

      // Pakistan-specific province names for higher accuracy
      const pkProvinces = ['punjab', 'sindh', 'khyber pakhtunkhwa', 'balochistan', 'gilgit-baltistan', 'azad kashmir', 'islamabad capital territory'];
      const isPkProvince = pkProvinces.some(p => displayName.includes(p)) && (rank <= 12);

      if (addrType === 'country' || type === 'country' || rank <= 4) {
        detectedLevel = '0';
      } else if (addrType === 'state' || addrType === 'province' || type === 'state' || type === 'province' || isPkProvince || (rank >= 5 && rank <= 9)) {
        detectedLevel = '1';
      } else if (addrType === 'district' || addrType === 'county' || type === 'district' || type === 'county' || (category === 'boundary' && rank >= 10 && rank <= 16)) {
        detectedLevel = '2';
      } else if (addrType === 'city' || addrType === 'town' || addrType === 'village' || addrType === 'tehsil' || type === 'city' || type === 'town' || rank >= 17) {
        detectedLevel = '3';
      }

      setAnalysisLevel(detectedLevel);
      const region = await getRegionFromCoords(coords, detectedLevel);
      if (region) {
        setSelectedRegion(region);
        
        // Also update hierarchical selection to match if possible
        if (detectedLevel === '1') {
          setSelectedProv(region.name.split(' (')[0]);
        } else if (detectedLevel === '2') {
          setSelectedDist(region.name.split(' (')[0]);
        }
      }
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const extension = file.name.split('.').pop()?.toLowerCase();

    try {
      if (extension === 'kml' || extension === 'kmz') {
        let kmlText = "";
        if (extension === 'kmz') {
          const zip = await JSZip.loadAsync(file);
          const kmlFile = Object.values(zip.files).find((f: any) => f.name.endsWith('.kml')) as any;
          if (kmlFile) {
            kmlText = await kmlFile.async('text');
          }
        } else {
          kmlText = await file.text();
        }

        if (kmlText) {
          const parser = new DOMParser();
          const kml = parser.parseFromString(kmlText, 'text/xml');
          const geojson = toGeoJSON.kml(kml);
          setCustomGeometry(geojson);
          setAnalysisLevel('custom');
          setAnalysis(null);
          setActiveOverlay(null);
          setStatus(AnalysisStatus.IDLE);
        }
      } else if (extension === 'zip') {
        const buffer = await file.arrayBuffer();
        const geojson = await shp(buffer);
        setCustomGeometry(geojson);
        setAnalysisLevel('custom');
        setAnalysis(null);
        setActiveOverlay(null);
        setStatus(AnalysisStatus.IDLE);
      } else if (extension === 'json' || extension === 'geojson') {
        const text = await file.text();
        setCustomGeometry(JSON.parse(text));
        setAnalysisLevel('custom');
        setAnalysis(null);
        setActiveOverlay(null);
        setStatus(AnalysisStatus.IDLE);
      } else {
        alert("Unsupported file format. Please use KML, KMZ, Zipped Shapefile, or GeoJSON.");
      }
    } catch (err) {
      console.error("File upload error:", err);
      alert("Failed to process file. Ensure it's a valid spatial data file.");
    }
  };

  const handleDrawCreate = (geojson: any) => {
    setCustomGeometry(geojson);
    setAnalysisLevel('custom');
    setSelectedRegion(null);
    setPendingLocation(null);
    setDrawingMode(false);
    setAnalysis(null);
    setActiveOverlay(null);
    setStatus(AnalysisStatus.IDLE);
  };

  const handleYearChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newYear = parseInt(e.target.value);
    setSelectedYear(newYear);
    setStartDate(`${newYear}-01-01`);
    setEndDate(`${newYear}-12-31`);
  };

  const handleLevelChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newLevel = e.target.value as AnalysisLevel;
    setAnalysisLevel(newLevel);
    if (newLevel !== 'custom') {
      setCustomGeometry(null);
    }
  };

  const handleResolutionChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setResolution(parseInt(e.target.value));
  };

  const handleDateChange = () => {
    // No auto-trigger anymore
  }

  const handleOverlayAdd = async (name: string) => {
    setActiveOverlay(name);

    // Lazy loading logic
    if (analysis && analysis.visualization) {
      // Extract index ID from names like "[Vegetation] NDVI (Region Name)"
      const match = name.match(/\[(.*?)\] (.*?) \(/);
      if (match) {
        const indexName = match[2].trim();
        const idxInfo = AVAILABLE_INDICES.find(i => i.name === indexName || i.id === indexName.toLowerCase());

        if (idxInfo && !analysis.visualization[idxInfo.id]) {
          try {
            const viz = await getLazyMapId(idxInfo.id, analysis.regionGeometry, (analysis.visualization as any)._metadata);
            if (viz) {
              setAnalysis(prev => {
                if (!prev) return null;
                return {
                  ...prev,
                  visualization: {
                    ...prev.visualization,
                    [idxInfo.id]: viz
                  }
                };
              });
            }
          } catch (error) {
            console.error(`Failed to lazy load map for ${indexName}:`, error);
          }
        }
      }
    }
  };

  const handleOverlayRemove = (name: string) => {
    if (activeOverlay === name) {
      setActiveOverlay(null);
    }
  };

  const handleLogin = async () => {
    try {
      await initializeGEE();
      setIsGeeReady(true);
      setShowSettings(false);
    } catch (e: any) {
      if (e.message && (e.message.includes('permission') || e.message.includes('403'))) {
        alert("Permission Denied (403): Your Google account does not have permission to use the Earth Engine project 'ee-saimsuhail5'.\n\nFix 1: Ask the administrator to add your email as a 'Service Usage Consumer' in Google Cloud IAM.\n\nFix 2: If you want to use your OWN Earth Engine account, remove 'VITE_GEE_PROJECT_ID' from the .env.local file.");
      } else {
        alert("Failed to connect to Earth Engine. " + e.message);
      }
      console.error(e);
    }
  };

  const handleDownloadData = () => {
    if (analysis) {
      const csv = unparse(analysis.data);
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.setAttribute('download', `${analysis.locationName}_${selectedYear}_analysis.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  };

  const handleDownloadMap = () => {
    if (mapRef.current) {
      html2canvas(mapRef.current).then((canvas) => {
        const link = document.createElement('a');
        link.href = canvas.toDataURL('image/png');
        link.setAttribute('download', `${analysis?.locationName || 'map'}_${selectedYear}.png`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      });
    }
  };

  const handleDownloadPDF = () => {
    if (dashboardRef.current && analysis) {
      // Temporarily change style to prevent scrollbars from appearing in the capture
      const originalOverflow = dashboardRef.current.style.overflow;
      dashboardRef.current.style.overflow = 'visible';

      html2canvas(dashboardRef.current, { scale: 2, useCORS: true }).then((canvas) => {
        const imgData = canvas.toDataURL('image/png');
        const pdf = new jsPDF({
          orientation: 'portrait',
          unit: 'px',
          format: [canvas.width, canvas.height]
        });
        pdf.addImage(imgData, 'PNG', 0, 0, canvas.width, canvas.height);
        pdf.save(`${analysis.locationName}_${selectedYear}_Report.pdf`);

        // Restore style
        if (dashboardRef.current) {
          dashboardRef.current.style.overflow = originalOverflow;
        }
      });
    }
  };

  const handleDownloadGeoTIFF = async () => {
    if (!analysis || !selectedRegion || exportIndices.length === 0) return;

    setIsExporting(true);
    try {
      const url = await getExportUrl(
        analysis.regionGeometry || selectedRegion.geometry,
        selectedYear,
        resolution,
        startDate,
        endDate,
        exportIndices
      );

      if (url) {
        window.open(url, '_blank');
      } else {
        alert("Failed to generate GeoTIFF. The selected area might be too large or no data available for selected indices.");
      }
    } catch (error) {
      console.error(error);
      alert("An error occurred while generating the GeoTIFF.");
    } finally {
      setIsExporting(false);
    }
  };

  const handleClearAnalysis = () => {
    setAnalysis(null);
    setSelectedRegion(null);
    setPendingLocation(null);
    setCustomGeometry(null);
    setStatus(AnalysisStatus.IDLE);
  };

  return (
    <div className="relative flex h-screen w-screen bg-slate-900 overflow-hidden font-sans">

      {/* Mobile Sidebar Backdrop */}
      {isSidebarOpen && window.innerWidth < 1024 && (
        <div
          className="fixed inset-0 z-[40] bg-black/60 backdrop-blur-sm lg:hidden"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      {/* Sidebar Toggle Button */}
      {!isSidebarOpen && (
        <button
          onClick={() => setIsSidebarOpen(true)}
          className="fixed top-4 left-4 z-[50] p-2 bg-slate-800 text-white rounded-lg shadow-xl border border-slate-700 hover:bg-slate-700 transition-all flex items-center gap-2"
        >
          <Menu size={24} />
          <span className="text-xs font-bold uppercase tracking-wider pr-2">Menu</span>
        </button>
      )}

      {showSettings && (
        <div className="fixed inset-0 z-[200] bg-black/60 backdrop-blur-lg flex items-center justify-center p-4 transition-all duration-500 animate-in fade-in">
          <div className="bg-slate-900/80 border border-white/10 rounded-3xl p-8 w-full max-w-md shadow-[0_0_50px_rgba(0,0,0,0.5)] backdrop-blur-2xl transform transition-all hover:scale-[1.02] duration-300">
            <div className="flex flex-col items-center text-center space-y-6">
              <div className="relative group">
                <div className="absolute -inset-1 bg-gradient-to-r from-emerald-500 to-cyan-500 rounded-full blur opacity-25 group-hover:opacity-50 transition duration-1000 group-hover:duration-200 animate-pulse"></div>
                <img 
                  src="logo.png" 
                  alt="EcoLens Logo" 
                  className="relative w-24 h-24 rounded-2xl shadow-2xl transition-transform duration-500 group-hover:rotate-3 group-hover:scale-110 cursor-pointer" 
                />
              </div>
              
              <div className="space-y-2">
                <h2 className="text-3xl font-extrabold text-white tracking-tight">
                  EcoLens <span className="bg-gradient-to-r from-emerald-400 to-cyan-400 bg-clip-text text-transparent">WebGIS</span>
                </h2>
                <p className="text-slate-400 text-sm font-medium leading-relaxed">
                  Advanced spatiotemporal analysis workstation powered by Google Earth Engine.
                </p>
              </div>

              <div className="w-full h-px bg-gradient-to-r from-transparent via-white/10 to-transparent my-4"></div>

              <button 
                onClick={handleLogin} 
                className="group relative w-full bg-white text-slate-950 font-bold py-4 rounded-2xl transition-all duration-300 hover:shadow-[0_0_20px_rgba(255,255,255,0.3)] hover:-translate-y-1 active:scale-95 flex items-center justify-center gap-3 overflow-hidden"
              >
                <div className="absolute inset-0 bg-gradient-to-r from-emerald-50 to-cyan-50 opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
                <img src="https://www.google.com/favicon.ico" alt="Google" className="w-5 h-5 relative z-10" />
                <span className="relative z-10">Authorize with Google Account</span>
              </button>

              <p className="text-[10px] text-slate-500 uppercase tracking-[0.2em] font-bold">
                Secure Authentication via Google OAuth
              </p>
            </div>
          </div>
        </div>
      )}

      <aside className={`fixed inset-y-0 left-0 z-[100] w-[85%] sm:w-[400px] md:w-[420px] lg:w-[450px] xl:w-[480px] flex-shrink-0 h-full mesh-gradient border-r border-white/5 flex flex-col shadow-2xl transition-transform duration-300 ease-in-out ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <header className="flex-shrink-0">
          <div className="p-6 border-b border-white/5 bg-slate-950/20">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4 mb-1 group cursor-pointer">
                <div className="p-2 bg-emerald-500/10 rounded-xl group-hover:bg-emerald-500/20 transition-all duration-300 glow-emerald">
                  <img src="logo.png" alt="Logo" className="w-8 h-8 rounded-lg group-hover:scale-110 transition-transform duration-500" />
                </div>
                <div>
                  <h1 className="text-2xl font-black text-white tracking-tighter">EcoLens <span className="bg-gradient-to-r from-emerald-400 via-cyan-400 to-blue-500 bg-clip-text text-transparent">WebGIS</span></h1>
                  <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.2em] font-bold text-slate-500">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span> Precision Analytics
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => setIsSidebarOpen(false)} className="p-2 rounded-xl bg-slate-800/50 text-slate-400 hover:text-white hover:bg-slate-700/50 transition-all" title="Close Sidebar">
                  <ChevronLeft size={20} />
                </button>
                <button onClick={() => setShowSettings(true)} className={`p-2 rounded-xl transition-all shadow-lg ${isGeeReady ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'bg-red-500/20 text-red-400 border border-red-500/30 animate-pulse'}`} title="Configure Earth Engine">
                  <Settings size={18} />
                </button>
              </div>
            </div>
          </div>
          <div className="px-5 py-4 border-b border-slate-800 space-y-3">
            <div className="relative">
              <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none">
                <Globe size={14} className="text-cyan-500" />
              </div>
              <input
                id="global-search"
                name="global-search"
                type="text"
                placeholder="Global Search (Worldwide)..."
                value={searchQuery}
                onChange={(e) => handleSearch(e.target.value, 'global')}
                className="w-full bg-slate-900 border border-slate-700 text-slate-200 text-xs rounded-full py-2 pl-9 pr-4 focus:ring-2 focus:ring-cyan-500/50 outline-none placeholder:text-slate-600 transition-all"
                aria-label="Global Search"
              />
              {isSearching === 'global' && (
                <div className="absolute right-3 top-2">
                  <Loader2 size={12} className="animate-spin text-cyan-500" />
                </div>
              )}
              {searchResults.length > 0 && (
                <div className="absolute z-50 left-0 right-0 mt-1 bg-slate-900 border border-slate-700 rounded-lg shadow-2xl max-h-[300px] overflow-y-auto animate-in fade-in zoom-in-95 duration-200 custom-scrollbar">
                  {searchResults.map((result, i) => (
                    <button key={i} onClick={() => handleSearchResultClick(result)} className="w-full text-left px-4 py-2 text-xs text-slate-300 hover:bg-slate-800 border-b border-slate-800 last:border-0 flex items-center gap-3 transition-colors">
                      <MapPin size={12} className="text-cyan-500 shrink-0" />
                      <span className="truncate">{result.display_name}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>


          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-5 scroll-smooth custom-scrollbar">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
            <div className="col-span-1 md:col-span-3 space-y-6">
              {/* Location & Time Section */}
              <div className="space-y-6 glass-card p-8 rounded-[2rem] border-white/5 shadow-2xl transition-all hover:border-white/10 group animate-fade-in-up">
                <div className="flex items-center justify-between border-b border-white/5 pb-4 mb-2">
                  <h3 className="text-lg font-black text-emerald-400 flex items-center gap-3 tracking-tight">
                    <Globe size={22} className="group-hover:rotate-12 transition-transform duration-500" /> 
                    Spatiotemporal Parameters
                  </h3>
                  <div className="px-3 py-1 bg-emerald-500/10 text-emerald-400 text-[10px] font-bold rounded-full border border-emerald-500/20 uppercase tracking-widest">Global Ops</div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <label htmlFor="admin-level" className="text-sm text-slate-400 font-semibold flex items-center gap-2 mb-2"><Globe size={16} className="text-cyan-400" /> Administrative Depth</label>
                    <select id="admin-level" name="admin-level" value={analysisLevel} onChange={handleLevelChange} disabled={!isGeeReady} className="w-full bg-slate-800/80 border border-slate-700 text-slate-200 text-sm rounded-xl px-4 py-3 focus:ring-2 focus:ring-emerald-500/50 outline-none appearance-none cursor-pointer hover:bg-slate-700 transition-all shadow-inner">
                      <option value="0">Level 0 (Country)</option>
                      <option value="1">Level 1 (Province/State)</option>
                      <option value="2">Level 2 (District/County)</option>
                      <option value="3">Level 3 (Tehsil/Local)</option>
                      <option value="custom">Custom Geometry</option>
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label htmlFor="year-select" className="text-sm text-slate-400 font-semibold flex items-center gap-2 mb-2"><Calendar size={16} className="text-cyan-400" /> Target Year</label>
                    <select id="year-select" name="year-select" value={selectedYear} onChange={handleYearChange} disabled={!isGeeReady} className="w-full bg-slate-800/80 border border-slate-700 text-slate-200 text-sm rounded-xl px-4 py-3 focus:ring-2 focus:ring-emerald-500/50 outline-none appearance-none cursor-pointer hover:bg-slate-700 transition-all shadow-inner">
                      {years.map(y => <option key={y} value={y}>{y}</option>)}
                    </select>
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <label htmlFor="start-date" className="text-sm text-slate-400 font-semibold flex items-center gap-2 mb-2"><Calendar size={16} className="text-cyan-400" /> Observation Start</label>
                    <input id="start-date" name="start-date" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} onBlur={handleDateChange} disabled={!isGeeReady} className="w-full bg-slate-800/80 border border-slate-700 text-slate-200 text-sm rounded-xl px-4 py-3 focus:ring-2 focus:ring-emerald-500/50 outline-none hover:bg-slate-700 transition-all shadow-inner" />
                  </div>
                  <div className="space-y-2">
                    <label htmlFor="end-date" className="text-sm text-slate-400 font-semibold flex items-center gap-2 mb-2"><Calendar size={16} className="text-cyan-400" /> Observation End</label>
                    <input id="end-date" name="end-date" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} onBlur={handleDateChange} disabled={!isGeeReady} className="w-full bg-slate-800/80 border border-slate-700 text-slate-200 text-sm rounded-xl px-4 py-3 focus:ring-2 focus:ring-emerald-500/50 outline-none hover:bg-slate-700 transition-all shadow-inner" />
                  </div>
                </div>
              </div>

              {/* Analysis Engine & Controls Section */}
              <div className="space-y-6 glass-card p-8 rounded-[2rem] border-white/5 shadow-2xl transition-all hover:border-white/10 group animate-fade-in-up [animation-delay:100ms]">
                <div className="flex items-center justify-between border-b border-white/5 pb-4 mb-2">
                  <h3 className="text-lg font-black text-cyan-400 flex items-center gap-3 tracking-tight">
                    <Activity size={22} className="group-hover:scale-110 transition-transform duration-500" /> 
                    Analysis Engine
                  </h3>
                  <div className="px-3 py-1 bg-cyan-500/10 text-cyan-400 text-[10px] font-bold rounded-full border border-cyan-500/20 uppercase tracking-widest">v1.2.0-PRO</div>
                </div>
                
                <div className="grid grid-cols-1 gap-6">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <label htmlFor="res-select" className="text-sm text-slate-400 font-semibold flex items-center gap-2 mb-2"><Search size={16} className="text-cyan-400" /> Sensor Resolution</label>
                      <select id="res-select" name="res-select" value={resolution} onChange={handleResolutionChange} disabled={!isGeeReady} className="w-full bg-slate-800/80 border border-slate-700 text-slate-200 text-sm rounded-xl px-4 py-3 focus:ring-2 focus:ring-cyan-500/50 outline-none appearance-none cursor-pointer hover:bg-slate-700 transition-all shadow-inner">
                        <option value="10">10m (Sentinel-2)</option>
                        <option value="30">30m (Landsat 8/9)</option>
                      </select>
                    </div>
                    <div className="space-y-2">
                      <label htmlFor="analysis-category" className="text-sm text-slate-400 font-semibold flex items-center gap-2 mb-2"><Activity size={16} className="text-emerald-400" /> Thematic Focus</label>
                      <select
                        id="analysis-category"
                        name="analysis-category"
                        value={analysisCategory}
                        onChange={(e) => setAnalysisCategory(e.target.value)}
                        disabled={!isGeeReady || status === AnalysisStatus.LOADING}
                        className="w-full bg-emerald-900/20 border border-emerald-500/30 text-emerald-300 text-sm rounded-xl px-4 py-3 focus:ring-2 focus:ring-emerald-500/50 outline-none appearance-none cursor-pointer hover:bg-emerald-900/40 disabled:opacity-50 transition-all font-bold shadow-inner"
                      >
                        <option value="All">Comprehensive (All Categories)</option>
                        <option value="Vegetation">Vegetation Dynamics</option>
                        <option value="Water">Hydrological Indices</option>
                        <option value="Burn">Burn & Fire Analysis</option>
                        <option value="Urban">Urban & Soil Composition</option>
                        <option value="Geological">Geological Assessment</option>
                        <option value="Climate">Climatological Trends</option>
                        <option value="Heat">Heat (LST & UHI)</option>
                      </select>
                    </div>
                  </div>

                  <div className="space-y-6 pt-6 border-t border-white/5">
                    <div className="grid grid-cols-2 gap-4">
                      <button
                        onClick={() => setDrawingMode(!drawingMode)}
                        className={`flex items-center justify-center gap-3 py-4 text-sm font-bold rounded-2xl border transition-all duration-300 shadow-lg active:scale-95 ${drawingMode ? 'bg-emerald-500/20 border-emerald-500 text-emerald-400 glow-emerald' : 'bg-slate-800/50 border-white/5 text-slate-300 hover:bg-slate-700/50 hover:border-white/10'}`}
                      >
                        <Square size={20} /> {drawingMode ? 'Cancel' : 'Draw Area'}
                      </button>
                      <label htmlFor="file-import" className="flex items-center justify-center gap-3 py-4 text-sm font-bold rounded-2xl border bg-slate-800/50 border-white/5 text-slate-300 hover:bg-slate-700/50 hover:border-white/10 cursor-pointer transition-all duration-300 shadow-lg active:scale-95">
                        <Download size={20} className="rotate-180" /> Import
                        <input id="file-import" name="file-import" type="file" onChange={handleFileUpload} accept=".kml,.kmz,.zip,.json,.geojson" className="hidden" />
                      </label>
                    </div>

                    {status === AnalysisStatus.LOADING ? (
                      <button
                        onClick={handleStopAnalysis}
                        className="w-full bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-500 hover:to-rose-500 text-white font-black py-5 rounded-[1.5rem] shadow-[0_10px_40px_rgba(225,29,72,0.3)] transition-all flex items-center justify-center gap-3 text-lg group active:scale-95"
                      >
                        <X size={24} className="group-hover:rotate-90 transition-transform duration-500" />
                        Abort Task
                      </button>
                    ) : (
                      <button
                        onClick={handleRunAnalysis}
                        disabled={!isGeeReady || (!pendingLocation && !customGeometry)}
                        className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 disabled:from-slate-800 disabled:to-slate-800 disabled:text-slate-600 disabled:border-white/5 text-white font-black py-5 rounded-[1.5rem] shadow-[0_10px_40px_rgba(37,99,235,0.3)] transition-all flex items-center justify-center gap-3 text-lg group active:scale-95 disabled:scale-100 glow-emerald"
                      >
                        <Activity size={24} className="group-hover:scale-125 transition-transform duration-500" />
                        Execute Analysis
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-4">
            {isGeeReady && analysisLevel === '3' && (
              <div className="col-span-3 space-y-3 bg-slate-900/60 p-3 rounded-lg border border-slate-700/50 animate-in fade-in slide-in-from-top-2 duration-300">
                <div className="flex items-center gap-2 mb-1">
                  <MapIcon size={14} className="text-emerald-400" />
                  <span className="text-xs font-bold text-white uppercase tracking-wider">Administrative Selection (Pakistan)</span>
                  {isHierarchyLoading && <Loader2 size={12} className="animate-spin text-emerald-500 ml-auto" />}
                </div>

                <div className="grid grid-cols-1 gap-2">
                  <label htmlFor="country-select" className="sr-only">Select Country</label>
                  <select
                    id="country-select"
                    name="country-select"
                    value={selectedCountry}
                    onChange={(e) => handleCountryChange(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 text-slate-200 text-xs rounded px-3 py-2 outline-none hover:bg-slate-800 transition-colors"
                  >
                    <option value="">Select Country</option>
                    {countries.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>

                  <label htmlFor="province-select" className="sr-only">Select Province</label>
                  <select
                    id="province-select"
                    name="province-select"
                    value={selectedProv}
                    onChange={(e) => handleProvChange(e.target.value)}
                    disabled={!selectedCountry || (provinces.length === 0 && !isHierarchyLoading)}
                    className="w-full bg-slate-900 border border-slate-700 text-slate-200 text-xs rounded px-3 py-2 outline-none hover:bg-slate-800 transition-colors disabled:opacity-50"
                  >
                    <option value="">{isHierarchyLoading && !selectedProv ? 'Loading Provinces...' : 'Select Province'}</option>
                    {provinces.map(p => <option key={p} value={p}>{p}</option>)}
                  </select>

                  <label htmlFor="district-select" className="sr-only">Select District</label>
                  <select
                    id="district-select"
                    name="district-select"
                    value={selectedDist}
                    onChange={(e) => handleDistChange(e.target.value)}
                    disabled={!selectedProv || (districts.length === 0 && !isHierarchyLoading)}
                    className="w-full bg-slate-900 border border-slate-700 text-slate-200 text-xs rounded px-3 py-2 outline-none hover:bg-slate-800 transition-colors disabled:opacity-50"
                  >
                    <option value="">{isHierarchyLoading && !selectedDist ? 'Loading Districts...' : 'Select District'}</option>
                    {districts.map(d => <option key={d} value={d}>{d}</option>)}
                  </select>

                  <label htmlFor="tehsil-select" className="sr-only">Select Tehsil</label>
                  <select
                    id="tehsil-select"
                    name="tehsil-select"
                    value={selectedTeh}
                    onChange={(e) => handleTehChange(e.target.value)}
                    disabled={!selectedDist || (tehsils.length === 0 && !isHierarchyLoading)}
                    className="w-full bg-slate-900 border border-slate-700 text-slate-200 text-xs rounded px-3 py-2 outline-none hover:bg-slate-800 transition-colors disabled:opacity-50"
                  >
                    <option value="">{isHierarchyLoading && selectedDist ? 'Loading Tehsils...' : 'Select Tehsil'}</option>
                    {tehsils.map(t => <option key={t.name} value={t.name}>{t.name}</option>)}
                  </select>
                </div>
              </div>
            )}
          </div>

          {!isGeeReady ? (
            <div className="h-full flex flex-col items-center justify-center text-center opacity-80 py-10">
              <AlertTriangle className="w-16 h-16 text-amber-500 mb-4 mx-auto" />
              <h3 className="text-lg font-medium text-slate-300">Authorization Required</h3>
              <p className="text-sm text-slate-500 max-w-xs mt-2 mb-4 mx-auto">Please log in to authorize Earth Engine and start analyzing environmental data.</p>
              <button onClick={() => setShowSettings(true)} className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded text-sm transition-colors border border-slate-700">Login</button>
            </div>
          ) : status === AnalysisStatus.IDLE && (
            <div className="h-full flex flex-col items-center justify-center text-center p-12 glass-card rounded-[3rem] border-dashed border-white/10 animate-fade-in-up">
              <div className="w-24 h-24 bg-emerald-500/10 rounded-3xl flex items-center justify-center mb-8 glow-emerald">
                <Leaf size={48} className="text-emerald-400" />
              </div>
              <h3 className="text-3xl font-black text-white mb-4 tracking-tighter">Ready for Analysis</h3>
              <p className="text-base text-slate-400 max-w-sm mx-auto leading-relaxed">
                {pendingLocation || customGeometry
                  ? "Region defined. Click 'Execute Analysis' to synthesize environmental data."
                  : "Select an administrative region or draw a custom area to begin."}
              </p>
              <div className="mt-10 flex gap-3 text-[10px] uppercase tracking-widest font-bold text-slate-500">
                <span className="px-3 py-1 bg-slate-800/50 rounded-lg border border-white/5">Multi-Sensor</span>
                <span className="px-3 py-1 bg-slate-800/50 rounded-lg border border-white/5">Real-time GEE</span>
              </div>
            </div>
          )}

          {status === AnalysisStatus.LOADING && (
            <div className="h-full flex flex-col items-center justify-center text-center p-12 glass-card rounded-[3rem] animate-pulse">
              <div className="relative mb-10">
                <div className="w-32 h-32 bg-emerald-500/5 rounded-full flex items-center justify-center glow-emerald">
                   <Loader2 className="w-20 h-20 text-emerald-500 animate-spin opacity-40" />
                </div>
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="text-xl font-black text-emerald-400 tracking-tighter">{progress}%</span>
                </div>
              </div>
              
              <div className="w-full max-w-xs h-2 bg-slate-800/50 rounded-full mb-8 overflow-hidden border border-white/5">
                <div 
                  className="h-full bg-gradient-to-r from-emerald-600 via-cyan-400 to-blue-500 transition-all duration-500 ease-out shadow-[0_0_20px_rgba(16,185,129,0.5)]"
                  style={{ width: `${progress}%` }}
                />
              </div>

              <h3 className="text-2xl font-black text-white mb-3 tracking-tight">
                {analysis ? 'Synthesizing Data...' : 'Calibrating Sensors...'}
              </h3>
              <p className="text-sm text-slate-400 max-w-xs mx-auto font-medium">
                Processing multi-temporal environmental metrics via Google Earth Engine.
              </p>
            </div>
          )}

          {status === AnalysisStatus.ERROR && (
            <div className="h-full flex flex-col items-center justify-center text-center py-10">
              <Activity className="w-12 h-12 text-red-500 mb-4 mx-auto" />
              <h3 className="text-base font-medium text-red-400">Analysis Failed</h3>
              <p className="text-xs text-slate-500 mt-2 max-w-xs mx-auto">{errorMessage || "Check console for errors. Your GEE account might not be authorized."}</p>
              {errorMessage?.includes("Invalid Geometry") && (
                <button
                  onClick={() => { setStatus(AnalysisStatus.IDLE); setDrawingMode(true); }}
                  className="mt-4 text-xs bg-slate-800 hover:bg-slate-700 text-blue-400 px-3 py-1.5 rounded border border-slate-700"
                >
                  Draw New Area
                </button>
              )}
            </div>
          )}

          {status === AnalysisStatus.SUCCESS && analysis && (
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h2 className="text-2xl font-bold text-white leading-tight">{analysis.locationName}</h2>
                  <div className="flex items-center gap-2">
                    <button onClick={handleDownloadData} className="p-1.5 rounded-full bg-slate-700 hover:bg-slate-600 text-slate-300 transition-colors" title="Download CSV Data"><Download size={16} /></button>
                    <button onClick={handleDownloadGeoTIFF} className={`p-1.5 rounded-full transition-colors ${analysis.tiffDownloadUrl ? 'bg-slate-700 hover:bg-slate-600 text-slate-300' : 'bg-slate-800 text-slate-600 cursor-not-allowed'}`} title={analysis.tiffDownloadUrl ? "Download GeoTIFF Data" : "GeoTIFF Unavailable"} disabled={!analysis.tiffDownloadUrl}><ImageIcon size={16} /></button>
                    <button onClick={handleDownloadMap} className="p-1.5 rounded-full bg-slate-700 hover:bg-slate-600 text-slate-300 transition-colors" title="Download Map Screenshot"><Camera size={16} /></button>
                    <button onClick={handleDownloadPDF} className="p-1.5 rounded-full bg-slate-700 hover:bg-slate-600 text-slate-300 transition-colors" title="Download Dashboard PDF Report"><FileText size={16} /></button>
                    <button onClick={handleClearAnalysis} className="p-1.5 rounded-full bg-slate-700 hover:bg-slate-600 text-slate-300 transition-colors" title="Clear Analysis"><X size={16} /></button>
                    <span className="text-sm font-bold text-slate-400 bg-slate-800 px-2.5 py-1 rounded">{selectedYear}</span>
                  </div>
                </div>
                <p className="text-sm text-slate-400 mt-2 leading-relaxed border-l-2 border-slate-700 pl-3">{analysis.summary}</p>
              </div>

              <div className="flex items-center gap-1 bg-slate-800 p-1 rounded-lg">
                <button onClick={() => setActiveTab('dashboard')} className={`flex-1 flex items-center justify-center gap-2 py-2 text-xs font-medium rounded-md transition-all ${activeTab === 'dashboard' ? 'bg-slate-700 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'}`}><Activity size={14} /> Dashboard</button>
                <button onClick={() => setActiveTab('code')} className={`flex-1 flex items-center justify-center gap-2 py-2 text-xs font-medium rounded-md transition-all ${activeTab === 'code' ? 'bg-slate-700 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'}`}><Code size={14} /> GEE Script</button>
              </div>

              {activeTab === 'dashboard' ? (
                <div className="space-y-6" ref={dashboardRef}>
                  <div className="flex items-center gap-2 px-1">
                    <label htmlFor="dashboard-category-select" className="sr-only">Select Dashboard Category</label>
                    <select
                      id="dashboard-category-select"
                      name="dashboard-category-select"
                      value={selectedDashboardCategory}
                      onChange={(e) => setSelectedDashboardCategory(e.target.value)}
                      className="bg-slate-800 border border-slate-700 text-slate-200 text-[10px] rounded px-2 py-1 outline-none hover:bg-slate-700 transition-colors"
                    >
                      <option value="All">All Categories</option>
                      <option value="Vegetation">Vegetation</option>
                      <option value="Water">Water</option>
                      <option value="Burn">Burn</option>
                      <option value="Urban">Urban</option>
                      <option value="Geological">Geological</option>
                      <option value="Climate">Climate</option>
                      <option value="Heat">Heat</option>
                    </select>
                  </div>

                  <div className="space-y-4">
                    {['Vegetation', 'Water', 'Burn', 'Urban', 'Geological', 'Climate', 'Heat']
                      .filter(cat => selectedDashboardCategory === 'All' || selectedDashboardCategory === cat)
                      .map(cat => {
                        const catIndices = AVAILABLE_INDICES.filter(i => i.category === cat && !['rainfall', 'temperature'].includes(i.id));
                        if (catIndices.length === 0) return null;
                        return (
                          <div key={cat} className="space-y-2">
                            <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-wider ml-1">{cat} Indices</h4>
                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                              {catIndices.map(idx => {
                                const avg = analysis.data.reduce((a, c) => a + (Number(c[idx.id]) || 0), 0) / 12;
                                return (
                                  <div key={idx.id} className="bg-slate-900/50 p-3 rounded-xl border border-slate-700/50 hover:border-slate-600 hover:shadow-lg transition-all group">
                                    <div className="text-[10px] text-slate-400 truncate group-hover:text-slate-300" title={idx.description}>{idx.name}</div>
                                    <div className={`text-lg font-black tracking-tight ${cat === 'Vegetation' ? 'text-emerald-400' : cat === 'Water' ? 'text-sky-400' : cat === 'Burn' ? 'text-orange-500' : 'text-slate-200'}`}>
                                      {avg.toFixed(2)}
                                    </div>
                                  </div>
                                );
                              })}
                              {cat === 'Climate' && (
                                <div className="bg-slate-800/40 p-2.5 rounded-lg border border-slate-800/50 col-span-1">
                                  <div className="text-[10px] text-slate-500">Rainfall</div>
                                  <div className="text-base font-bold text-blue-400">
                                    {analysis.data.reduce((a, c) => a + (Number(c.rainfall) || 0), 0).toFixed(0)}mm
                                  </div>
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                  </div>

                  <div className="bg-gradient-to-br from-slate-900 to-slate-800 p-5 rounded-2xl border border-slate-700 shadow-2xl">
                    <div className="flex items-center justify-between mb-4 border-b border-slate-700/50 pb-3">
                      <h4 className="text-sm font-bold text-white flex items-center gap-2">
                        <Activity size={16} className="text-emerald-400" /> Active Indices <span className="text-[10px] font-normal text-slate-400">(Chart & Export)</span>
                      </h4>
                      <div className="text-xs font-bold text-emerald-400 bg-emerald-900/30 px-2 py-1 rounded">{exportIndices.length} Selected</div>
                    </div>
                    <div className="max-h-48 overflow-y-auto mb-4 pr-2 scrollbar-thin scrollbar-thumb-slate-600 hover:scrollbar-thumb-slate-500">
                      <div className="grid grid-cols-2 gap-2">
                        {AVAILABLE_INDICES
                          .filter(i => !['rainfall', 'temperature'].includes(i.id))
                          .filter(i => selectedDashboardCategory === 'All' || i.category === selectedDashboardCategory)
                          .map(idx => (
                            <label key={idx.id} htmlFor={`export-${idx.id}`} className="flex items-center gap-2 p-1.5 rounded bg-slate-900/50 hover:bg-slate-900 border border-slate-800 cursor-pointer transition-all">
                              <input
                                id={`export-${idx.id}`}
                                name={`export-${idx.id}`}
                                type="checkbox"
                                checked={exportIndices.includes(idx.id)}
                                onChange={(e) => {
                                  if (e.target.checked) setExportIndices([...exportIndices, idx.id]);
                                  else setExportIndices(exportIndices.filter(id => id !== idx.id));
                                }}
                                className="w-3 h-3 rounded border-slate-700 bg-slate-800 text-blue-600 focus:ring-blue-500/50"
                              />
                              <span className="text-[10px] text-slate-300 truncate">{idx.name}</span>
                            </label>
                          ))}
                      </div>
                    </div>
                    <button
                      onClick={handleDownloadGeoTIFF}
                      disabled={isExporting || exportIndices.length === 0}
                      className="w-full bg-slate-800 hover:bg-slate-700 disabled:bg-slate-900 disabled:text-slate-600 text-slate-200 border border-slate-600 disabled:border-slate-800 text-xs font-bold py-2.5 rounded-lg shadow-lg transition-all flex items-center justify-center gap-2"
                    >
                      {isExporting ? <Loader2 size={16} className="animate-spin text-emerald-400" /> : <Download size={16} className="text-blue-400" />}
                      {isExporting ? 'Generating Multi-band GeoTIFF...' : `Export GeoTIFF (${exportIndices.length} bands)`}
                    </button>
                  </div>

                  <div className="bg-slate-900/50 p-4 rounded-2xl border border-slate-700/50 shadow-xl">
                    <DynamicIndexChart data={analysis.data} category={selectedDashboardCategory} activeIndices={exportIndices} />
                  </div>
                  <ClimateChart data={analysis.data} />
                  <LandCoverDonut data={analysis.landCover} />
                  <LULCChart data={analysis.landCover} />
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="flex items-center gap-2 text-slate-400 text-sm"><Terminal size={16} /><span>Earth Engine JavaScript</span></div>
                  <p className="text-xs text-slate-500">This script reflects the GEE logic used for the analysis.</p>
                  <CodeBlock code={analysis.geeScript} />
                </div>
              )}
            </div>
          )}
        </div>

        <div className="p-4 border-t border-slate-800 bg-slate-900 text-[10px] text-slate-600 flex justify-between items-center shrink-0">
          <div className="flex gap-4 items-center">
            <div className="flex items-center gap-2">
              <span className="bg-slate-800 text-slate-400 px-2 py-0.5 rounded border border-slate-700 font-mono">v1.2.0</span>
              <span>Powered by Google Earth Engine™</span>
            </div>
            <div className="flex gap-2">
              <a href="/ecolens-github/privacy.html" target="_blank" rel="noopener noreferrer" className="hover:text-slate-400 transition-colors">Privacy Policy</a>
              <span className="text-slate-800">|</span>
              <a href="/ecolens-github/terms.html" target="_blank" rel="noopener noreferrer" className="hover:text-slate-400 transition-colors">Terms of Service</a>
            </div>
          </div>
          <div className="flex gap-2 items-center"><span className={`w-2 h-2 rounded-full ${isGeeReady ? 'bg-blue-500' : 'bg-red-500'} animate-pulse`}></span>{isGeeReady ? 'System Online' : 'Offline'}</div>
        </div>
      </aside>

      <main ref={mapRef} className="flex-1 relative bg-slate-950">
        <MapViewer
          onLocationSelect={handleLocationSelect}
          analysis={analysis}
          activeOverlay={activeOverlay}
          onOverlayAdd={handleOverlayAdd}
          onOverlayRemove={handleOverlayRemove}
          drawingMode={drawingMode}
          onDrawCreate={handleDrawCreate}
          customGeometry={customGeometry}
          selectedRegion={selectedRegion}
          analysisCategory={analysisCategory}
        />
      </main>
    </div>
  );
};

export default App;