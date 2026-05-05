import { Coordinates, RegionAnalysis, AnalysisLevel, AVAILABLE_INDICES, RegionGeometry } from "../types";

// Declare the global ee object loaded via script tag
declare var ee: any;

let isInitialized = false;

export const initializeGEE = async () => {
  if (typeof ee === 'undefined') {
    throw new Error("Earth Engine API script not loaded");
  }
  ee.data.clearAuthToken();
  const clientId = import.meta.env.VITE_GEE_OAUTH_CLIENT_ID;
  if (!clientId) {
    throw new Error("Google OAuth Client ID not provided in environment variable VITE_GEE_OAUTH_CLIENT_ID.");
  }

  return new Promise<void>((resolve, reject) => {
    ee.data.authenticateViaOauth(clientId, () => {
      ee.initialize(null, null, () => {
        isInitialized = true;
        resolve();
      }, (e: any) => reject(new Error("GEE Initialization Failed: " + e)));
    }, (e: any) => reject(new Error("GEE Authentication Failed: " + e)),
    ['https://www.googleapis.com/auth/earthengine.readonly'],
    () => reject(new Error("Authentication cancelled by user.")), true);
  });
};


const validateAndCleanGeometry = (geometry: any) => {
  if (!geometry) return null;
  let rawGeometry = geometry;
  if (geometry.type === 'Feature') rawGeometry = geometry.geometry;
  else if (geometry.type === 'FeatureCollection') rawGeometry = geometry.features[0]?.geometry;

  if (!rawGeometry || (rawGeometry.type !== 'Polygon' && rawGeometry.type !== 'MultiPolygon')) return rawGeometry;

  if (rawGeometry.type === 'Polygon') {
    const cleanedCoords = rawGeometry.coordinates.map((ring: any[]) => {
      const uniquePoints = ring.filter((p, i, arr) => {
        if (i === 0) return true;
        return Math.abs(p[0] - arr[i-1][0]) > 0.0000001 || Math.abs(p[1] - arr[i-1][1]) > 0.0000001;
      });
      const last = uniquePoints[uniquePoints.length - 1];
      const first = uniquePoints[0];
      if (uniquePoints.length > 1 && (Math.abs(last[0] - first[0]) > 0.0000001 || Math.abs(last[1] - first[1]) > 0.0000001)) {
        uniquePoints.push([first[0], first[1]]);
      }
      return uniquePoints;
    });
    if (!cleanedCoords[0] || cleanedCoords[0].length < 4) throw new Error("Invalid Geometry: Selected area has no area. Please draw a larger polygon.");
    return { ...rawGeometry, coordinates: cleanedCoords };
  }
  return rawGeometry;
};

const evaluateWithSignal = <T>(eeObject: any, signal?: AbortSignal): Promise<T> => {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      return reject(new DOMException("Aborted", "AbortError"));
    }

    const abortHandler = () => {
      reject(new DOMException("Aborted", "AbortError"));
    };

    if (signal) {
      signal.addEventListener("abort", abortHandler);
    }

    eeObject.evaluate((result: T, error: any) => {
      if (signal) {
        signal.removeEventListener("abort", abortHandler);
      }
      if (error) {
        reject(new Error(error));
      } else {
        if (signal?.aborted) {
          reject(new DOMException("Aborted", "AbortError"));
        } else {
          resolve(result);
        }
      }
    });
  });
};

const getTiffUrlWithRetry = (image: any, name: string, region: any, initialScale: number): Promise<string | null> => {
  return new Promise((resolve) => {
    const scalesToTry = [initialScale, 50, 100, 250, 500].filter((s, i, a) => s >= initialScale && a.indexOf(s) === i);
    let currentAttempt = 0;
    const tryDownload = (scale: number) => {
      image.getDownloadURL({ name, scale, region, format: 'GEO_TIFF' }, (url: string, error: any) => {
        if (error) {
          const errorStr = error.toString();
          if (errorStr.includes("Total request size") && currentAttempt < scalesToTry.length - 1) {
            currentAttempt++;
            tryDownload(scalesToTry[currentAttempt]);
          } else {
            resolve(null);
          }
        } else resolve(url);
      });
    };
    tryDownload(initialScale);
  });
};

