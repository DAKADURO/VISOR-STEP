import './style.css';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { initStepLoader, parseStepFile, isOcctReady } from './stepLoader.js';

let scene, camera, renderer, controls;
let currentModel = null;
let showWireframe = false;

// Elementos de la UI
const dropZone = document.getElementById('drop-zone');
const loadingOverlay = document.getElementById('loading-overlay');
const loadingText = document.getElementById('loading-text');
const btnWireframe = document.getElementById('btn-wireframe');
const btnReset = document.getElementById('btn-reset');
const btnOpenFile = document.getElementById('btn-open-file');
const fileInput = document.getElementById('file-input');

// Nuevos Elementos UI
const colorControls = document.getElementById('color-controls');
const colorBg = document.getElementById('color-bg');
const colorPart = document.getElementById('color-part');
const partColorContainer = document.getElementById('part-color-container');

const btnMeasure = document.getElementById('btn-measure');
const btnScreenshot = document.getElementById('btn-screenshot');
const measurePanel = document.getElementById('measure-panel');
const measureResult = document.getElementById('measure-result');

// Variables para Herramientas
let modelSize = 100;
let raycaster = new THREE.Raycaster();
let mouse = new THREE.Vector2();

let selectedMesh = null;
let originalEmissive = new THREE.Color();

let isMeasuring = false;
let measurePoints = [];
let measureMarkers = [];
let measureLine = null;

init();
animate();

async function init() {
  // 1. Configurar Escena de Three.js
  const canvas = document.getElementById('webgl-canvas');
  scene = new THREE.Scene();
  // Color de fondo a juego con el tema oscuro
  scene.background = new THREE.Color('#0d1117');
  
  camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 1000);
  camera.position.set(0, 100, 150);

  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  // 2. Controles de Cámara
  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.05;

  // 3. Iluminación Premium
  const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
  scene.add(ambientLight);

  const dirLight = new THREE.DirectionalLight(0xffffff, 1.2);
  dirLight.position.set(50, 100, 50);
  dirLight.castShadow = true;
  dirLight.shadow.mapSize.width = 2048;
  dirLight.shadow.mapSize.height = 2048;
  scene.add(dirLight);
  
  const fillLight = new THREE.DirectionalLight(0xaaccff, 0.4);
  fillLight.position.set(-50, 0, -50);
  scene.add(fillLight);

  // Un plano sutil debajo para sombras
  const planeGeo = new THREE.PlaneGeometry(1000, 1000);
  const planeMat = new THREE.ShadowMaterial({ opacity: 0.3 });
  const plane = new THREE.Mesh(planeGeo, planeMat);
  plane.rotation.x = -Math.PI / 2;
  plane.position.y = -50;
  plane.receiveShadow = true;
  scene.add(plane);

  // 4. Inicializar motor WASM con feedback visual
  loadingText.textContent = 'Cargando motor 3D...';
  loadingOverlay.classList.remove('hidden');
  const ok = await initStepLoader();
  loadingOverlay.classList.add('hidden');

  if (!ok) {
    btnOpenFile.disabled = true;
    btnOpenFile.textContent = '⚠ Motor no disponible';
    btnOpenFile.style.opacity = '0.5';
    console.error('Motor OCCT no pudo inicializarse.');
  }

  // 5. Configurar Eventos
  setupEvents();
}

