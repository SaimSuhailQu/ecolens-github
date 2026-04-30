import React, { useState, useRef } from 'react';
import { MapViewer } from './components/MapViewer';
import { VegetationChart, ClimateChart } from './components/Charts';
import { LandCoverDonut } from './components/LandCoverDonut';
import { LULCChart } from './components/LULCChart';
import { CodeBlock } from './components/CodeBlock';
import { analyzeRegionWithGEE, initializeGEE, getRegionFromCoords, getExportUrl, getCountries, getProvinces, getDistricts, getTehsils } from './services/earthEngineService';
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

  // GEE State
  const [isGeeReady, setIsGeeReady] = useState<boolean>(false);
  const [showSettings, setShowSettings] = useState<boolean>(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState<boolean>(window.innerWidth >= 768);

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

  const mapRef = useRef<HTMLDivElement>(null);
  const dashboardRef = useRef<HTMLDivElement>(null);

  const years = Array.from({ length: 10 }, (_, i) => new Date().getFullYear() - 1 - i);

  const handleRunAnalysis = async () => {
    if (!isGeeReady) return;

    setStatus(AnalysisStatus.LOADING);
    setAnalysis(null);
    setErrorMessage(null);

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
        region = await getRegionFromCoords(pendingLocation, analysisLevel);
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

      const result = await analyzeRegionWithGEE(region, selectedYear, analysisLevel, resolution, startDate, endDate);
      setAnalysis(result);
      setStatus(AnalysisStatus.SUCCESS);
      setActiveOverlay(`NDVI (${result.locationName})`);

      // Close sidebar on mobile after analysis starts
      if (window.innerWidth < 768) {
        setIsSidebarOpen(false);
      }
    } catch (e: any) {
      console.error(e);
      setErrorMessage(e.message || "An unexpected error occurred during analysis.");
      setStatus(AnalysisStatus.ERROR);
    }
  };

  const handleLocationSelect = (coords: Coordinates) => {
    setPendingLocation(coords);
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

  const handleSearch = async (query: string, type: 'global' | 'local') => {
    if (type === 'global') {
      setSearchQuery(query);
      setLocalSearchResults([]);
    } else {
      setLocalSearchQuery(query);
      setSearchResults([]);
    }

    if (query.length < 3) {
      type === 'global' ? setSearchResults([]) : setLocalSearchResults([]);
      return;
    }

    setIsSearching(type);
    try {
      const countryCode = selectedCountry === 'Pakistan' ? 'pk' : '';
      const url = type === 'global'
        ? `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=5`
        : `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=5&countrycodes=${countryCode}`;

      const response = await fetch(url);
      const data = await response.json();
      type === 'global' ? setSearchResults(data) : setLocalSearchResults(data);
    } catch (e) {
      console.error(e);
    } finally {
      setIsSearching(null);
    }
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
      const region = await getRegionFromCoords(coords, '2');
      if (region) setSelectedRegion(region);
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
        }
      } else if (extension === 'zip') {
        const buffer = await file.arrayBuffer();
        const geojson = await shp(buffer);
        setCustomGeometry(geojson);
        setAnalysisLevel('custom');
      } else if (extension === 'json' || extension === 'geojson') {
        const text = await file.text();
        setCustomGeometry(JSON.parse(text));
        setAnalysisLevel('custom');
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
    setDrawingMode(false);
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

  const handleOverlayAdd = (name: string) => {
    setActiveOverlay(name);
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
    } catch (e) {
      alert("Failed to connect to Earth Engine. Check OAuth Client ID and GEE authorization.");
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
      {isSidebarOpen && window.innerWidth < 768 && (
        <div
          className="fixed inset-0 z-[40] bg-black/60 backdrop-blur-sm md:hidden"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      {/* Sidebar Toggle Button (Mobile Only) */}
      {!isSidebarOpen && (
        <button
          onClick={() => setIsSidebarOpen(true)}
          className="fixed top-4 left-4 z-[50] p-2 bg-slate-800 text-white rounded-lg shadow-xl border border-slate-700 md:hidden hover:bg-slate-700 transition-all"
        >
          <Menu size={24} />
        </button>
      )}

      {showSettings && (
        <div className="fixed inset-0 z-[200] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-xl p-6 w-full max-w-md shadow-2xl">
            <h2 className="text-xl font-bold text-white mb-4 flex items-center gap-2"><Globe className="w-5 h-5" /> Authorize Application</h2>
            <p className="text-sm text-slate-400 mb-6">This app requires Google Earth Engine access. Please log in to authorize the connection.</p>
            <button onClick={handleLogin} className="w-full bg-blue-600 hover:bg-blue-500 text-white font-medium py-2 rounded transition-colors flex items-center justify-center gap-2">
              <img src="https://www.google.com/favicon.ico" alt="Google icon" className="w-4 h-4" /> Login with Google
            </button>
          </div>
        </div>
      )}

      <aside className={`fixed inset-y-0 left-0 z-[100] md:relative md:z-20 w-[85%] sm:w-[400px] md:w-[380px] lg:w-[450px] xl:w-[480px] flex-shrink-0 h-full bg-slate-900 border-r border-slate-800 flex flex-col shadow-2xl transition-transform duration-300 ease-in-out ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}`}>
        <header className="flex-shrink-0">
          <div className="p-5 border-b border-slate-800">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 mb-1">
                <Leaf className="w-6 h-6 text-emerald-500" />
                <h1 className="text-xl font-bold text-white tracking-tight">EcoLens <span className="text-slate-500 font-normal">WebGIS</span></h1>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => setIsSidebarOpen(false)} className="md:hidden p-1.5 rounded-full bg-slate-800 text-slate-400 hover:text-white" title="Close Sidebar">
                  <ChevronLeft size={18} />
                </button>
                <button onClick={() => setShowSettings(true)} className={`p-1.5 rounded-full transition-colors ${isGeeReady ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400 animate-pulse'}`} title="Configure Earth Engine">
                  <Settings size={16} />
                </button>
              </div>
            </div>
            <div className="flex items-center gap-2 text-xs mt-1">
              <span className={`flex items-center gap-1.5 ${isGeeReady ? 'text-emerald-400' : 'text-slate-500'}`}>
                <Globe size={10} /> {isGeeReady ? 'Connected to Earth Engine' : 'Waiting for authorization...'}
              </span>
            </div>
          </div>
          <div className="px-5 py-4 border-b border-slate-800 space-y-3">
            <div className="relative">
              <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none">
                <Globe size={14} className="text-cyan-500" />
              </div>
              <input
                type="text"
                placeholder="Global Search (Worldwide)..."
                value={searchQuery}
                onChange={(e) => handleSearch(e.target.value, 'global')}
                className="w-full bg-slate-900 border border-slate-700 text-slate-200 text-xs rounded-full py-2 pl-9 pr-4 focus:ring-2 focus:ring-cyan-500/50 outline-none placeholder:text-slate-600 transition-all"
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

            <div className="relative">
              <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none">
                <Search size={14} className="text-emerald-500" />
              </div>
              <input
                type="text"
                placeholder={`Search in ${selectedCountry}...`}
                value={localSearchQuery}
                onChange={(e) => handleSearch(e.target.value, 'local')}
                className="w-full bg-slate-900 border border-slate-700 text-slate-200 text-xs rounded-full py-2 pl-9 pr-4 focus:ring-2 focus:ring-emerald-500/50 outline-none placeholder:text-slate-600 transition-all"
              />
              {isSearching === 'local' && (
                <div className="absolute right-3 top-2">
                  <Loader2 size={12} className="animate-spin text-emerald-500" />
                </div>
              )}
              {localSearchResults.length > 0 && (
                <div className="absolute z-50 left-0 right-0 mt-1 bg-slate-900 border border-slate-700 rounded-lg shadow-2xl max-h-[300px] overflow-y-auto animate-in fade-in zoom-in-95 duration-200 custom-scrollbar">
                  {localSearchResults.map((result, i) => (
                    <button key={i} onClick={() => handleSearchResultClick(result)} className="w-full text-left px-4 py-2 text-xs text-slate-300 hover:bg-slate-800 border-b border-slate-800 last:border-0 flex items-center gap-3 transition-colors">
                      <MapPin size={12} className="text-emerald-500 shrink-0" />
                      <span className="truncate">{result.display_name}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4 px-5 py-3 border-b border-slate-800 bg-slate-800/20">
            <div>
              <label className="text-xs text-slate-400 font-medium flex items-center gap-2 mb-1.5"><Globe size={14} className="text-cyan-400" /> Admin Level</label>
              <select value={analysisLevel} onChange={handleLevelChange} disabled={!isGeeReady} className="w-full bg-slate-800 border border-slate-700 text-slate-200 text-xs rounded px-3 py-1.5 focus:ring-2 focus:ring-emerald-500/50 outline-none appearance-none pr-8 cursor-pointer hover:bg-slate-700 disabled:opacity-50">
                <option value="0">Level 0 (Country)</option>
                <option value="1">Level 1 (Province/State)</option>
                <option value="2">Level 2 (District/County)</option>
                <option value="3">Level 3 (Tehsil/Local)</option>
                <option value="custom">Custom Area</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-slate-400 font-medium flex items-center gap-2 mb-1.5"><Calendar size={14} className="text-cyan-400" /> Year</label>
              <select value={selectedYear} onChange={handleYearChange} disabled={!isGeeReady} className="w-full bg-slate-800 border border-slate-700 text-slate-200 text-xs rounded px-3 py-1.5 focus:ring-2 focus:ring-emerald-500/50 outline-none appearance-none pr-8 cursor-pointer hover:bg-slate-700 disabled:opacity-50">
                {years.map(y => <option key={y} value={y}>{y}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-slate-400 font-medium flex items-center gap-2 mb-1.5"><Search size={14} className="text-cyan-400" /> Resolution</label>
              <select value={resolution} onChange={handleResolutionChange} disabled={!isGeeReady} className="w-full bg-slate-800 border border-slate-700 text-slate-200 text-xs rounded px-3 py-1.5 focus:ring-2 focus:ring-emerald-500/50 outline-none appearance-none pr-8 cursor-pointer hover:bg-slate-700 disabled:opacity-50">
                <option value="10">10m (Sentinel-2)</option>
                <option value="30">30m (Landsat 8/9)</option>
              </select>
            </div>
            <div className="col-span-3 grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs text-slate-400 font-medium flex items-center gap-2 mb-1.5"><Calendar size={14} className="text-cyan-400" /> Start Date</label>
                <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} onBlur={handleDateChange} disabled={!isGeeReady} className="w-full bg-slate-800 border border-slate-700 text-slate-200 text-xs rounded px-3 py-1.5 focus:ring-2 focus:ring-emerald-500/50 outline-none appearance-none pr-8 cursor-pointer hover:bg-slate-700 disabled:opacity-50" />
              </div>
              <div>
                <label className="text-xs text-slate-400 font-medium flex items-center gap-2 mb-1.5"><Calendar size={14} className="text-cyan-400" /> End Date</label>
                <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} onBlur={handleDateChange} disabled={!isGeeReady} className="w-full bg-slate-800 border border-slate-700 text-slate-200 text-xs rounded px-3 py-1.5 focus:ring-2 focus:ring-emerald-500/50 outline-none appearance-none pr-8 cursor-pointer hover:bg-slate-700 disabled:opacity-50" />
              </div>
            </div>

            {isGeeReady && analysisLevel === '3' && (
              <div className="col-span-3 space-y-3 bg-slate-800/40 p-3 rounded-lg border border-slate-700/50 animate-in fade-in slide-in-from-top-2 duration-300">
                <div className="flex items-center gap-2 mb-1">
                  <MapIcon size={14} className="text-emerald-400" />
                  <span className="text-xs font-bold text-white uppercase tracking-wider">Administrative Selection (Pakistan)</span>
                  {isHierarchyLoading && <Loader2 size={12} className="animate-spin text-emerald-500 ml-auto" />}
                </div>

                <div className="grid grid-cols-1 gap-2">
                  <select
                    value={selectedCountry}
                    onChange={(e) => handleCountryChange(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 text-slate-200 text-xs rounded px-3 py-2 outline-none hover:bg-slate-800 transition-colors"
                  >
                    <option value="">Select Country</option>
                    {countries.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>

                  <select
                    value={selectedProv}
                    onChange={(e) => handleProvChange(e.target.value)}
                    disabled={!selectedCountry || (provinces.length === 0 && !isHierarchyLoading)}
                    className="w-full bg-slate-900 border border-slate-700 text-slate-200 text-xs rounded px-3 py-2 outline-none hover:bg-slate-800 transition-colors disabled:opacity-50"
                  >
                    <option value="">{isHierarchyLoading && !selectedProv ? 'Loading Provinces...' : 'Select Province'}</option>
                    {provinces.map(p => <option key={p} value={p}>{p}</option>)}
                  </select>

                  <select
                    value={selectedDist}
                    onChange={(e) => handleDistChange(e.target.value)}
                    disabled={!selectedProv || (districts.length === 0 && !isHierarchyLoading)}
                    className="w-full bg-slate-900 border border-slate-700 text-slate-200 text-xs rounded px-3 py-2 outline-none hover:bg-slate-800 transition-colors disabled:opacity-50"
                  >
                    <option value="">{isHierarchyLoading && !selectedDist ? 'Loading Districts...' : 'Select District'}</option>
                    {districts.map(d => <option key={d} value={d}>{d}</option>)}
                  </select>

                  <select
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

            <div className="col-span-3 flex flex-col gap-3 mt-2">
              <div className="flex gap-2">
                <button
                  onClick={() => setDrawingMode(!drawingMode)}
                  className={`flex-1 flex items-center justify-center gap-2 py-2 text-xs font-medium rounded border transition-all ${drawingMode ? 'bg-emerald-500/20 border-emerald-500 text-emerald-400' : 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700'}`}
                >
                  <Square size={14} /> {drawingMode ? 'Cancel Drawing' : 'Draw Polygon'}
                </button>
                <label className="flex-1 flex items-center justify-center gap-2 py-2 text-xs font-medium rounded border bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700 cursor-pointer transition-all">
                  <Download size={14} className="rotate-180" /> Import File
                  <input type="file" onChange={handleFileUpload} accept=".kml,.kmz,.zip,.json,.geojson" className="hidden" />
                </label>
              </div>

              <button
                onClick={handleRunAnalysis}
                disabled={!isGeeReady || status === AnalysisStatus.LOADING || (!pendingLocation && !customGeometry)}
                className="w-full bg-blue-600 hover:bg-blue-500 disabled:bg-slate-800 disabled:text-slate-600 disabled:border-slate-700 text-white font-bold py-2.5 rounded shadow-lg transition-all flex items-center justify-center gap-2"
              >
                {status === AnalysisStatus.LOADING ? <Loader2 className="w-4 h-4 animate-spin" /> : <Activity size={16} />}
                Run Environmental Analysis
              </button>
            </div>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-5 scroll-smooth custom-scrollbar">
          {!isGeeReady ? (
            <div className="h-full flex flex-col items-center justify-center text-center opacity-80">
              <AlertTriangle className="w-16 h-16 text-amber-500 mb-4" />
              <h3 className="text-lg font-medium text-slate-300">Authorization Required</h3>
              <p className="text-sm text-slate-500 max-w-xs mt-2 mb-4">Please log in to authorize Earth Engine and start analyzing environmental data.</p>
              <button onClick={() => setShowSettings(true)} className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded text-sm transition-colors border border-slate-700">Login</button>
            </div>
          ) : status === AnalysisStatus.IDLE && (
            <div className="h-full flex flex-col items-center justify-center text-center opacity-60">
              <MapIcon className="w-16 h-16 text-slate-700 mb-4" />
              <h3 className="text-lg font-medium text-slate-300">Prepare Analysis</h3>
              <p className="text-sm text-slate-500 max-w-xs mt-2">
                {pendingLocation || customGeometry
                  ? "Location selected. Click 'Run Environmental Analysis' to start."
                  : `Select a location on the map, draw a polygon, or upload a spatial file.`}
              </p>
            </div>
          )}

          {status === AnalysisStatus.LOADING && (
            <div className="h-full flex flex-col items-center justify-center text-center animate-pulse">
              <Loader2 className="w-10 h-10 text-emerald-500 animate-spin mb-4" />
              <h3 className="text-base font-medium text-slate-300">{analysis ? 'Querying Earth Engine...' : `Identifying ${analysisLevel}...`}</h3>
              <p className="text-xs text-slate-500 mt-2">{analysis ? 'Aggregating regional data...' : 'Please wait...'}</p>
            </div>
          )}

          {status === AnalysisStatus.ERROR && (
            <div className="h-full flex flex-col items-center justify-center text-center">
              <Activity className="w-12 h-12 text-red-500 mb-4" />
              <h3 className="text-base font-medium text-red-400">Analysis Failed</h3>
              <p className="text-xs text-slate-500 mt-2 max-w-xs">{errorMessage || "Check console for errors. Your GEE account might not be authorized."}</p>
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
                    <select
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
                    </select>
                  </div>

                  <div className="space-y-4">
                    {['Vegetation', 'Water', 'Burn', 'Urban', 'Geological', 'Climate']
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
                                  <div key={idx.id} className="bg-slate-800/40 p-2.5 rounded-lg border border-slate-800/50 hover:border-slate-700 transition-colors">
                                    <div className="text-[10px] text-slate-500 truncate" title={idx.description}>{idx.name}</div>
                                    <div className={`text-base font-bold ${cat === 'Vegetation' ? 'text-emerald-400' : cat === 'Water' ? 'text-sky-400' : cat === 'Burn' ? 'text-orange-500' : 'text-slate-300'}`}>
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

                  <div className="bg-slate-800/80 p-4 rounded-xl border border-slate-700 shadow-xl">
                    <div className="flex items-center justify-between mb-3">
                      <h4 className="text-xs font-bold text-white flex items-center gap-2"><ImageIcon size={14} className="text-blue-400" /> Selective GeoTIFF Export</h4>
                      <div className="text-[10px] text-slate-500">{exportIndices.length} layers selected</div>
                    </div>
                    <div className="max-h-40 overflow-y-auto mb-4 pr-1 scrollbar-thin scrollbar-thumb-slate-700">
                      <div className="grid grid-cols-2 gap-2">
                        {AVAILABLE_INDICES.filter(i => !['rainfall', 'temperature'].includes(i.id)).map(idx => (
                          <label key={idx.id} className="flex items-center gap-2 p-1.5 rounded bg-slate-900/50 hover:bg-slate-900 border border-slate-800 cursor-pointer transition-all">
                            <input
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
                      className="w-full bg-blue-600 hover:bg-blue-500 disabled:bg-slate-800 disabled:text-slate-600 text-white text-xs font-bold py-2 rounded shadow-lg transition-all flex items-center justify-center gap-2"
                    >
                      {isExporting ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
                      {isExporting ? 'Generating Selective GeoTIFF...' : `Export ${exportIndices.length} Selected Indices`}
                    </button>
                  </div>

                  <VegetationChart data={analysis.data} />
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

        <div className="p-4 border-t border-slate-800 bg-slate-900 text-[10px] text-slate-600 flex justify-between items-center">
          <span>Powered by Google Earth Engine™</span>
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
        />
      </main>
    </div>
  );
};

export default App;