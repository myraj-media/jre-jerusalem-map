/**
 * GeoJSON data processing utilities with optimization for better performance
 */

// Cache processed data to avoid repeated calculations
const processedDataCache = new Map();

/**
 * Calculate centroid of a polygon with caching
 * @param {Array} coordinates - Coordinates of the polygon
 * @returns {Array} - Centroid coordinates [lng, lat]
 */
export const calculateCentroid = (coordinates) => {
  // For simple polygons (single ring)
  const coords = coordinates[0];
  
  // Simple caching based on first and last coordinate (as a hash)
  const cacheKey = `${coords[0][0]},${coords[0][1]}_${coords[coords.length-1][0]},${coords[coords.length-1][1]}`;
  
  if (processedDataCache.has(cacheKey)) {
    return processedDataCache.get(cacheKey);
  }
  
  // Calculate centroid
  let x = 0;
  let y = 0;
  for (const point of coords) {
    x += point[0];
    y += point[1];
  }
  
  const centroid = [x / coords.length, y / coords.length];
  processedDataCache.set(cacheKey, centroid);
  
  return centroid;
};

/**
 * Simplify GeoJSON to reduce size and processing needs
 * @param {Object} geoJson - Original GeoJSON data
 * @returns {Object} - Simplified GeoJSON
 */
export const simplifyGeoJson = (geoJson) => {
  if (!geoJson || !geoJson.features) return geoJson;
  
  // If this exact GeoJSON has been processed before, return cached result
  const dataHash = JSON.stringify(geoJson).slice(0, 100); // Use first 100 chars as a cache key
  if (processedDataCache.has(dataHash)) {
    return processedDataCache.get(dataHash);
  }
  
  // Create simplified version by removing unnecessary properties and simplifying geometries
  const simplified = {
    type: geoJson.type,
    features: geoJson.features.map(feature => {
      // Keep only essential properties
      const essentialProps = {};
      if (feature.properties) {
        // Keep only id, name, and other critical properties
        ['id', 'name', 'title', 'neighborhood', 'areaType'].forEach(key => {
          if (feature.properties[key] !== undefined) {
            essentialProps[key] = feature.properties[key];
          }
        });
        
        // Add a population or priority field if available
        if (feature.properties.population) {
          essentialProps.population = feature.properties.population;
        }
      }
      
      return {
        type: feature.type,
        geometry: feature.geometry,
        properties: essentialProps
      };
    })
  };
  
  processedDataCache.set(dataHash, simplified);
  return simplified;
};

/**
 * Process GeoJSON for fast rendering
 * @param {Object} geoJson - GeoJSON data
 * @returns {Object} - Processed GeoJSON optimized for rendering
 */
export const processForRendering = (geoJson) => {
  if (!geoJson) return null;
  
  // Debug
  console.log('Processing GeoJSON with structure:', 
    geoJson.features && geoJson.features.length > 0 
      ? `First feature has properties: ${Object.keys(geoJson.features[0].properties || {}).join(', ')}` 
      : 'No features found');
  
  // Simplify first
  const simplified = simplifyGeoJson(geoJson);
  
  // Add pre-computed centroids to speed up label placement
  simplified.features.forEach((feature, index) => {
    if (feature.geometry.type === 'Polygon' || feature.geometry.type === 'MultiPolygon') {
      // For MultiPolygon, use the first polygon's centroid
      let coordinates = feature.geometry.coordinates;
      if (feature.geometry.type === 'MultiPolygon') {
        coordinates = coordinates[0]; // Use first polygon
      }
      feature.properties.centroid = calculateCentroid(coordinates);
      
      // Ensure name property is present
      if (!feature.properties.name && feature.properties.areaType) {
        feature.properties.name = feature.properties.areaType + ' ' + 
          (feature.properties.id || '').slice(0, 8);
      }
      
      // Calculate area as a rough priority indicator (larger areas = more important)
      try {
        let area = 0;
        if (feature.geometry.type === 'Polygon') {
          const polygonGeoJSON = { type: 'Feature', geometry: { type: 'Polygon', coordinates: feature.geometry.coordinates } };
          area = Math.abs(calculatePolygonArea(feature.geometry.coordinates[0]));
        } else if (feature.geometry.type === 'MultiPolygon') {
          // Sum areas of all polygons
          area = feature.geometry.coordinates.reduce((sum, polygonCoords) => {
            return sum + Math.abs(calculatePolygonArea(polygonCoords[0]));
          }, 0);
        }
        
        // Assign importance level based on area
        // Larger areas typically represent more significant neighborhoods
        feature.properties.importance = area > 0.0001 ? 1 :  // Major areas
                                       area > 0.00005 ? 2 :  // Mid-size areas
                                       area > 0.00001 ? 3 :  // Small areas
                                       4;                    // Tiny areas
      } catch (e) {
        // Default importance if calculation fails
        feature.properties.importance = 4;
      }
    }
  });
  
  return simplified;
};

/**
 * Calculate polygon area using the Shoelace formula
 * @param {Array} coordinates - Array of [lng, lat] coordinates
 * @returns {number} - Area of the polygon
 */
function calculatePolygonArea(coordinates) {
  let area = 0;
  const n = coordinates.length;
  
  for (let i = 0; i < n - 1; i++) {
    area += coordinates[i][0] * coordinates[i + 1][1] - coordinates[i + 1][0] * coordinates[i][1];
  }
  
  // Add the last-to-first connection
  area += coordinates[n - 1][0] * coordinates[0][1] - coordinates[0][0] * coordinates[n - 1][1];
  
  // Return the absolute area divided by 2
  return area / 2;
}

/**
 * Worker-friendly function to process GeoJSON in a separate thread
 * @param {Object} geoJson - GeoJSON data
 * @returns {Promise} - Promise resolving to processed GeoJSON
 */
export const processGeoJsonAsync = async (geoJson) => {
  // If web workers are supported and the data is large, could be processed in a worker
  if (geoJson && geoJson.features && geoJson.features.length > 100) {
    // Simulate async processing (in real app, use actual web worker)
    return new Promise(resolve => {
      setTimeout(() => {
        resolve(processForRendering(geoJson));
      }, 0);
    });
  }
  
  // For smaller datasets, process synchronously
  return processForRendering(geoJson);
}; 