const getIndexExpression = (id: string, bands: any, img: any) => {
  const b = (name: string) => img.select(bands[name as keyof typeof bands]);
  switch (id) {
    case 'ndvi': return img.normalizedDifference([bands.nir, bands.red]);
    case 'evi': return img.expression('2.5 * ((NIR - RED) / (NIR + 6 * RED - 7.5 * BLUE + 1))', { 'NIR': b('nir'), 'RED': b('red'), 'BLUE': b('blue') });
    case 'savi': return img.expression('((NIR - RED) / (NIR + RED + 0.5)) * 1.5', { 'NIR': b('nir'),'RED': b('red') });
    case 'osavi': return img.expression('(NIR - RED) / (NIR + RED + 0.16)', { 'NIR': b('nir'),'RED': b('red') });
    case 'gndvi': return img.normalizedDifference([bands.nir, bands.green]);
    case 'msavi': return img.expression('(2 * NIR + 1 - sqrt(pow((2 * NIR + 1), 2) - 8 * (NIR - RED))) / 2', { 'NIR': b('nir'), 'RED': b('red') });
    case 'gcvi': return img.expression('(NIR / GREEN) - 1.0', { 'NIR': b('nir'), 'GREEN': b('green') });
    case 'reip': return img.expression('700 + 40 * (((RED + RE3) / 2.0 - RE1) / (RE2 - RE1))', { 'RED': b('red'), 'RE1': b('re1'), 'RE2': b('re2'), 'RE3': b('re3') });
    case 'ndre': return img.normalizedDifference([bands.nir, bands.re1]);
    case 'vari': return img.expression('(GREEN - RED) / (GREEN + RED - BLUE)', { 'GREEN': b('green'), 'RED': b('red'), 'BLUE': b('blue') });
    case 'tvi': return img.expression('0.5 * (120 * (NIR - GREEN) - 200 * (RED - GREEN))', { 'NIR': b('nir'), 'GREEN': b('green'), 'RED': b('red') });
    case 'cvi': return img.expression('(NIR * RED) / (GREEN * GREEN)', { 'NIR': b('nir'), 'RED': b('red'), 'GREEN': b('green') });
    case 'ndwi': return img.normalizedDifference([bands.green, bands.nir]);
    case 'mndwi': return img.normalizedDifference([bands.green, bands.swir1]);
    case 'aweinsh': return img.expression('4 * (GREEN - SWIR1) - (0.25 * NIR + 2.75 * SWIR2)', { 'GREEN': b('green'), 'SWIR1': b('swir1'), 'NIR': b('nir'), 'SWIR2': b('swir2') });
    case 'aweish': return img.expression('BLUE + 2.5 * GREEN - 1.5 * (NIR + SWIR1) - 0.25 * SWIR2', { 'BLUE': b('blue'), 'GREEN': b('green'), 'NIR': b('nir'), 'SWIR1': b('swir1'), 'SWIR2': b('swir2') });
    case 'ndmi': return img.normalizedDifference([bands.nir, bands.swir1]);
    case 'lswi': return img.normalizedDifference([bands.nir, bands.swir1]);
    case 'gvmi': return img.expression('((NIR + 0.1) - (SWIR2 + 0.02)) / ((NIR + 0.1) + (SWIR2 + 0.02))', { 'NIR': b('nir'), 'SWIR2': b('swir2') });
    case 'wri': return img.expression('(GREEN + RED) / (NIR + SWIR1)', { 'GREEN': b('green'), 'RED': b('red'), 'NIR': b('nir'), 'SWIR1': b('swir1') });
    case 'nbr': return img.normalizedDifference([bands.nir, bands.swir2]);
    case 'nbr2': return img.normalizedDifference([bands.swir1, bands.swir2]);
    case 'bai': return img.expression('1.0 / (pow(0.1 - RED, 2) + pow(0.06 - NIR, 2))', { 'RED': b('red'), 'NIR': b('nir') });
    case 'mirbi': return img.expression('10 * SWIR2 - 9.8 * SWIR1 + 2.0', { 'SWIR1': b('swir1'), 'SWIR2': b('swir2') });
    case 'csi': return img.expression('NIR / SWIR2', { 'NIR': b('nir'), 'SWIR2': b('swir2') });
    case 'ndbi': return img.normalizedDifference([bands.swir1, bands.nir]);
    case 'ui': return img.normalizedDifference([bands.swir2, bands.nir]);
    case 'bsi': return img.expression('((SWIR1 + RED) - (NIR + BLUE)) / ((SWIR1 + RED) + (NIR + BLUE))', { 'SWIR1': b('swir1'), 'RED': b('red'), 'NIR': b('nir'), 'BLUE': b('blue') });
    case 'bi': return img.expression('((SWIR1 + RED) - (NIR + BLUE)) / ((SWIR1 + RED) + (NIR + BLUE))', { 'SWIR1': b('swir1'), 'RED': b('red'), 'NIR': b('nir'), 'BLUE': b('blue') });
    case 'ndsi': return img.normalizedDifference([bands.green, bands.swir1]);
    case 'clay': return img.expression('SWIR1 / SWIR2', { 'SWIR1': b('swir1'), 'SWIR2': b('swir2') });
    case 'fe': return img.expression('SWIR1 / NIR', { 'SWIR1': b('swir1'), 'NIR': b('nir') });
    case 'alui': return img.expression('SWIR1 / SWIR2', { 'SWIR1': b('swir1'), 'SWIR2': b('swir2') });
    case 'cali': return img.expression('SWIR2 / SWIR1', { 'SWIR1': b('swir1'), 'SWIR2': b('swir2') });
    case 'doli': return img.expression('SWIR2 / SWIR1', { 'SWIR1': b('swir1'), 'SWIR2': b('swir2') });
    case 'cai': return img.expression('(SWIR1 + SWIR2) / SWIR1', { 'SWIR1': b('swir1'), 'SWIR2': b('swir2') });
    default: return null;
  }
};