function setupEvents() {
  window.addEventListener('resize', onWindowResize);
  const canvas = document.getElementById('webgl-canvas');
  canvas.addEventListener('click', onCanvasClick);

  // Drag and drop events
  window.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.classList.remove('hidden');
  });

  dropZone.addEventListener('dragleave', (e) => {
    e.preventDefault();
    dropZone.classList.add('hidden');
  });

  dropZone.addEventListener('drop', async (e) => {
    e.preventDefault();
    dropZone.classList.add('hidden');

    const file = e.dataTransfer.files[0];
    if (!file) return;

    const ext = file.name.split('.').pop().toLowerCase();
    if (ext !== 'step' && ext !== 'stp') {
      alert("Por favor, sube un archivo con extensión .step o .stp");
      return;
    }

    loadModel(file);
  });

  // Botón de apertura de archivo
  btnOpenFile.addEventListener('click', () => {
    fileInput.click();
  });

  fileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const ext = file.name.split('.').pop().toLowerCase();
    if (ext !== 'step' && ext !== 'stp') {
      alert('Por favor, selecciona un archivo .step o .stp');
      return;
    }
    loadModel(file);
    fileInput.value = ''; // Resetear para poder cargar el mismo archivo otra vez
  });

  // Botones UI
  btnWireframe.addEventListener('click', () => {
    showWireframe = !showWireframe;
    btnWireframe.classList.toggle('active', showWireframe);
    
    if (currentModel) {
      currentModel.traverse((child) => {
        if (child.userData && child.userData.isEdge) {
          child.visible = showWireframe;
        }
      });
    }
  });

  btnReset.addEventListener('click', () => {
    controls.reset();
    if (currentModel) {
      centerCameraOnModel(currentModel);
    }
  });

  // Color de fondo
  colorBg.addEventListener('input', (e) => {
    scene.background.set(e.target.value);
  });

  // Color de pieza
  colorPart.addEventListener('input', (e) => {
    if (selectedMesh && selectedMesh.material) {
      selectedMesh.material.color.set(e.target.value);
    }
  });

  // Medir
  btnMeasure.addEventListener('click', () => {
    isMeasuring = !isMeasuring;
    btnMeasure.classList.toggle('active', isMeasuring);
    measurePanel.classList.toggle('hidden', !isMeasuring);
    
    if (!isMeasuring) {
      clearMeasurement();
    } else {
      clearSelection();
    }
  });

  // Captura de pantalla
  btnScreenshot.addEventListener('click', () => {
    renderer.render(scene, camera);
    const dataURL = renderer.domElement.toDataURL('image/png');
    const a = document.createElement('a');
    a.href = dataURL;
    a.download = 'visor-3d-screenshot.png';
    a.click();
  });
}

function onWindowResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

async function loadModel(file) {
  if (!isOcctReady()) {
    alert('El motor 3D no está disponible. Recarga la página.');
    return;
  }
  loadingText.textContent = `Parseando ${file.name}...`;
  loadingOverlay.classList.remove('hidden');

  try {
    const arrayBuffer = await file.arrayBuffer();
    
    // Llamar a nuestra función de parseo (bloqueará el hilo principal un momento)
    // En una app más robusta se podría usar Web Workers
    const modelGroup = parseStepFile(arrayBuffer);
    
    if (currentModel) {
      scene.remove(currentModel);
      // Faltaría liberar geometrías y materiales, pero para el demo está ok
    }

    currentModel = modelGroup;
    
    // Asegurar que respeta el toggle de bordes actual
    currentModel.traverse((child) => {
      if (child.userData && child.userData.isEdge) {
        child.visible = showWireframe;
      }
    });

    scene.add(currentModel);
    centerCameraOnModel(currentModel);

    // Reiniciar UI
    colorControls.classList.remove('hidden');
    clearSelection();
    clearMeasurement();

  } catch (error) {
    console.error(error);
    alert("Error procesando el archivo: " + error.message);
  } finally {
    loadingOverlay.classList.add('hidden');
  }
}

function centerCameraOnModel(model) {
  const box = new THREE.Box3().setFromObject(model);
  const size = box.getSize(new THREE.Vector3()).length();
  const center = box.getCenter(new THREE.Vector3());

  model.position.x += (model.position.x - center.x);
  model.position.y += (model.position.y - center.y);
  model.position.z += (model.position.z - center.z);

  modelSize = size;
  controls.maxDistance = size * 10;
  camera.near = size / 100;
  camera.far = size * 100;
  camera.updateProjectionMatrix();

  camera.position.copy(center);
  camera.position.x += size / 1.5;
  camera.position.y += size / 1.5;
  camera.position.z += size / 1.5;
  camera.lookAt(center);
  controls.target.copy(center);
  controls.update();
}

