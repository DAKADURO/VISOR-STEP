import * as THREE from 'three';
import initOpenCascade from 'occt-import-js';

let occt = null;

// Inicializa el motor de WebAssembly
export async function initStepLoader() {
  if (occt) return true;
  
  try {
    // La librería espera encontrar el .wasm en el path indicado.
    // Usamos el archivo servido por Vite en public/
    occt = await initOpenCascade({
      locateFile: () => '/occt-import-js.wasm'
    });
    return true;
  } catch (error) {
    console.error("Error inicializando occt-import-js:", error);
    return false;
  }
}

// Procesa el buffer del archivo STEP y retorna un Object3D (Group)
export function parseStepFile(fileBuffer) {
  if (!occt) {
    throw new Error("El motor no está inicializado");
  }

  // Leer el archivo en la memoria de WebAssembly
  const fileName = 'model.step';
  occt.FS.createDataFile('/', fileName, new Uint8Array(fileBuffer), true, true);
  
  // Procesar y obtener los datos
  // ReadStepFile devuelve el resultado del parseo.
  const result = occt.ReadStepFile(fileName, null);
  
  // Limpiamos el archivo de la memoria WASM
  occt.FS.unlink('/' + fileName);

  if (!result || !result.success) {
    throw new Error("No se pudo leer el archivo STEP.");
  }

  const group = new THREE.Group();

  // Crear material base para el modelo
  const defaultMaterial = new THREE.MeshPhysicalMaterial({
    color: 0xcccccc,
    metalness: 0.3,
    roughness: 0.4,
    clearcoat: 0.1,
    side: THREE.DoubleSide
  });

  // Material para los bordes
  const lineMaterial = new THREE.LineBasicMaterial({
    color: 0x111111,
    linewidth: 1
  });

  // Iterar sobre los nodos/mallas que devolvió OpenCASCADE
  for (let i = 0; i < result.meshes.length; i++) {
    const meshData = result.meshes[i];
    
    // Crear geometría de Three.js
    const geometry = new THREE.BufferGeometry();
    
    // Atributos de posición
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(meshData.attributes.position.array, 3));
    
    // Atributos de normales
    if (meshData.attributes.normal) {
      geometry.setAttribute('normal', new THREE.Float32BufferAttribute(meshData.attributes.normal.array, 3));
    } else {
      geometry.computeVertexNormals();
    }

    // Atributo de índices (caras)
    geometry.setIndex(new THREE.Uint32BufferAttribute(meshData.index.array, 1));
    
    // Si el STEP trae color, lo aplicamos, de lo contrario usamos el default
    let material = defaultMaterial;
    if (meshData.color) {
      material = defaultMaterial.clone();
      material.color.setRGB(meshData.color[0], meshData.color[1], meshData.color[2]);
    }
    
    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;

    // Agregar bordes (edges) si vienen en el resultado
    if (meshData.brep_edges && meshData.brep_edges.length > 0) {
      meshData.brep_edges.forEach(edge => {
        // En occt-import-js a veces los bordes vienen como arrays de puntos
        if(edge.array) {
           const edgeGeo = new THREE.BufferGeometry();
           edgeGeo.setAttribute('position', new THREE.Float32BufferAttribute(edge.array, 3));
           const line = new THREE.Line(edgeGeo, lineMaterial);
           line.visible = false; // Ocultos por defecto
           line.userData.isEdge = true; // Para poder identificarlos luego
           mesh.add(line);
        }
      });
    } else {
      // Fallback: Si no hay bordes precisos, generamos bordes a partir de la malla
      const edgesGeometry = new THREE.EdgesGeometry(geometry, 15); // ángulo umbral
      const edges = new THREE.LineSegments(edgesGeometry, lineMaterial);
      edges.visible = false;
      edges.userData.isEdge = true;
      mesh.add(edges);
    }

    group.add(mesh);
  }

  return group;
}