const getLULCData = async (geometry: any, year: number, signal?: AbortSignal) => {
  const startDate = `${year}-01-01`;
  const currentYear = new Date().getFullYear();
  const endDate = year === currentYear ? new Date().toISOString().split('T')[0] : `${year}-12-31`;
  const lulcClasses = [
    { name: 'Water', color: '#419BDF' }, { name: 'Trees', color: '#397D49' }, { name: 'Grass', color: '#88B053' },
    { name: 'Flooded Vegetation', color: '#7A87C6' }, { name: 'Crops', color: '#E49635' }, { name: 'Shrub & Scrub', color: '#DFC35A' },
    { name: 'Built Area', color: '#C4281B' }, { name: 'Bare Ground', color: '#A59B8F' }, { name: 'Snow & Ice', color: '#B39FE1' }
  ];
  const lulcCol = ee.ImageCollection('GOOGLE/DYNAMICWORLD/V1').filterDate(startDate, endDate).filterBounds(geometry);
  const size = await evaluateWithSignal<number>(lulcCol.size(), signal);
  if (size === 0) return { visualization: null, data: [] };
  const lulcImage = lulcCol.select('label').mode().clip(geometry);
  const lulcVis = { min: 0, max: 8, palette: lulcClasses.map(c => c.color) };
  const lulcMap = await new Promise<any>((resolve, reject) => {
    if (signal?.aborted) return reject(new DOMException("Aborted", "AbortError"));
    lulcImage.getMap(lulcVis, (obj: any) => {
      if (signal?.aborted) reject(new DOMException("Aborted", "AbortError"));
      else resolve(obj ? { mapId: obj.mapid, url: obj.urlFormat } : null);
    });
  });
  const lulcChart = await evaluateWithSignal<any>(lulcImage.reduceRegion({ reducer: ee.Reducer.frequencyHistogram(), geometry, scale: 10, maxPixels: 1e11 }), signal);
  if (!lulcChart || !lulcChart.label) return { visualization: lulcMap, data: [] };
  const totalPixels = Object.values(lulcChart.label as object).reduce((a, b) => a + b, 0);
  const lulcData = Object.entries(lulcChart.label as object).map(([id, count]) => ({ name: lulcClasses[Number(id)]?.name, percentage: (count / totalPixels) * 100, color: lulcClasses[Number(id)]?.color })).filter(d => d.name);
  return { visualization: lulcMap, data: lulcData };
};

