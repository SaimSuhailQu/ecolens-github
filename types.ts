export interface Coordinates {
  lat: number;
  lng: number;
}

export interface MonthlyDataPoint {
  month: string;
  [key: string]: string | number; // Allow dynamic indices
}

export interface RegionGeometry {
  name: string;
  geometry: any; // GeoJSON geometry
  center: Coordinates;
}

export type AnalysisLevel = '0' | '1' | '2' | '3' | 'custom';

export interface IndexInfo {
  id: string;
  name: string;
  description: string;
  category: 'Vegetation' | 'Water' | 'Burn' | 'Urban' | 'Geological' | 'Climate' | 'Heat';
}

export const AVAILABLE_INDICES: IndexInfo[] = [
  // Vegetation
  { id: 'ndvi', name: 'NDVI', category: 'Vegetation', description: 'Normalized Difference Vegetation Index' },
  { id: 'evi', name: 'EVI', category: 'Vegetation', description: 'Enhanced Vegetation Index' },
  { id: 'savi', name: 'SAVI', category: 'Vegetation', description: 'Soil-Adjusted Vegetation Index' },
  { id: 'osavi', name: 'OSAVI', category: 'Vegetation', description: 'Optimized Soil-Adjusted Vegetation Index' },
  { id: 'gndvi', name: 'GNDVI', category: 'Vegetation', description: 'Green Normalized Difference Vegetation Index' },
  { id: 'msavi', name: 'MSAVI', category: 'Vegetation', description: 'Modified Soil Adjusted Vegetation Index' },
  { id: 'gcvi', name: 'GCVI', category: 'Vegetation', description: 'Green Chlorophyll Vegetation Index' },
  { id: 'reip', name: 'REIP', category: 'Vegetation', description: 'Red Edge Inflection Point' },
  { id: 'ndre', name: 'NDRE', category: 'Vegetation', description: 'Normalized Difference Red Edge Index' },
  { id: 'vari', name: 'VARI', category: 'Vegetation', description: 'Visible Atmospherically Resistant Index' },
  { id: 'tvi', name: 'TVI', category: 'Vegetation', description: 'Triangular Vegetation Index' },
  
  // Water
  { id: 'ndwi', name: 'NDWI', category: 'Water', description: 'Normalized Difference Water Index' },
  { id: 'mndwi', name: 'MNDWI', category: 'Water', description: 'Modified Normalized Difference Water Index' },
  { id: 'aweinsh', name: 'AWEInsh', category: 'Water', description: 'Automated Water Extraction Index (no shadows)' },
  { id: 'aweish', name: 'AWEIsh', category: 'Water', description: 'Automated Water Extraction Index (shadows)' },
  { id: 'ndmi', name: 'NDMI', category: 'Water', description: 'Normalized Difference Moisture Index' },
  { id: 'lswi', name: 'LSWI', category: 'Water', description: 'Land Surface Water Index' },
  { id: 'wri', name: 'WRI', category: 'Water', description: 'Water Ratio Index' },
  
  // Burn
  { id: 'nbr', name: 'NBR', category: 'Burn', description: 'Normalized Burn Ratio' },
  { id: 'nbr2', name: 'NBR2', category: 'Burn', description: 'Normalized Burn Ratio 2' },
  { id: 'bai', name: 'BAI', category: 'Burn', description: 'Burn Area Index' },
  { id: 'mirbi', name: 'MIRBI', category: 'Burn', description: 'Mid-Infrared Burn Index' },
  { id: 'csi', name: 'CSI', category: 'Burn', description: 'Char Soil Index' },
  
  // Urban/Soil
  { id: 'ndbi', name: 'NDBI', category: 'Urban', description: 'Normalized Difference Built-Up Index' },
  { id: 'ui', name: 'UI', category: 'Urban', description: 'Urban Index' },
  { id: 'bsi', name: 'BSI', category: 'Urban', description: 'Bare Soil Index' },
  { id: 'ndsi', name: 'NDSI', category: 'Urban', description: 'Normalized Difference Snow Index' },
  { id: 'clay', name: 'CLAY', category: 'Urban', description: 'Clay Minerals Ratio' },
  { id: 'fe', name: 'FE', category: 'Urban', description: 'Ferrous Minerals Ratio' },
  
  // Geological
  { id: 'alui', name: 'ALUI', category: 'Geological', description: 'Alunite Index' },
  { id: 'cali', name: 'CALI', category: 'Geological', description: 'Calcite Index' },
  { id: 'doli', name: 'DOLI', category: 'Geological', description: 'Dolomite Index' },
  { id: 'cai', name: 'CAI', category: 'Geological', description: 'Cellulose Absorption Index' },
  
  // Heat
  { id: 'lst', name: 'LST', category: 'Heat', description: 'Land Surface Temperature' },
  { id: 'uhi', name: 'UHI', category: 'Heat', description: 'Urban Heat Island Effect' },

  // Climate
  { id: 'pdsi', name: 'PDSI', category: 'Climate', description: 'Palmer Drought Severity Index' },
  { id: 'spei', name: 'SPEI', category: 'Climate', description: 'Standardized Precipitation-Evapotranspiration Index' },
  { id: 'rainfall', name: 'Rainfall', category: 'Climate', description: 'Total Monthly Precipitation' },
  { id: 'temperature', name: 'Temperature', category: 'Climate', description: 'Average Surface Temperature' },
];

export interface RegionAnalysis {
  coordinates: Coordinates;
  locationName: string;
  summary: string;
  data: MonthlyDataPoint[];
  geeScript: string;
  tiffDownloadUrl?: string | null;
  landCover: {
    name:string;
    percentage: number;
    color: string;
  }[];
  visualization?: {
    [key: string]: any; 
  };
  regionGeometry?: any; 
  isCustom?: boolean;
}

export enum AnalysisStatus {
  IDLE = 'IDLE',
  LOADING = 'LOADING',
  SUCCESS = 'SUCCESS',
  ERROR = 'ERROR'
}