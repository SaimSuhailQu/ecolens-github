# EcoLens WebGIS - Comprehensive Technical Report

![Project Header / Logo Holder](placeholder_logo.png)
*Figure 1: EcoLens WebGIS Logo and Branding*

## 1. Introduction
EcoLens WebGIS is a high-performance, browser-based geospatial analysis platform designed to democratize access to satellite imagery and environmental data. Powered by the Google Earth Engine (GEE) JavaScript API, it enables researchers, planners, and policymakers to conduct extensive regional analysis without requiring heavy desktop GIS software. The application calculates over 35 distinct spectral indices, maps land use, and generates temporal environmental datasets on the fly.

## 2. System Architecture

![System Architecture Diagram Holder](placeholder_architecture.png)
*Figure 2: High-Level System Architecture*

The application employs a serverless architecture to reduce maintenance overhead and maximize scalability.

*   **Frontend Application:** Developed using React, TypeScript, and Vite. The user interface leverages TailwindCSS to produce a modern, premium "glassmorphic" aesthetic that ensures both usability and visual excellence.
*   **Geospatial Engine:** Google Earth Engine (GEE) handles all heavy spatial computations, image reduction, and map tile rendering. This delegates massive parallel processing tasks to Google Cloud.
*   **Authentication & Quota Management:** Integration with Google OAuth 2.0. By requiring users to log in with their Google accounts, the application safely delegates GEE API usage quotas to the individual user's active Google Cloud Project (via `earthengine-legacy`), effectively eliminating the bottleneck of a single service account.
*   **Map Visualization:** Leaflet (via React-Leaflet) is used to overlay GEE-generated raster tiles and vector geometries over a standard base map.

## 3. Core Features

### 3.1. Regional and Custom Analysis
The platform is designed with a highly flexible spatial querying system that supports granular administrative boundaries globally.
*   **Administrative Levels (0 to 3):** The application relies on the FAO GAUL dataset for primary global coverage (Levels 0-2) and integrates specialized regional datasets for Level 3 (e.g., Tehsils in South Asia). By maintaining a cascading fallback mechanism, the system seamlessly queries boundaries down to the district and sub-district levels. If a specific Level 3 boundary is missing in the primary dataset, it dynamically checks multiple alternative assets, ensuring continuous data availability.
*   **Custom Polygons:** Beyond predefined administrative boundaries, researchers can use Leaflet's draw tools to sketch arbitrary polygons directly on the map. The application captures the GeoJSON output, cleans the topology (removing redundant vertices), and passes it to GEE. This is crucial for analyzing hyper-local phenomena like a specific farm, a wildlife reserve, or a localized flood zone.
*   **Dynamic Geometry Simplification:** To prevent GEE payload limits (`400 Bad Request` on excessively complex polygons), the system calculates the geometric area before submission. For massive regions (e.g., entire provinces exceeding 50,000 km²), it applies a dynamic `simplify()` algorithm to reduce vertex count without losing spatial integrity, guaranteeing successful data retrieval.

![Regional Selection UI Holder](placeholder_region_select.png)
*Figure 3: Administrative Level and Region Selection Interface*

### 3.2. Land Use and Land Cover (LULC) Mapping
Understanding the spatial distribution of land cover is vital for environmental planning. EcoLens leverages Google's `DYNAMICWORLD/V1`—a near real-time, 10m resolution global land cover dataset powered by Sentinel-2 imagery and deep learning models.
*   **Real-time Processing:** Instead of relying on static, outdated LULC maps, EcoLens queries the exact date range specified by the user. It applies a temporal `mode()` reducer to determine the most statistically frequent land cover class for every individual pixel during that period.
*   **Class Distribution:** The backend runs a highly efficient `frequencyHistogram` reducer across the chosen geometry, quantifying the absolute pixel count for 9 distinct classes: Water, Trees, Grass, Flooded Vegetation, Crops, Shrub & Scrub, Built Area, Bare Ground, and Snow & Ice.
*   **Visual Integration:** The absolute counts are dynamically converted to percentages and rendered on the frontend using interactive Recharts components. This provides users with an instant, empirical snapshot of the region's ecological composition.

![LULC Distribution Chart Holder](placeholder_lulc.png)
*Figure 4: Dynamic LULC Distribution Chart*