export const getExportUrl = async (region: any, year: number, resolution: number, startDate: string, endDate: string, selectedIndices: string[]): Promise<string | null> => {
    const geometry = ee.Geometry(validateAndCleanGeometry(region));
    const imageCol = ee.ImageCollection(resolution === 10 ? 'COPERNICUS/S2_SR' : 'LANDSAT/LC08/C02/T1_L2')
        .filterDate(startDate, endDate).filterBounds(geometry);
    const medianImage = imageCol.median().clip(geometry);
    const bands = resolution === 10 ? 
        { blue: 'B2', green: 'B3', red: 'B4', nir: 'B8', swir1: 'B11', swir2: 'B12', re1: 'B5', re2: 'B6', re3: 'B7' } :
        { blue: 'SR_B2', green: 'SR_B3', red: 'SR_B4', nir: 'SR_B5', swir1: 'SR_B6', swir2: 'SR_B7', re1: 'SR_B5', re2: 'SR_B5', re3: 'SR_B5' };
    
    let exportImage = ee.Image([]);
    selectedIndices.forEach(id => {
        const idxImg = getIndexExpression(id, bands, medianImage);
        if (idxImg) exportImage = exportImage.addBands(idxImg.rename(id));
    });
    
    if (exportImage.bandNames().size().evaluate((s: number) => s === 0)) return null;
    return await getTiffUrlWithRetry(exportImage, `ecolens_export_${year}`, geometry, resolution);
};

