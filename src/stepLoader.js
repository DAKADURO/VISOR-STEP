import * as THREE from 'three';

let occt = null;
let initPromise = null;

// Carga el script OCCT dinámicamente usando un script tag (evita que Vite lo procese)
function loadOcctScript() {
  return new Promise((resolve, reject) => {
    if (typeof window.__OcctImportJs !== 'undefined') {
      resolve(window.__OcctImportJs);
      return;
    }

    const script = document.createElement('script');
    script.src = '/occt-import-js.js';
    script.onload = () => {
      // El script expone la función init en el objeto global
      if (typeof window.occtimportjs !== 'undefined') {
        resolve(window.occtimportjs);
      } else if (typeof occtimportjs !== 'undefined') {
        // eslint-disable-next-line no-undef
        resolve(occtimportjs);
      } else {
        // Intentar buscar la función globalmente
        const keys = Object.keys(window).filter(k =>
          typeof window[k] === 'function' && k.toLowerCase().includes('occt')
        );
        if (keys.length > 0) {
          resolve(window[keys[0]]);
        } else {
          reject(new Error('No se encontró la función de inicialización de occt-import-js en el scope global.'));
        }
      }
    };
    script.onerror = () => reject(new Error('No se pudo cargar /occt-import-js.js'));
    document.head.appendChild(script);
  });
}

export async function initStepLoader() {
  if (occt) return true;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    try {
      const initFn = await loadOcctScript();
      occt = await initFn({
        locateFile: (fileName) => {
          if (fileName.endsWith('.wasm')) return '/occt-import-js.wasm';
          return fileName;
        },
      });
      console.log('✅ Motor OCCT inicializado');
      return true;
    } catch (err) {
      console.error('❌ Error inicializando OCCT:', err);
      occt = null;
      initPromise = null;
      return false;
    }
  })();

  return initPromise;
}

export function isOcctReady() {
  return occt !== null;
}

// Procesa el buffer del archivo STEP y retorna un Group de Three.js
export function parseStepFile(fileBuffer) {
  if (!occt) {
    throw new Error('El motor WebAssembly no está listo. Recarga la página e inténtalo de nuevo.');
  }

  const fileName = 'model.step';

  // Limpiar archivo previo si existe
  try { occt.FS.unlink('/' + fileName); } catch (_) {}

  // Escribir en memoria WASM
  occt.FS.createDataFile('/', fileName, new Uint8Array(fileBuffer), true, true);

  let result;
  try {
    result = occt.ReadStepFile('/' + fileName, null);
  } finally {
    try { occt.FS.unlink('/' + fileName); } catch (_) {}
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

    // Agregar bordes
    const edgesGeo = new THREE.EdgesGeometry(geometry, 20);
    const edges = new THREE.LineSegments(edgesGeo, lineMaterial);
    edges.visible = false;
    edges.userData.isEdge = true;
    mesh.add(edges);

    group.add(mesh);
  }

  return group;
}