### 3.3. Temporal Charting and Data Aggregation
To understand environmental trends over time, EcoLens performs heavy server-side temporal aggregations on the fly.
*   **Monthly Aggregation Pipelines:** When an analysis is triggered, the system slices the specified temporal window into 12 monthly intervals. For each month, it filters the respective image collections and computes the regional mean for all active variables.
*   **Multi-Dataset Synchronization:** The platform orchestrates data from fundamentally different satellite systems concurrently:
    *   *Optical/Thermal Indices:* Derived from Copernicus Sentinel-2 (10m) or Landsat 8/9 (30m).
    *   *Climate Data:* Monthly temperature and precipitation are aggregated from the ECMWF ERA5-Land dataset.
    *   *Drought Indices:* PDSI and SPEI are extracted from the TerraClimate dataset.
*   **Asynchronous Parallel Execution:** Because reducing 12 months of high-resolution data across a large province is computationally expensive, EcoLens uses asynchronous `Promise.all` structures and GEE's `ee.List.sequence` to execute spatial reductions concurrently on Google's cloud infrastructure, drastically reducing the total user wait time.

![Monthly Aggregation Chart Holder](placeholder_monthly_chart.png)
*Figure 5: Monthly Temporal Analysis Chart*

### 3.4. Dynamic Geospatial Export
Allowing researchers to export the processed raster data for offline use in software like QGIS or ArcGIS is a cornerstone feature of EcoLens.
*   **Bypassing GEE Export Limits:** The native GEE `getDownloadURL` API enforces strict limits on total request size (approx. 50MB) and pixel count. Naively exporting a 10m resolution map of an entire country would immediately result in a failed request.
*   **Adaptive Scaling Algorithm:** EcoLens circumvents this by calculating the total bounding area in square meters dynamically. It then implements a mathematical safeguard: determining the absolute minimum scale (meters per pixel) required to keep the total pixel count under 100,000. This ensures that even massive regions can be exported safely.
*   **Multi-band Composition:** When an export is requested, the system creates an empty composite image and iterates through all requested indices, appending each as a distinct band. The resulting GeoTIFF encapsulates multiple environmental metrics within a single, portable file.

![Data Export Modal Holder](placeholder_export.png)
*Figure 6: Data Export Configuration*

## 4. Geospatial Indices and Formulas

EcoLens supports over 35 distinct indices calculated dynamically based on user-selected sensor resolutions (Sentinel-2 at 10m or Landsat-8/9 at 30m). 

> **Notation Key:**
> *   `BLUE`: Blue Band
> *   `GREEN`: Green Band
> *   `RED`: Red Band
> *   `NIR`: Near-Infrared Band
> *   `RE1, RE2, RE3`: Red Edge Bands (Sentinel-2)
> *   `SWIR1`: Short-Wave Infrared 1
> *   `SWIR2`: Short-Wave Infrared 2
> *   `THERMAL`: Thermal Infrared Band (Landsat)

### 4.1. Vegetation Indices

Vegetation indices leverage the characteristic absorption of red light by chlorophyll and the strong reflectance of near-infrared (NIR) light by plant cellular structures to quantify vegetation health, biomass, and canopy coverage. Indices like NDVI provide a baseline for vegetation vigor, while advanced formulations such as EVI and MSAVI apply corrections for atmospheric noise and soil background reflectance, respectively.

![Vegetation Index Map Holder](placeholder_vegetation_map.png)
*Figure 7: Example of NDVI Visualization*