export const analyzeRegionWithGEE = async (region: RegionGeometry, year: number, level: AnalysisLevel, resolution: number, startDate: string, endDate: string, analysisCategory: string = 'All', signal?: AbortSignal): Promise<RegionAnalysis> => {
  if (!isInitialized) throw new Error("Earth Engine not initialized.");
  if (signal?.aborted) throw new DOMException("Aborted", "AbortError");

  const cleanedGeometry = validateAndCleanGeometry(region.geometry);
  const geometry = level === 'custom' ? ee.Geometry(cleanedGeometry) : ee.Feature(region.geometry).geometry();
  const climateCol = ee.ImageCollection("ECMWF/ERA5_LAND/MONTHLY_AGGR").filterDate(startDate, endDate).filterBounds(geometry);
  const droughtCol = ee.ImageCollection("IDAHO_EPSCOR/TERRACLIMATE").filterDate(startDate, endDate).filterBounds(geometry);
  const bands = resolution === 10 ? 
    { blue: 'B2', green: 'B3', red: 'B4', nir: 'B8', swir1: 'B11', swir2: 'B12', re1: 'B5', re2: 'B6', re3: 'B7' } :
    { blue: 'SR_B2', green: 'SR_B3', red: 'SR_B4', nir: 'SR_B5', swir1: 'SR_B6', swir2: 'SR_B7', re1: 'SR_B5', re2: 'SR_B5', re3: 'SR_B5' };
  
  const imageCol = ee.ImageCollection(resolution === 10 ? 'COPERNICUS/S2_SR' : 'LANDSAT/LC08/C02/T1_L2')
    .filterDate(startDate, endDate)
    .filterBounds(geometry);
    
  const scale = resolution;

  const months = ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12'];
  
  const [climateData, droughtData, indicesData] = await Promise.all([
    (async () => {
      const stats = climateCol.map((img: any) => {
        const s = img.reduceRegion({ reducer: ee.Reducer.mean(), geometry, scale: 27830, bestEffort: true });
        return ee.Feature(null, { m: img.date().format('MM'), t: s.get('temperature_2m'), r: s.get('total_precipitation_sum') });
      });
      const features: any = await evaluateWithSignal(stats, signal);
      return features?.features?.map((f: any) => f.properties) || [];
    })(),
    (async () => {
      const stats = droughtCol.map((img: any) => {
        const spei = img.expression('pr-pet', {pr:img.select('pr'),pet:img.select('pet')}).rename('spei');
        const s = img.addBands(spei).reduceRegion({ reducer: ee.Reducer.mean(), geometry, scale: 4638, bestEffort: true });
        return ee.Feature(null, { m: img.date().format('MM'), p: s.get('pdsi'), s: s.get('spei') });
      });
      const features: any = await evaluateWithSignal(stats, signal);
      return features?.features?.map((f: any) => f.properties) || [];
    })(),
    (async () => {
      // OPTIMIZED: Use server-side mapping for all months at once
      const statsList = ee.List.sequence(1, 12).map((m: any) => {
        const month = ee.Number(m);
        const monthlyImg = imageCol.filter(ee.Filter.calendarRange(month, month, 'month')).median();
        
        let all = ee.Image([]);
        AVAILABLE_INDICES
          .filter(i => {
            if (['rainfall','temperature','pdsi','spei'].includes(i.id)) return false;
            if (analysisCategory === 'All') return true;
            return i.category === analysisCategory;
          })
          .forEach(i => {
            const idx = getIndexExpression(i.id, bands, monthlyImg);
            if (idx) all = all.addBands(idx.rename(i.id));
          });
        
        const stats = all.reduceRegion({ 
          reducer: ee.Reducer.mean(), 
          geometry, 
          scale: scale > 100 ? scale : 100, // Coarser scale for faster chart data
          bestEffort: true,
          maxPixels: 1e9
        });
        
        return ee.Feature(null, stats.set('m', ee.Number(m).format('%02d')));
      });
      
      const features: any = await evaluateWithSignal(ee.FeatureCollection(statsList), signal);
      return features?.features?.map((f: any) => f.properties) || [];
    })()
  ]);

  const runVisualizationAnalysis = async () => {
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
    const medianImage = imageCol.median().clip(geometry);
    const viz: any = {};
    
    // Filter indices based on category
    const categoryIndices = AVAILABLE_INDICES.filter(i => {
      if (analysisCategory === 'All') return i.id === 'ndvi'; // Only NDVI for 'All' to avoid heavy request
      return i.category === analysisCategory;
    });

    await Promise.all(categoryIndices.map(async (idx) => {
      let img;
      if (idx.id === 'pdsi' || idx.id === 'spei') {
         const droughtImg = ee.ImageCollection("IDAHO_EPSCOR/TERRACLIMATE").filterDate(startDate, endDate).filterBounds(geometry).median();
         img = idx.id === 'pdsi' ? droughtImg.select('pdsi') : droughtImg.expression('pr-pet',{pr:droughtImg.select('pr'),pet:droughtImg.select('pet')});
      } else {
         img = getIndexExpression(idx.id, bands, medianImage);
      }

      if (img) {
        const palette = idx.category === 'Vegetation' ? ['#ffffe5', '#f7fcb9', '#d9f0a3', '#addd8e', '#78c679', '#41ab5d', '#238443', '#006837', '#004529'] : 
                      idx.category === 'Water' ? ['red', 'yellow', 'green', 'cyan', 'blue'] : 
                      idx.category === 'Burn' ? ['#7a5230', '#d5a478', '#fff5d7', '#d4e7b0', '#397d49'] : 
                      idx.id === 'pdsi' || idx.id === 'spei' ? ['#ff0000', '#ffffff', '#0000ff'] : ['#008000', '#ffff00', '#ff0000'];
        const vis = { min: idx.category === 'Climate' ? -10 : -1, max: idx.category === 'Climate' ? 10 : 1, palette };
        viz[idx.id] = await new Promise<any>((resolve, reject) => {
          if (signal?.aborted) return reject(new DOMException("Aborted", "AbortError"));
          img.getMap(vis, (obj: any) => {
            if (signal?.aborted) reject(new DOMException("Aborted", "AbortError"));
            else resolve(obj ? { mapId: obj.mapid, url: obj.urlFormat } : null);
          });
        });
      }
    }));
    
    viz.tiffDownloadUrl = await getTiffUrlWithRetry(medianImage, 'export', geometry, resolution);
    return viz;
  };

  const [vizData, lulc] = await Promise.all([runVisualizationAnalysis(), getLULCData(geometry, year, signal)]);
  const monthlyData = months.map((m, i) => {
    const d: any = { month: new Date(year, i).toLocaleString('default', { month: 'short' }) };
    const cs = climateData.find((f: any) => f.m === m);
    const ds = droughtData.find((f: any) => f.m === m);
    const is = indicesData.find((f: any) => f.m === m);
    d.temperature = cs ? cs.t - 273.15 : 0;
    d.rainfall = cs ? cs.r * 1000 : 0;
    d.pdsi = ds ? ds.p : 0;
    d.spei = ds ? ds.s : 0;
    AVAILABLE_INDICES.forEach(idx => { if (is && is[idx.id] !== undefined) d[idx.id] = is[idx.id]; });
    return d;
  });

  const metadata = { resolution, startDate, endDate, bands, imageColId: resolution === 10 ? 'COPERNICUS/S2_SR' : 'LANDSAT/LC08/C02/T1_L2' };

  const geeScript = `// EcoLens WebGIS - Analysis Script
var geometry = ${JSON.stringify(geometry)};
var startDate = '${startDate}';
var endDate = '${endDate}';
var s2 = ee.ImageCollection('${metadata.imageColId}')
  .filterBounds(geometry)
  .filterDate(startDate, endDate)
  .median()
  .clip(geometry);
var bands = ${JSON.stringify(bands)};
var ndvi = s2.expression('(NIR - RED) / (NIR + RED)', {
  'NIR': s2.select(bands.nir),
  'RED': s2.select(bands.red)
}).rename('NDVI');
Map.centerObject(geometry, 12);
Map.addLayer(s2, {bands: [bands.red, bands.green, bands.blue], min: 0, max: 3000}, 'Natural Color');
Map.addLayer(ndvi, {min: -1, max: 1, palette: ['red', 'white', 'green']}, 'NDVI');
var stats = ndvi.reduceRegion({
  reducer: ee.Reducer.mean(),
  geometry: geometry,
  scale: ${resolution},
  maxPixels: 1e9
});
print('Mean NDVI:', stats.get('NDVI'));`;

  return { 
    coordinates: region.center, 
    locationName: region.name, 
    summary: `Analysis for ${region.name} (${year}).`, 
    data: monthlyData, 
    geeScript, 
    tiffDownloadUrl: vizData.tiffDownloadUrl, 
    landCover: lulc.data, 
    visualization: { ...vizData, lulc: lulc.visualization, _metadata: metadata }, 
    regionGeometry: region.geometry 
  };
};

