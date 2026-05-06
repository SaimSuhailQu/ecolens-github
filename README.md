<div align="center">
  <img src="public/logo.png" width="150" alt="EcoLens Logo" />
  <h1>EcoLens WebGIS</h1>
  <p>
    <a href="https://saimsuhailqu.github.io/ecolens-github/" target="_blank">
      <img src="https://img.shields.io/badge/Live%20Demo-Available-brightgreen?style=for-the-badge&logo=github" alt="Live Demo" />
    </a>
    <img src="https://img.shields.io/badge/Version-v1.3.0-blue?style=for-the-badge" alt="Version 1.3.0" />
    <img src="https://img.shields.io/badge/Google%20Earth%20Engine-Powered-orange?style=for-the-badge" alt="GEE Powered" />
  </p>
</div>

EcoLens WebGIS is an advanced, cloud-powered geospatial workstation designed for real-time regional environmental monitoring, climate analysis, and drought assessment. Built as a Final Year Project (FYP), it leverages the massive computational power of Google Earth Engine directly in the browser to make satellite data analysis accessible, fast, and interactive.

## 🌐 Live Demo
Access the live application here: **[EcoLens WebGIS Live](https://saimsuhailqu.github.io/ecolens-github/)**

## 🌟 Key Features (v1.3.0)

* **Premium Workstation UI:** A high-end, glassmorphic interface with mesh-gradient backgrounds and smooth micro-animations for a professional research experience.
* **Cloud-Powered Computation:** Direct integration with the Google Earth Engine (GEE) API to process petabytes of public satellite imagery (Copernicus Sentinel-2, Landsat 8, ERA5 Climate Data) in real-time.
* **Analytical Accuracy:**
  * **Intelligent Cloud Masking:** Automated bitwise masking for Landsat 8 and Sentinel-2 to ensure "clean" atmospheric data.
  * **Seasonal UHI Correction:** Sophisticated Urban Heat Island calculation using monthly rural baselines for seasonal accuracy.
* **Flexible Spatial Controls:** 
  * Analyze by right-clicking on the map to auto-detect administrative regions.
  * Draw custom polygons or import spatial files (KML, GeoJSON, Zipped Shapefiles).
  * Clear state management for a seamless "selection-to-analysis" workflow.
* **Advanced Data Export:**
  * **Individual Index ZIPs:** Export multi-band analyses as a ZIP archive containing separate, individual GeoTIFFs for each index.
  * **Dynamic GEE Scripts:** Generates runnable Earth Engine JavaScript snippets for every analysis category to facilitate further research in the GEE Code Editor.
* **Comprehensive Metrics:** NDVI, NDWI, Land Surface Temperature (LST), PDSI Drought indices, and full Land Use (LULC) classification.

## 🚀 Tech Stack
* **Frontend Framework:** React (Vite)
* **Styling:** Tailwind CSS & Custom Glassmorphism System
* **Mapping:** Leaflet & React-Leaflet
* **Geospatial Engine:** Google Earth Engine JavaScript API
* **Data Visualization:** Recharts
* **Bundling:** JSZip for browser-side data packaging

## 🛠️ Run Locally

**Prerequisites:** Node.js (v18+)

1. Clone the repository and install dependencies:
   ```bash
   npm install
   ```
2. Set up your environment variables. Create a `.env.local` file in the root directory:
   ```env
   VITE_GEE_OAUTH_CLIENT_ID=your_google_oauth_client_id_here
   VITE_GEE_PROJECT_ID=your_google_cloud_project_id_here
   ```
3. Run the development server:
   ```bash
   npm run dev
   ```

## 🔐 Authentication & Scopes
This application uses client-side Google OAuth to authenticate with Earth Engine. It strictly requests the `https://www.googleapis.com/auth/earthengine.readonly` scope. No user data or authentication tokens are stored on external servers. All processing is routed securely through the user's browser to Google's infrastructure.

## 👥 FYP Team & Collaborators
* **Saim Suhail Qureshi** (`saim.suhail.5@gmail.com`) - Lead Developer & Geospatial Architect
* **Muhammad Arsal** (`muhammadarsalattari@gmail.com`) - Co-Developer & Data Integration