| Index | Name | Formula / Expression |
| :--- | :--- | :--- |
| **NDVI** | Normalized Difference Vegetation Index | `(NIR - RED) / (NIR + RED)` |
| **EVI** | Enhanced Vegetation Index | `2.5 * ((NIR - RED) / (NIR + 6 * RED - 7.5 * BLUE + 1))` |
| **SAVI** | Soil-Adjusted Vegetation Index | `((NIR - RED) / (NIR + RED + 0.5)) * 1.5` |
| **OSAVI**| Optimized SAVI | `(NIR - RED) / (NIR + RED + 0.16)` |
| **GNDVI**| Green NDVI | `(NIR - GREEN) / (NIR + GREEN)` |
| **MSAVI**| Modified SAVI | `(2 * NIR + 1 - sqrt((2 * NIR + 1)² - 8 * (NIR - RED))) / 2` |
| **GCVI** | Green Chlorophyll Vegetation Index | `(NIR / GREEN) - 1.0` |
| **REIP** | Red Edge Inflection Point | `700 + 40 * (((RED + RE3) / 2.0 - RE1) / (RE2 - RE1))` |
| **NDRE** | Normalized Difference Red Edge | `(NIR - RE1) / (NIR + RE1)` |
| **VARI** | Visible Atmospherically Resistant Index | `(GREEN - RED) / (GREEN + RED - BLUE)` |
| **TVI** | Triangular Vegetation Index | `0.5 * (120 * (NIR - GREEN) - 200 * (RED - GREEN))` |

### 4.2. Water Indices

Water indices utilize the strong absorption of near-infrared (NIR) and short-wave infrared (SWIR) bands by water bodies compared to surrounding land. These indices are crucial for delineating open water surfaces, monitoring droughts, mapping floods, and assessing moisture levels in both soil and vegetation.

![Water Index Map Holder](placeholder_water_map.png)
*Figure 8: Example of NDWI Visualization*

| Index | Name | Formula / Expression |
| :--- | :--- | :--- |
| **NDWI** | Normalized Difference Water Index | `(GREEN - NIR) / (GREEN + NIR)` |
| **MNDWI**| Modified NDWI | `(GREEN - SWIR1) / (GREEN + SWIR1)` |
| **AWEInsh**| Automated Water Ext. Index (No Shadow) | `4 * (GREEN - SWIR1) - (0.25 * NIR + 2.75 * SWIR2)` |
| **AWEIsh**| Automated Water Ext. Index (Shadow) | `BLUE + 2.5 * GREEN - 1.5 * (NIR + SWIR1) - 0.25 * SWIR2` |
| **NDMI** / **LSWI**| Normalized Difference Moisture Index | `(NIR - SWIR1) / (NIR + SWIR1)` |
| **WRI** | Water Ratio Index | `(GREEN + RED) / (NIR + SWIR1)` |

### 4.3. Burn and Fire Indices

Burn indices are designed to highlight areas affected by fire, commonly referred to as burn scars. By contrasting the near-infrared (NIR) band—which decreases post-fire due to vegetation loss—with the short-wave infrared (SWIR) band—which increases due to exposed soil and char—these indices effectively estimate burn severity and track post-fire ecological recovery.

![Burn Index Map Holder](placeholder_burn_map.png)
*Figure 9: Example of NBR Visualization*

| Index | Name | Formula / Expression |
| :--- | :--- | :--- |
| **NBR** | Normalized Burn Ratio | `(NIR - SWIR2) / (NIR + SWIR2)` |
| **NBR2** | Normalized Burn Ratio 2 | `(SWIR1 - SWIR2) / (SWIR1 + SWIR2)` |
| **BAI** | Burn Area Index | `1.0 / ((0.1 - RED)² + (0.06 - NIR)²)` |
| **MIRBI**| Mid-Infrared Burn Index | `10 * SWIR2 - 9.8 * SWIR1 + 2.0` |
| **CSI** | Char Soil Index | `NIR / SWIR2` |

### 4.4. Urban and Soil Indices

Urban and soil indices are used to map built-up areas, bare land, and specific soil compositions. NDBI and UI specifically target urban footprint expansion by analyzing differences in SWIR and NIR reflectance, helping to distinguish man-made structures from natural land covers. Other indices like BSI and CLAY are utilized for soil degradation and erosion studies.

![Urban Index Map Holder](placeholder_urban_map.png)
*Figure 10: Example of NDBI Visualization*

| Index | Name | Formula / Expression |
| :--- | :--- | :--- |
| **NDBI** | Normalized Difference Built-Up Index | `(SWIR1 - NIR) / (SWIR1 + NIR)` |
| **UI** | Urban Index | `(SWIR2 - NIR) / (SWIR2 + NIR)` |
| **BSI** | Bare Soil Index | `((SWIR1 + RED) - (NIR + BLUE)) / ((SWIR1 + RED) + (NIR + BLUE))` |
| **NDSI** | Normalized Difference Snow Index | `(GREEN - SWIR1) / (GREEN + SWIR1)` |
| **CLAY** | Clay Minerals Ratio | `SWIR1 / SWIR2` |
| **FE** | Ferrous Minerals Ratio | `SWIR1 / NIR` |