function animate() {
  requestAnimationFrame(animate);
  if (controls) controls.update();
  if (renderer && scene && camera) {
    renderer.render(scene, camera);
  }
}

// Lógica de interacción (Click en el canvas)
function onCanvasClick(event) {
  if (!currentModel) return;

  mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
  mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

  raycaster.setFromCamera(mouse, camera);

  const meshes = [];
  currentModel.traverse((child) => {
    if (child.isMesh && (!child.userData || !child.userData.isEdge)) {
      meshes.push(child);
    }
  });

  const intersects = raycaster.intersectObjects(meshes, false);

  if (isMeasuring) {
    if (intersects.length > 0) {
      const snapThreshold = modelSize * 0.05; // Tolerancia del 5% del tamaño de la pieza
      const snappedPoint = getSnappedPoint(intersects[0], snapThreshold);
      addMeasurePoint(snappedPoint);
    }
  } else {
    if (intersects.length > 0) {
      selectMesh(intersects[0].object);
    } else {
      clearSelection();
    }
  }
}

function selectMesh(mesh) {
  clearSelection();
  selectedMesh = mesh;
  
  if (mesh.material) {
    originalEmissive.copy(mesh.material.emissive);
    mesh.material.emissive.setHex(0x333333); // Resaltar
    
    partColorContainer.classList.remove('disabled');
    colorPart.disabled = false;
    colorPart.value = '#' + mesh.material.color.getHexString();
  }
}

function clearSelection() {
  if (selectedMesh && selectedMesh.material) {
    selectedMesh.material.emissive.copy(originalEmissive);
  }
  selectedMesh = null;
  partColorContainer.classList.add('disabled');
  colorPart.disabled = true;
}

function addMeasurePoint(point) {
  if (measurePoints.length >= 2) {
    clearMeasurement();
  }

  measurePoints.push(point);

  const markerGeo = new THREE.SphereGeometry(modelSize / 70, 16, 16);
  const markerMat = new THREE.MeshBasicMaterial({ color: 0xff3333, depthTest: false });
  const marker = new THREE.Mesh(markerGeo, markerMat);
  marker.position.copy(point);
  marker.renderOrder = 999;
  scene.add(marker);
  measureMarkers.push(marker);

  if (measurePoints.length === 2) {
    const mat = new THREE.LineBasicMaterial({ color: 0xff3333, depthTest: false });
    const geo = new THREE.BufferGeometry().setFromPoints(measurePoints);
    measureLine = new THREE.Line(geo, mat);
    measureLine.renderOrder = 999;
    scene.add(measureLine);

    const dist = measurePoints[0].distanceTo(measurePoints[1]);
    measureResult.textContent = dist.toFixed(2);
  }
}

function clearMeasurement() {
  measureMarkers.forEach(m => scene.remove(m));
  measureMarkers = [];
  if (measureLine) {
    scene.remove(measureLine);
    measureLine = null;
  }
  measurePoints = [];
  measureResult.textContent = '--';
}

function getSnappedPoint(intersect, threshold) {
  const mesh = intersect.object;
  const point = intersect.point;
  
  if (!mesh.geometry || !mesh.geometry.attributes.position) {
    return point; // Si no hay geometría, devolver el punto normal
  }
  
  const positions = mesh.geometry.attributes.position.array;
  let closestDist = Infinity;
  let closestPoint = new THREE.Vector3();
  const tempVertex = new THREE.Vector3();
  
  const matrixWorld = mesh.matrixWorld;
  
  // Iterar por todos los vértices
  for (let i = 0; i < positions.length; i += 3) {
    tempVertex.set(positions[i], positions[i + 1], positions[i + 2]);
    tempVertex.applyMatrix4(matrixWorld);
    
    const dist = tempVertex.distanceTo(point);
    if (dist < closestDist) {
      closestDist = dist;
      closestPoint.copy(tempVertex);
    }
  }
  
  // Si el vértice más cercano está dentro del radio de tolerancia, hacer snap
  if (closestDist <= threshold) {
    return closestPoint;
  }
  
  return point; // Retornar el punto original si no hay vértice cercano
}