export const getLazyMapId = async (indexId: string, regionGeometry: any, metadata: any): Promise<{ mapId: string; url: string } | null> => {
  if (!isInitialized) return null;
  const geometry = ee.Geometry(validateAndCleanGeometry(regionGeometry));
  const imageCol = ee.ImageCollection(metadata.imageColId).filterDate(metadata.startDate, metadata.endDate).filterBounds(geometry);
  const medianImage = imageCol.median().clip(geometry);
  const idx = AVAILABLE_INDICES.find(i => i.id === indexId);
  if (!idx) return null;
  let img = idx.id === 'pdsi' || idx.id === 'spei' ? 
      (idx.id === 'pdsi' ? ee.ImageCollection("IDAHO_EPSCOR/TERRACLIMATE").filterDate(metadata.startDate, metadata.endDate).filterBounds(geometry).median().select('pdsi') : 
       ee.ImageCollection("IDAHO_EPSCOR/TERRACLIMATE").filterDate(metadata.startDate, metadata.endDate).filterBounds(geometry).median().expression('pr-pet',{pr:ee.ImageCollection("IDAHO_EPSCOR/TERRACLIMATE").filterDate(metadata.startDate, metadata.endDate).filterBounds(geometry).median().select('pr'),pet:ee.ImageCollection("IDAHO_EPSCOR/TERRACLIMATE").filterDate(metadata.startDate, metadata.endDate).filterBounds(geometry).median().select('pet')})) : 
      getIndexExpression(idx.id, metadata.bands, medianImage);
  if (!img) return null;
  const palette = idx.category === 'Vegetation' ? ['#ffffe5', '#f7fcb9', '#d9f0a3', '#addd8e', '#78c679', '#41ab5d', '#238443', '#006837', '#004529'] : 
                idx.category === 'Water' ? ['red', 'yellow', 'green', 'cyan', 'blue'] : 
                idx.category === 'Burn' ? ['#7a5230', '#d5a478', '#fff5d7', '#d4e7b0', '#397d49'] : 
                idx.id === 'pdsi' || idx.id === 'spei' ? ['#ff0000', '#ffffff', '#0000ff'] : ['#008000', '#ffff00', '#ff0000'];
  const vis = { min: idx.category === 'Climate' ? -10 : -1, max: idx.category === 'Climate' ? 10 : 1, palette };
  return await new Promise(r => img.getMap(vis, (o: any) => r(o ? { mapId: o.mapid, url: o.urlFormat } : null)));
};

