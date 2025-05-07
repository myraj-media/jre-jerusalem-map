'use client'; // Add this directive for Next.js App Router

import React, { useRef, useEffect, useState, useCallback } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import * as turf from '@turf/turf';

// Replace with your Mapbox access token
// Note: This token must have access to Mapbox Boundaries
mapboxgl.accessToken = 'pk.eyJ1IjoiYmFydWNoLWsiLCJhIjoiY204eDVmODF5MDBtZjJpcjE1aXpubmtyMCJ9.5n6AxhYPu5fODL1qlSKovQ';

// Function to generate a unique color from a string (neighborhood ID)
const stringToColor = (str) => {
  // Simple hash function
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  
  // Convert to hexadecimal and ensure good contrast
  let color = '#';
  for (let i = 0; i < 3; i++) {
    let value = (hash >> (i * 8)) & 0xFF;
    // Ensure colors are vibrant but not too light (adjust range)
    value = Math.max(50, Math.min(220, value));
    color += ('00' + value.toString(16)).substr(-2);
  }
  return color;
};

const MapComponent = () => {
  const mapContainer = useRef(null);
  const map = useRef(null);
  const [isMounted, setIsMounted] = useState(false);
  const [hoveredNeighborhoodId, setHoveredNeighborhoodId] = useState(null);
  const [isHovering, setIsHovering] = useState(false);
  const [allowedNeighborhoods, setAllowedNeighborhoods] = useState([]);
  const colorMap = useRef(new Map()); // Store colors for each neighborhood
  const markersRef = useRef({ germanColony: null });
  
  // Jerusalem coordinates
  const center = [35.2137, 31.7683]; // Jerusalem, Israel
  
  // Define bounds for Jerusalem area
  const jerusalemBounds = [
    [35.1, 31.7], // Southwest coordinates
    [35.3, 31.85]  // Northeast coordinates
  ];
  
  // Define panning limits (slightly wider than initial view)
  const maxBounds = [
    [35.0, 31.65], // Southwest coordinates
    [35.4, 31.9]  // Northeast coordinates
  ];

  // Helper function to calculate centroid of a polygon for placing labels
  const calculateCentroid = useCallback((geometry) => {
    if (!geometry || !geometry.coordinates) {
      throw new Error('Invalid geometry');
    }
    
    // For MultiPolygon, use the first polygon
    let coordinates;
    if (geometry.type === 'MultiPolygon') {
      coordinates = geometry.coordinates[0][0]; // First polygon, first ring
    } else if (geometry.type === 'Polygon') {
      coordinates = geometry.coordinates[0]; // First ring
    } else {
      throw new Error(`Unsupported geometry type: ${geometry.type}`);
    }
    
    // Calculate centroid using turf.js
    const polygon = turf.polygon([coordinates]);
    const centroid = turf.centroid(polygon);
    return centroid.geometry.coordinates;
  }, []);

  // Process the GeoJSON data to extract neighborhood points and create boundaries
  const processNeighborhoods = useCallback((geojson) => {
    const neighborhoodPoints = [];
    const neighborhoodBoundaries = [];
    let germanColonyData = null; // Store German Colony data for special marker
    
    // Create a Set for faster lookups
    const allowedNeighborhoodsSet = new Set(allowedNeighborhoods.map(name => name.toLowerCase()));
    
    // Extract neighborhood data from the GeoJSON structure
    if (geojson.data && geojson.data.searchDataLayers && geojson.data.searchDataLayers.poi) {
      geojson.data.searchDataLayers.poi.forEach((item) => {
        if (item.areaType === 'neighbourhood') {
          // Only process neighborhoods in the allowed list
          const name = item.name;
          if (!allowedNeighborhoodsSet.has(name.toLowerCase())) {
            return; // Skip this neighborhood as it's not in the allowed list
          }
          
          const id = item.id || `neighborhood-${neighborhoodBoundaries.length}`;
          // Get the link if available
          const link = item.link || '';
          const link2 = item.link2 || '';
          
          // Extract the geometry
          if (item.geometry && item.geometry.geometry) {
            // Create boundary feature
            const boundaryFeature = {
              type: 'Feature',
              id: id,
              properties: {
                id: id,
                name: name,
                'name:en': name,
                link: link,
                link2: link2,
                color: stringToColor(id) // Assign unique color based on ID
              },
              geometry: item.geometry.geometry
            };
            neighborhoodBoundaries.push(boundaryFeature);
            
            // Store German Colony data for special marker
            if (name === 'German Colony' && link2) {
              germanColonyData = {
                id,
                name,
                link2,
                geometry: item.geometry.geometry
              };
            }
            
            // Create point feature for labels (calculate centroid from boundary)
            try {
              const centroid = calculateCentroid(item.geometry.geometry);
              const pointFeature = {
                type: 'Feature',
                id: id,
                properties: {
                  id: id,
                  name: name,
                  'name:en': name,
                  link: link,
                  link2: link2
                },
                geometry: {
                  type: 'Point',
                  coordinates: centroid
                }
              };
              neighborhoodPoints.push(pointFeature);
            } catch (error) {
              console.error('Error calculating centroid:', error);
            }
          }
        }
      });
    }
    
    console.log(`Processed ${neighborhoodPoints.length} neighborhood points and ${neighborhoodBoundaries.length} boundaries`);
    
    return {
      points: neighborhoodPoints,
      boundaries: neighborhoodBoundaries,
      germanColonyData // Pass German Colony data for special marker
    };
  }, [allowedNeighborhoods, calculateCentroid]);

  // Use a single effect for component initialization
  useEffect(() => {
    setIsMounted(true);
    
    // Load the neighborhood names from the JSON file
    fetch('/neighborhood-names.json')
      .then(response => {
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        return response.json();
      })
      .then(data => {
        setAllowedNeighborhoods(data);
        console.log('Neighborhood names loaded successfully.');
      })
      .catch(error => {
        console.error('Error loading neighborhood names:', error);
        // Fallback to default neighborhoods if fetch fails
        setAllowedNeighborhoods([
          'Abu Tor', 'Arnona', 'Baka', 'Bayit Vagan', 'Bet Hakerem', 
          'Ein Kerem', 'French Hill', 'German Colony', 'Geula', 'Gilo'
        ]);
      });
    
    // Cleanup function
    return () => {
      // Clean up the German Colony marker
      if (markersRef.current.germanColony) {
        markersRef.current.germanColony.remove();
      }
      
      // Remove map
      if (map.current) map.current.remove();
    };
  }, []);

  // Initialize map when component is mounted and neighborhoods are loaded
  useEffect(() => {
    if (!isMounted || allowedNeighborhoods.length === 0 || map.current) return;
    
    console.log('Initializing map...');
    
    // Initialize map with cleaner configuration
    map.current = new mapboxgl.Map({
      container: mapContainer.current,
      style: 'mapbox://styles/mapbox/standard',
      center: center,
      zoom: 12, // Default zoom level
      attributionControl: false,
      maxZoom: 18, // Set reasonable max zoom
      minZoom: 9,  // Set reasonable min zoom
      maxBounds: maxBounds, // Use maxBounds for panning limits
      dragRotate: false, // Disable rotation for simpler navigation
    });

    // Add navigation control
    map.current.addControl(new mapboxgl.NavigationControl({
      showCompass: false,
      showZoom: true
    }), 'top-right');

    map.current.on('load', () => {
      console.log('Map loaded. Setting up neighborhood data...');
      
      // Fit to Jerusalem bounds
      map.current.fitBounds(jerusalemBounds, {
        padding: 50,
        duration: 0 // No animation on initial load
      });
      
      // Hide all base map labels
      const layers = map.current.getStyle().layers;
      for (const layer of layers) {
        if (layer.type === 'symbol') {
          map.current.setLayoutProperty(layer.id, 'visibility', 'none');
        }
      }
      console.log('Base map labels hidden.');

      // Load the English GeoJSON file
      fetch('/jerusalem_hoods_english.geojson')
        .then(response => {
          if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
          }
          return response.json();
        })
        .then(geoJsonData => {
          console.log('English neighborhood data loaded successfully.');
          
          // Process the data
          const neighborhoods = processNeighborhoods(geoJsonData);
          
          // Add sources and layers
          addMapSourcesAndLayers(neighborhoods);
        })
        .catch(error => {
          console.error('Error loading neighborhood data:', error);
        });
    });

    // Handle map errors
    map.current.on('error', (e) => {
      console.error('Mapbox GL Error:', e.error);
    });

  }, [isMounted, allowedNeighborhoods, processNeighborhoods]); 

  // Update the map paint properties when the hovered neighborhood changes
  useEffect(() => {
    if (!map.current || !map.current.isStyleLoaded()) return;
    
    // Only update if the map and layers are ready
    if (map.current.getLayer('neighborhood-boundaries') && map.current.getLayer('neighborhood-boundaries-outline')) {
      // Update the fill properties
      map.current.setPaintProperty('neighborhood-boundaries', 'fill-color', [
        'case',
        ['boolean', ['==', ['get', 'id'], ['literal', hoveredNeighborhoodId || '']], false],
        ['get', 'color'], // Use the neighborhood's unique color when hovered
        'rgba(255, 255, 255, 0.1)' // Nearly transparent when not hovered
      ]);
      
      map.current.setPaintProperty('neighborhood-boundaries', 'fill-opacity', [
        'case',
        ['boolean', ['==', ['get', 'id'], ['literal', hoveredNeighborhoodId || '']], false],
        0.7, // Higher opacity when hovered
        0.1  // Very low opacity when not hovered
      ]);
      
      // Update outline properties - but maintain visibility
      map.current.setPaintProperty('neighborhood-boundaries-outline', 'line-width', [
        'case',
        ['boolean', ['==', ['get', 'id'], ['literal', hoveredNeighborhoodId || '']], false],
        3, // Thicker line when hovered
        1.5 // Changed from 2.5px to 1.5px as requested
      ]);
      
      map.current.setPaintProperty('neighborhood-boundaries-outline', 'line-color', [
        'case',
        ['boolean', ['==', ['get', 'id'], ['literal', hoveredNeighborhoodId || '']], false],
        ['get', 'border-color'], // Matching border when hovered
        '#000000' // Always black for non-hovered neighborhoods
      ]);
    }
  }, [hoveredNeighborhoodId]);

  // Add map sources and layers - extracted for clarity
  const addMapSourcesAndLayers = (neighborhoods) => {
    // Assign unique colors to each neighborhood
    neighborhoods.boundaries.forEach(feature => {
      const id = feature.properties.id;
      const baseColor = stringToColor(id);
      feature.properties.color = baseColor;
      
      // Create a slightly darker color for the border
      const r = parseInt(baseColor.slice(1, 3), 16);
      const g = parseInt(baseColor.slice(3, 5), 16);
      const b = parseInt(baseColor.slice(5, 7), 16);
      const darkerColor = `#${Math.max(0, r-30).toString(16).padStart(2, '0')}${Math.max(0, g-30).toString(16).padStart(2, '0')}${Math.max(0, b-30).toString(16).padStart(2, '0')}`;
      feature.properties['border-color'] = darkerColor;
      
      // Store color in the map for reference
      colorMap.current.set(id, baseColor);
    });
          
    // Add source for neighborhood data (points for labels)
    map.current.addSource('neighborhoods-points', {
      type: 'geojson',
      data: {
        type: 'FeatureCollection',
        features: neighborhoods.points
      },
      generateId: true // Generate feature IDs for better performance
    });
          
    // Add source for neighborhood boundaries
    map.current.addSource('neighborhoods-boundaries', {
      type: 'geojson',
      data: {
        type: 'FeatureCollection',
        features: neighborhoods.boundaries
      },
      generateId: true // Generate feature IDs for better performance
    });

    // Add source for collective neighborhood boundaries
    map.current.addSource('neighborhoods-collective-boundaries', {
      type: 'geojson',
      data: {
        type: 'FeatureCollection',
        features: [turf.combine(turf.featureCollection(neighborhoods.boundaries))]
      }
    });

    // Add collective neighborhood boundary outline layer
    map.current.addLayer({
      id: 'neighborhood-collective-outline',
      type: 'line',
      source: 'neighborhoods-collective-boundaries',
      paint: {
        'line-color': '#000000',
        'line-width': 2,
        'line-opacity': 0.7
      }
    });

    // Add neighborhood label layer
    map.current.addLayer({
      id: 'neighborhood-labels',
      type: 'symbol',
      source: 'neighborhoods-points',
      minzoom: 11,
      layout: {
        'text-field': ['get', 'name:en'],
        'text-font': ['Open Sans Semibold', 'Arial Unicode MS Bold'],
        'text-size': 14,
        'text-anchor': 'center',
        'text-justify': 'center',
        'text-allow-overlap': false,
        'text-ignore-placement': false,
        'text-padding': 5,
        'text-max-width': 8 // Limit text width for better performance
      },
      paint: {
        'text-color': '#333',
        'text-halo-color': 'rgba(255, 255, 255, 0.9)',
        'text-halo-width': 2
      }
    });
          
    // Add neighborhood boundary layer with unique colors
    map.current.addLayer({
      id: 'neighborhood-boundaries',
      type: 'fill',
      source: 'neighborhoods-boundaries',
      paint: {
        'fill-color': [
          'case',
          ['boolean', ['==', ['get', 'id'], ['literal', '']], false],
          ['get', 'color'], // Use unique color when hovered
          'rgba(255, 255, 255, 0.1)' // Nearly transparent when not hovered
        ],
        'fill-opacity': [
          'case',
          ['boolean', ['==', ['get', 'id'], ['literal', '']], false],
          0.7, // Higher opacity when hovered
          0.1  // Very low opacity when not hovered
        ],
        'fill-color-transition': {
          duration: 300,
          delay: 0
        },
        'fill-opacity-transition': {
          duration: 300,
          delay: 0
        }
      }
    });
          
    // Add neighborhood boundary outline layer (individual outlines)
    map.current.addLayer({
      id: 'neighborhood-boundaries-outline',
      type: 'line',
      source: 'neighborhoods-boundaries',
      paint: {
        'line-color': [
          'case',
          ['boolean', ['==', ['get', 'id'], ['literal', hoveredNeighborhoodId || '']], false],
          ['get', 'border-color'], // Use darker border of unique color when hovered
          '#000000' // Solid black outline when not hovered
        ],
        'line-width': [
          'case',
          ['boolean', ['==', ['get', 'id'], ['literal', hoveredNeighborhoodId || '']], false],
          3, // Thicker line when hovered
          1.5 // Changed from 2.5px to 1.5px as requested
        ],
        'line-opacity': 1, // Always fully opaque
        'line-color-transition': {
          duration: 300,
          delay: 0
        },
        'line-width-transition': {
          duration: 200,
          delay: 0
        }
      }
    });

    // Add hover and click event handlers
    const handleHover = (e) => {
      if (e.features.length > 0) {
        map.current.getCanvas().style.cursor = 'pointer';
        const feature = e.features[0];
        const id = feature.properties.id;
        setHoveredNeighborhoodId(id);
        setIsHovering(true);
      }
    };
    
    const handleMouseLeave = () => {
      map.current.getCanvas().style.cursor = '';
      setHoveredNeighborhoodId(null);
      setIsHovering(false);
    };

    // Add hover handlers to both layers
    map.current.on('mouseenter', 'neighborhood-boundaries', handleHover);
    map.current.on('mouseleave', 'neighborhood-boundaries', handleMouseLeave);
    map.current.on('mouseenter', 'neighborhood-labels', handleHover);
    map.current.on('mouseleave', 'neighborhood-labels', handleMouseLeave);
    
    // Handle click to open link directly
    const handleNeighborhoodClick = (e) => {
      if (e.features.length > 0) {
        const feature = e.features[0];
        const id = feature.properties.id;
        const link = feature.properties.link;
        
        // Apply the hover effect when clicked
        setHoveredNeighborhoodId(id);
        setIsHovering(true);
        
        // If link exists, open it in a new tab
        if (link && link.trim() !== '') {
          window.open(link, '_blank', 'noopener,noreferrer');
        }
      }
    };
    
    // Add click handlers for both boundaries and labels
    map.current.on('click', 'neighborhood-labels', handleNeighborhoodClick);
    map.current.on('click', 'neighborhood-boundaries', handleNeighborhoodClick);
  };

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <div 
        ref={mapContainer} 
        style={{ position: 'absolute', top: 0, bottom: 0, width: '100%' }} 
      />
      
      {/* Attribution tab in bottom right corner */}
      <div className="attribution-tab">
        <span>Powered By: </span>
        <a 
          href="https://quantumxsolutions.io" 
          target="_blank" 
          rel="noopener noreferrer"
        >
          Quantum X Solutions
        </a>
        <style jsx>{`
          .attribution-tab {
            position: fixed;
            bottom: 5px;
            right: 5px;
            background-color: rgba(255, 255, 255, 0.7);
            padding: 3px 6px;
            border-radius: 3px;
            font-size: 9px;
            box-shadow: 0 1px 2px rgba(0, 0, 0, 0.1);
            z-index: 900;
            font-family: 'Arial', sans-serif;
            font-weight: 500;
            color: #333;
            max-width: 100%;
            display: flex;
            align-items: center;
            flex-wrap: nowrap;
          }
          
          .attribution-tab span {
            white-space: nowrap;
          }
          
          .attribution-tab a {
            color: #4e6eab;
            text-decoration: none;
            margin-left: 1px;
            white-space: nowrap;
            font-weight: bold;
          }
          
          .attribution-tab a:hover {
            text-decoration: underline;
          }
        `}</style>
      </div>
    </div>
  );
};

export default React.memo(MapComponent);