### 4.5. Geological Indices

Geological indices exploit specific absorption features in the short-wave infrared (SWIR) spectrum to identify various mineral compositions and rock types on the Earth's surface. These indices are invaluable for mineral exploration and geological mapping, helping to isolate and characterize features like Alunite, Calcite, and Dolomite.

![Geological Map Holder](placeholder_geology_map.png)
*Figure 11: Example of Geological Indices Visualization*

| Index | Name | Formula / Expression |
| :--- | :--- | :--- |
| **ALUI** | Alunite Index | `SWIR1 / SWIR2` |
| **CALI** | Calcite Index | `SWIR2 / SWIR1` |
| **DOLI** | Dolomite Index | `SWIR2 / SWIR1` |
| **CAI** | Cellulose Absorption Index | `(SWIR1 + SWIR2) / SWIR1` |

### 4.6. Heat Indices

Heat indices measure the thermal energy emitted from the Earth's surface using thermal infrared bands (such as Landsat's ST_B10). Land Surface Temperature (LST) provides absolute surface heat, whereas the Urban Heat Island (UHI) effect quantifies the temperature difference between urban centers and their surrounding rural baselines, serving as a critical metric for urban climate studies and planning.

![Heat Index Map Holder](placeholder_heat_map.png)
*Figure 12: Example of Land Surface Temperature (LST) Map*

| Index | Name | Formula / Expression |
| :--- | :--- | :--- |
| **LST** | Land Surface Temperature | `(Thermal Band * 0.00341802 + 149.0) - 273.15` (Celsius) |
| **UHI** | Urban Heat Island Effect | `LST - Mean(LST of Rural Areas within bounds)` |

> *Note: UHI calculations utilize the `GOOGLE/DYNAMICWORLD/V1` classification to actively mask out built-up and water areas, computing a localized rural baseline for the specific geography selected.*

### 4.7. Climate Indices

Climate indices integrate multiple environmental variables such as precipitation, evapotranspiration, and temperature to monitor long-term climatic trends and extreme weather events. Indices like PDSI and SPEI are standard meteorological tools for assessing drought severity, while monthly aggregated rainfall and temperature data provide essential context for understanding regional environmental shifts.

![Climate Data Chart Holder](placeholder_climate_chart.png)
*Figure 13: Precipitation and Drought Indices Trend Line*

| Index | Name | Source Dataset | Formula / Methodology |
| :--- | :--- | :--- | :--- |
| **PDSI** | Palmer Drought Severity Index | `IDAHO_EPSCOR/TERRACLIMATE` | Directly queried from the PDSI band |
| **SPEI** | Standardized Precipitation-Evapotranspiration Index | `IDAHO_EPSCOR/TERRACLIMATE` | `Precipitation (pr) - Potential Evapotranspiration (pet)` |
| **Rainfall**| Total Monthly Precipitation | `ECMWF/ERA5_LAND/MONTHLY_AGGR`| Summation of total precipitation |
| **Temperature**| Average Surface Temperature | `ECMWF/ERA5_LAND/MONTHLY_AGGR`| Mean of temperature at 2m (converted to Celsius) |

## 5. UI/UX and Compliance Implementation
![Authentication UI Holder](placeholder_auth_ui.png)
*Figure 14: Google OAuth Integration and Privacy Layout*

The application employs strict state management combined with highly responsive glassmorphism styles:
*   **Micro-animations:** Hover effects and transitioning panel states create a dynamic workstation interface.
*   **Compliance:** Built-in Privacy Policy (`/privacy`) and Terms of Service (`/terms`) components ensure the platform meets the stringent requirements for Google Cloud production deployment and OAuth consent screen verification.

## 6. Conclusion
EcoLens WebGIS establishes a robust, highly extensible environment for earth observation. Its client-centric, serverless paradigm offloads massive computing needs directly to Google Earth Engine, while ensuring high performance, accurate regional fallback logic, and a beautifully designed user experience.
