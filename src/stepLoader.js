import * as THREE from 'three';

let occt = null;

// Carga el script OCCT como tag <script> y espera a que exponga `window.occtimportjs`
function loadOcctScript() {
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = '/occt-import-js.js';
    script.onload = () => {
      // El archivo expone `var occtimportjs` en el scope global del script
      // Al cargarse como <script> clásico (no módulo), queda en window
      if (typeof window.occtimportjs === 'function') {
        resolve(window.occtimportjs);
      } else {
        reject(new Error('occtimportjs no encontrado en window después de cargar el script.'));
      }
    };
    script.onerror = () => reject(new Error('Falló la carga de /occt-import-js.js'));
    document.head.appendChild(script);
  });
}

export async function initStepLoader() {
  if (occt) return true;

  try {
    const initFn = await loadOcctScript();

    occt = await initFn({
      locateFile: (fileName) => {
        if (fileName.endsWith('.wasm')) return '/occt-import-js.wasm';
        return fileName;
      },
    });

    console.log('✅ Motor OCCT listo');
    return true;
  } catch (err) {
    console.error('❌ Error inicializando OCCT:', err);
    occt = null;
    return false;
  }
}

export function isOcctReady() {
  return occt !== null;
}

export function parseStepFile(fileBuffer) {
  if (!occt) {
    throw new Error('El motor WebAssembly no está listo. Recarga la página e inténtalo de nuevo.');
  }

  let result;
  try {
    const uint8Array = new Uint8Array(fileBuffer);
    result = occt.ReadStepFile(uint8Array, null);
  } catch (err) {
    throw new Error('Fallo al parsear el archivo STEP: ' + err.message);
  }

  if (!result || !result.success) {
    throw new Error('No se pudo parsear el archivo. ¿Es un STEP válido?');
  }

  if (!result.meshes || result.meshes.length === 0) {
    throw new Error('El archivo STEP no contiene geometría visible.');
  }

  const group = new THREE.Group();

  const defaultMaterial = new THREE.MeshPhysicalMaterial({
    color: 0xb0c4de,
    metalness: 0.4,
    roughness: 0.35,
    clearcoat: 0.15,
    side: THREE.DoubleSide,
  });

  const lineMaterial = new THREE.LineBasicMaterial({ color: 0x222233 });

  for (const meshData of result.meshes) {
    if (!meshData.attributes?.position) continue;

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(meshData.attributes.position.array, 3));

    if (meshData.attributes.normal) {
      geometry.setAttribute('normal', new THREE.Float32BufferAttribute(meshData.attributes.normal.array, 3));
    } else {
      geometry.computeVertexNormals();
    }

    if (meshData.index) {
      geometry.setIndex(new THREE.Uint32BufferAttribute(meshData.index.array, 1));
    }

    let material = defaultMaterial;
    if (meshData.color) {
      material = defaultMaterial.clone();
      material.color.setRGB(meshData.color[0], meshData.color[1], meshData.color[2]);
    }

    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;

    const edgesGeo = new THREE.EdgesGeometry(geometry, 20);
    const edges = new THREE.LineSegments(edgesGeo, lineMaterial);
    edges.visible = false;
    edges.userData.isEdge = true;
    mesh.add(edges);

    group.add(mesh);
  }

  return group;
}