const CUSTOM_TEHSIL_ASSET = 'projects/ee-saimsuhail5/assets/pak_tehsils'; 
const CUSTOM_TEHSIL_PROPS = ['adm3_name', 'ADM3_EN', 'NAME_3', 'tehsil', 'TEHSIL', 'name'];

export const getRegionFromCoords = async (coords: Coordinates, level: AnalysisLevel, signal?: AbortSignal): Promise<RegionGeometry | null> => {
  if (level === 'custom') return null;
  const point = ee.Geometry.Point([coords.lng, coords.lat]);
  
  let collectionId = `FAO/GAUL/2015/level${level}`;
  let nameProperty = `ADM${level}_NAME`;
  let displayNameSuffix = "";

  if (level === '3') {
    const isPakistan = coords.lat > 23 && coords.lat < 38 && coords.lng > 60 && coords.lng < 80;
    
    // Create a list of assets to try, starting with the custom one if provided
    const tehsilAssets = [];
    if (CUSTOM_TEHSIL_ASSET) {
      CUSTOM_TEHSIL_PROPS.forEach(p => tehsilAssets.push({ id: CUSTOM_TEHSIL_ASSET, prop: p }));
    }
    
    if (isPakistan) {
      tehsilAssets.push(
        { id: 'projects/ee-ocha-pakistan/assets/pak_admbnda_adm3_wfp_20220909', prop: 'ADM3_EN' },
        { id: 'projects/ee-pakistan-tehsil/assets/pak_admbnda_adm3_wfp_20220909', prop: 'ADM3_EN' },
        { id: 'projects/ee-gadm/assets/gadm41_PAK_3', prop: 'NAME_3' },
        { id: 'WM/GeoLab/GeoBoundaries/600/ADM3', prop: 'shapeName' },
        { id: 'WFP/SPIDER/PCODE/PAK/Tehsil', prop: 'tehsil' }
      );
    }

      // OPTIMIZED: Parallelized Tehsil checks
      const results = await Promise.all(tehsilAssets.map(async (asset) => {
        try {
          if (signal?.aborted) return null;
          const collection = ee.FeatureCollection(asset.id);
          const feature = collection.filterBounds(point).first();
          const data = await evaluateWithSignal<any>(feature, signal);
          if (data && data.properties) {
            return { 
              name: (data.properties[asset.prop] || Object.values(data.properties)[0]) + " (Tehsil)", 
              geometry: data.geometry, 
              center: coords 
            };
          }
        } catch (err) {
          return null;
        }
        return null;
      }));

      const successfulResult = results.find(r => r !== null);
      if (successfulResult) return successfulResult;

      // Fallback if no specialized Tehsil found
      collectionId = 'FAO/GAUL/2015/level2';
      nameProperty = 'ADM2_NAME';
      displayNameSuffix = " (District Fallback)";
    }

  // Try to fetch the region
  try {
    const collection = ee.FeatureCollection(collectionId);
    const feature = collection.filterBounds(point).first();
    const data = await evaluateWithSignal<any>(feature, signal);
    
    if (!data) {
      // If Level 3 failed, try Level 2
      if (level === '3') {
        const fallbackCol = ee.FeatureCollection('FAO/GAUL/2015/level2');
        const fallbackFeat = fallbackCol.filterBounds(point).first();
        const fallbackData = await evaluateWithSignal<any>(fallbackFeat, signal);
        if (fallbackData) {
          return { name: fallbackData.properties['ADM2_NAME'] + " (District)", geometry: fallbackData.geometry, center: coords };
        }
      }
      return null;
    }
    
    return { name: data.properties[nameProperty] + displayNameSuffix, geometry: data.geometry, center: coords };
  } catch (e) {
    if (e.name === 'AbortError') throw e;
    console.error("Error fetching region:", e);
    return null;
  }
};

export const getCountries = async (): Promise<string[]> => {
  const col = ee.FeatureCollection('FAO/GAUL/2015/level0');
  const names = await new Promise<string[]>((res) => col.aggregate_array('ADM0_NAME').evaluate((d: any) => res(Array.from(new Set(d || [])).sort() as string[])));
  return names;
};

export const getProvinces = async (country: string): Promise<string[]> => {
  const col = ee.FeatureCollection('FAO/GAUL/2015/level1').filter(ee.Filter.eq('ADM0_NAME', country));
  const names = await new Promise<string[]>((res) => col.aggregate_array('ADM1_NAME').evaluate((d: any) => res(Array.from(new Set(d || [])).sort() as string[])));
  return names;
};

