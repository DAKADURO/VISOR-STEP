import './style.css';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { initStepLoader, parseStepFile } from './stepLoader.js';

let scene, camera, renderer, controls;
let currentModel = null;
let showWireframe = false;

// Elementos de la UI
const dropZone = document.getElementById('drop-zone');
const loadingOverlay = document.getElementById('loading-overlay');
const loadingText = document.getElementById('loading-text');
const btnWireframe = document.getElementById('btn-wireframe');
const btnReset = document.getElementById('btn-reset');

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

  renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
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

  // 4. Inicializar motor WASM
  await initStepLoader();

  // 5. Configurar Eventos
  setupEvents();
}

function setupEvents() {
  window.addEventListener('resize', onWindowResize);

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
}

function onWindowResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

async function loadModel(file) {
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