export const getDistricts = async (province: string): Promise<string[]> => {
  const col = ee.FeatureCollection('FAO/GAUL/2015/level2').filter(ee.Filter.eq('ADM1_NAME', province));
  const names = await new Promise<string[]>((res) => col.aggregate_array('ADM2_NAME').evaluate((d: any) => res(Array.from(new Set(d || [])).sort() as string[])));
  return names;
};

export const getTehsils = async (district: string): Promise<{name: string, geometry: any}[]> => {
  const customAssetId = CUSTOM_TEHSIL_ASSET;
  const fallbackAssetIds = [
    'projects/ee-ocha-pakistan/assets/pak_admbnda_adm3_wfp_20220909',
    'WFP/SPIDER/PCODE/PAK/Tehsil',
    'projects/ee-pakistan-tehsil/assets/pak_admbnda_adm3_wfp_20220909'
  ];
  
  // Broader property list for matching district names
  const districtProps = ['adm2_name', 'NAME_2', 'ADM2_EN', 'DISTRICT', 'District', 'ADM2_NAME', 'NAME_1', 'ADM1_EN', 'dist_nm'];

  // Clean district name: remove " District" or " Division" suffix if present
  const cleanedDistrict = district.replace(/ district/i, "").replace(/ division/i, "").trim();
  const districtUpper = cleanedDistrict.toUpperCase();

  const fetchFilteredFromAsset = async (assetId: string) => {
    const col = ee.FeatureCollection(assetId);
    
    // Create filters for the district name in multiple properties
    const filters = districtProps.map(prop => 
       ee.Filter.or(
         ee.Filter.stringContains(prop, cleanedDistrict), 
         ee.Filter.stringContains(prop, districtUpper)
       )
    );
    const districtFilter = ee.Filter.or(...filters);
    
    return new Promise<any>((res, rej) => {
      col.filter(districtFilter).evaluate((d: any, err: any) => {
        if (err) rej(err);
        else res(d);
      });
    });
  };

  try {
    let data: any = null;
    const assetsToTry = [customAssetId, ...fallbackAssetIds].filter(Boolean);
    
    for (const assetId of assetsToTry) {
      try {
        console.log(`Trying Tehsil asset: ${assetId} for district ${cleanedDistrict}`);
        data = await fetchFilteredFromAsset(assetId as string);
        if (data && data.features && data.features.length > 0) {
          console.log(`Found ${data.features.length} Tehsils in ${assetId}`);
          break;
        }
      } catch (e) {
        console.warn(`Failed to fetch from ${assetId}:`, e);
      }
    }

    // Fallback: If filtered fails, try to fetch the whole collection and filter (last resort)
    if (!data || !data.features || data.features.length === 0) {
       console.log("No tehsils found with server filter. Trying local filter fallback...");
       for (const assetId of assetsToTry) {
         try {
           const col = ee.FeatureCollection(assetId);
           const result: any = await new Promise((res) => col.evaluate((d: any) => res(d)));
           if (result && result.features) {
             const filtered = result.features.filter((f: any) => {
                return Object.values(f.properties).some(v => {
                  const val = String(v).toUpperCase();
                  return val.includes(districtUpper) || districtUpper.includes(val);
                });
             });
             if (filtered.length > 0) {
               data = { features: filtered };
               console.log(`Local filter found ${filtered.length} Tehsils in ${assetId}`);
               break;
             }
           }
         } catch (e) {}
       }
    }

    if (!data || !data.features) return [];

    const nameProps = ['adm3_name', 'NAME_3', 'ADM3_EN', 'TEHSIL', 'Tehsil', 'ADM3_NAME', 'NAME_2', 'adm3_en', 'tehsil'];
    return data.features.map((f: any) => {
      const prop = nameProps.find(p => f.properties[p] !== undefined) || Object.keys(f.properties)[0];
      return { name: f.properties[prop] || 'Unknown Tehsil', geometry: f.geometry };
    }).sort((a: any, b: any) => a.name.localeCompare(b.name));
  } catch (err) {
    console.error("Critical error in getTehsils:", err);
    return [];
  }
};
