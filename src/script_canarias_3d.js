import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

// VARIABLES GLOBALES
let scene, renderer, camera, camcontrols;

// LÍMITES GEOGRÁFICOS
const minlon = -18.35, maxlon = -13.25;
const minlat = 27.45, maxlat = 29.45;

// ESCALA
const scale = 10;
const aspect = (maxlon - minlon) / (maxlat - minlat);
const mapsy = scale;
const mapsx = mapsy * aspect;

// ALMACENAMIENTO DE DATOS
const datosInfraestructuras = {}; 
const anillosRadar = []; 
const rutasActivas = []; 
let tiempoSimulacion = 360; 

// HUD
const raycaster = new THREE.Raycaster(); 
const raton = new THREE.Vector2(); 
let tooltip = document.createElement("div");
tooltip.style.position = "absolute";
tooltip.style.backgroundColor = "rgba(4, 13, 26, 0.85)";
tooltip.style.border = "1px solid #00e5ff";
tooltip.style.color = "#fff";
tooltip.style.padding = "10px";
tooltip.style.borderRadius = "5px";
tooltip.style.fontFamily = "monospace";
tooltip.style.fontSize = "14px";
tooltip.style.pointerEvents = "none";
tooltip.style.display = "none";
tooltip.style.zIndex = "100";
document.body.appendChild(tooltip);

//PANEL CONTROL VELOCIDAD
const panelControl = document.createElement("div");
panelControl.style.position = "absolute";
panelControl.style.top = "20px";
panelControl.style.left = "20px";
panelControl.style.backgroundColor = "rgba(4, 13, 26, 0.85)";
panelControl.style.border = "1px solid #00e5ff";
panelControl.style.color = "#fff";
panelControl.style.padding = "8px 12px";
panelControl.style.borderRadius = "6px";
panelControl.style.fontFamily = "monospace";
panelControl.style.display = "flex";
panelControl.style.flexDirection = "column";
panelControl.style.alignItems = "center";
panelControl.style.zIndex = "100";
panelControl.style.boxShadow = "0px 0px 10px rgba(0, 229, 255, 0.15)";

panelControl.innerHTML = `
  <label style="margin-bottom: 6px; font-size: 12px;">Velocidad: <strong id="texto-velocidad" style="color:#00e5ff">x1.0</strong></label>
  <input type="range" id="slider-velocidad" min="0" max="5" step="0.1" value="1" style="width: 120px; cursor: pointer;">
`;
document.body.appendChild(panelControl);

// barrita velo
let multiplicadorVelocidad = 1;
document.getElementById("slider-velocidad").addEventListener("input", (e) => {
  multiplicadorVelocidad = parseFloat(e.target.value);
  document.getElementById("texto-velocidad").innerText = "x" + multiplicadorVelocidad.toFixed(1);
});

// VARIABLES SEGUIMIENTO VUELO Y PAUSA
let rutaSeguida = null;
let animacionPausada = false;
let modeloAvionBase = null;
let modeloBarcoBase = null;

function salirSeguimiento(){
  rutaSeguida = null;
  camcontrols.enabled = true;
  const direccion = new THREE.Vector3();
  camera.getWorldDirection(direccion);
  camcontrols.target.copy(camera.position).add(direccion.multiplyScalar(3));
}

// EVENTO CLIC
window.addEventListener("click", (event) => {
  if (event.target.id === "slider-velocidad") return;

  const rect = renderer.domElement.getBoundingClientRect();
  const ratonClic = new THREE.Vector2(
    ((event.clientX - rect.left) / rect.width) * 2 - 1,
    -((event.clientY - rect.top) / rect.height) * 2 + 1
  );
  raycaster.setFromCamera(ratonClic, camera);

  const navesVisibles = [];
  for (const r of rutasActivas) {
    if (r && r.mesh && typeof r.mesh.type === "string" && r.mesh.visible) {
      navesVisibles.push(r.mesh);
    }
  }

  if (navesVisibles.length === 0) {
    if (rutaSeguida) salirSeguimiento();
    return; 
  }

  const intersecciones = raycaster.intersectObjects(navesVisibles, true);

  if (intersecciones.length > 0) {
    let objetoTocado = intersecciones[0].object;
    while (objetoTocado && !objetoTocado.userData.compania && objetoTocado.parent) {
      objetoTocado = objetoTocado.parent;
    }

    if (objetoTocado && objetoTocado.userData.compania) {
      rutaSeguida = rutasActivas.find((r) => r.mesh === objetoTocado);
      camcontrols.enabled = false; 
    }
  } else {
    if (rutaSeguida) salirSeguimiento();
  }
});

// EVENTO MOUSEMOVE
window.addEventListener("mousemove", (event) => {
  const rect = renderer.domElement.getBoundingClientRect();
  raton.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  raton.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  tooltip.style.left = event.clientX + 15 + "px";
  tooltip.style.top = event.clientY + 15 + "px";
});

// EVENTO TECLADO
window.addEventListener("keydown", (event) => {
  if (event.code === "Space") {
    event.preventDefault(); 
    animacionPausada = !animacionPausada;
  }
  if (event.code === "Escape") {
    if (rutaSeguida) salirSeguimiento();
  }
});

init();
animate();

function init() {
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x030812);
  scene.fog = new THREE.FogExp2(0x030812, 0.025);

  camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 1000);
  camera.up.set(0, 0, 1); 
  camera.position.set(0, -11, 7.5);

  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  document.body.appendChild(renderer.domElement);

  camcontrols = new OrbitControls(camera, renderer.domElement);
  camcontrols.enableDamping = true;
  camcontrols.dampingFactor = 0.05;
  camcontrols.maxPolarAngle = Math.PI / 2 - 0.03;

  scene.add(new THREE.AmbientLight(0x8ab4f8, 0.7));
  
  const dirLight = new THREE.DirectionalLight(0xffe0b2, 1.8);
  dirLight.position.set(-15, -10, 12);
  scene.add(dirLight);

  const rimLight = new THREE.DirectionalLight(0x00e5ff, 0.6);
  rimLight.position.set(15, 12, 8);
  scene.add(rimLight);

  crearTerrenoCanarias();
  cargarModelos3D();

  window.addEventListener("resize", onWindowResize);
}

// CARGA DE MODELOS 3D (aviones y barcos)
function cargarModelos3D() {
  const loader = new GLTFLoader();

  loader.load("/src/Texturas/avion.glb", (gltfA) => {
      modeloAvionBase = new THREE.Group();
      const avion = gltfA.scene;
      avion.scale.set(0.015, 0.015, 0.015);
      avion.rotation.set(Math.PI / 2, Math.PI, 0); 
      modeloAvionBase.add(avion);

      loader.load("/src/Texturas/barco.glb", (gltfB) => {
          modeloBarcoBase = new THREE.Group();
          const barco = gltfB.scene;
          barco.scale.set(0.007, 0.007, 0.007);
          barco.rotation.set(Math.PI / 2, Math.PI, 0);
          modeloBarcoBase.add(barco);
          
          cargarInfraestructurasCSV();
        }, undefined, (e) => { console.error("Fallo barco", e); cargarInfraestructurasCSV(); }
      );
    }, undefined, (e) => { console.error("Fallo avion", e); cargarInfraestructurasCSV(); }
  );
}

// CREACIÓN DE TERRENO Y OCÉANO
function crearTerrenoCanarias() {
  const loaderTexturas = new THREE.TextureLoader();

  loaderTexturas.load("/src/Texturas/Canary_Islands_(MODIS_2015-12-27).jpg", (texColor) => {
      const img = texColor.image;

      const cropX = img.width * 0.01, cropY = img.height * 0.27, cropW = img.width * 0.94, cropH = img.height * 0.37;

      const colorW = 1024, colorH = 512;
      const canvasColor = document.createElement("canvas");
      canvasColor.width = colorW; canvasColor.height = colorH;
      const ctxColor = canvasColor.getContext("2d");
      ctxColor.drawImage(img, cropX, cropY, cropW, cropH, 0, 0, colorW, colorH);

      const dispW = 360, dispH = 180;
      const canvasDisp = document.createElement("canvas");
      canvasDisp.width = dispW; canvasDisp.height = dispH;
      const ctxDisp = canvasDisp.getContext("2d");
      ctxDisp.drawImage(img, cropX, cropY, cropW, cropH, 0, 0, dispW, dispH);

      const imgData = ctxDisp.getImageData(0, 0, dispW, dispH);
      const data = imgData.data;

      for (let py = 0; py < dispH; py++) {
        for (let px = 0; px < dispW; px++) {
          const idx = (py * dispW + px) * 4;
          const r = data[idx], g = data[idx + 1], b = data[idx + 2];
          const diferenciaTierra = Math.max(0, r - b * 0.65 + (g - b * 0.55));
          let altura = diferenciaTierra > 12 ? Math.min(255, Math.pow(diferenciaTierra / 110, 1.2) * 255) : 0;
          data[idx] = data[idx + 1] = data[idx + 2] = altura;
          data[idx + 3] = 255;
        }
      }
      ctxDisp.putImageData(imgData, 0, 0);

      const canvasSuave = document.createElement("canvas");
      canvasSuave.width = dispW; canvasSuave.height = dispH;
      const ctxSuave = canvasSuave.getContext("2d");
      ctxSuave.filter = "blur(2px)";
      ctxSuave.drawImage(canvasDisp, 0, 0);

      const geoTerreno = new THREE.PlaneGeometry(mapsx, mapsy, 300, 150);
      const matTerreno = new THREE.MeshPhongMaterial({
        map: new THREE.CanvasTexture(canvasColor),
        displacementMap: new THREE.CanvasTexture(canvasSuave),
        displacementScale: 0.25,
        shininess: 8,
      });
      scene.add(new THREE.Mesh(geoTerreno, matTerreno));
      // insertar textura mar
      const texturaAgua = loaderTexturas.load("https://raw.githubusercontent.com/mrdoob/three.js/master/examples/textures/waternormals.jpg");
      texturaAgua.wrapS = texturaAgua.wrapT = THREE.RepeatWrapping;
      texturaAgua.repeat.set(12, 12);

      const matMar = new THREE.MeshPhongMaterial({
        color: 0x020a17, specular: 0x00e5ff, shininess: 80, transparent: true, opacity: 0.85,
        normalMap: texturaAgua, normalScale: new THREE.Vector2(0.6, 0.6)
      });

      const meshMar = new THREE.Mesh(new THREE.PlaneGeometry(mapsx * 1.5, mapsy * 1.5), matMar);
      meshMar.position.z = 0.008;
      meshMar.name = "Oceano";
      scene.add(meshMar);
    }
  );
}

// CARGA CSV INFRAESTRUCTURAS
function cargarInfraestructurasCSV() {
  fetch("/src/infraestructuras.csv")
    .then((r) => r.text())
    .then((content) => {
      procesarCSVInfraestructuras(content);
      cargarTraficoCSV();
    })
    .catch((e) => console.error(e));
}
// Procesado csv infraestructura
function procesarCSVInfraestructuras(content) {
  const filas = content.trim().split("\n");
  const encabezados = filas[0].split(";").map((h) => h.trim());

  const ajustesIslas = {
    "Tenerife": { x: 0.4, y: 0.1 }, "Gran Canaria": { x: 0.3, y: 0.2 }, "Lanzarote": { x: 0.35, y: 0.1 },
    "Fuerteventura": { x: 0.45, y: 0.15 }, "La Palma": { x: 0.85, y: 0.4 }, "La Gomera": { x: 0.7, y: 0.3 }, "El Hierro": { x: 0.9, y: 0.5 }
  };

  for (let i = 1; i < filas.length; i++) {
    const col = filas[i].split(";");
    if (col.length > 1) {
      const codigo = col[encabezados.indexOf("codigo")].trim();
      const nombre = col[encabezados.indexOf("nombre")].trim();
      const tipo = col[encabezados.indexOf("tipo")].trim();
      const isla = col[encabezados.indexOf("isla")].trim();
      const lat = parseFloat(col[encabezados.indexOf("latitud")]);
      const lon = parseFloat(col[encabezados.indexOf("longitud")]);

      let mx = Map2Range(lon, minlon, maxlon, -mapsx / 2, mapsx / 2);
      let my = Map2Range(lat, minlat, maxlat, -mapsy / 2, mapsy / 2);
      if (ajustesIslas[isla]) { mx += ajustesIslas[isla].x; my += ajustesIslas[isla].y; }

      const mz = tipo === "aeropuerto" ? 0.09 : 0.045;
      
      datosInfraestructuras[codigo] = { codigo, nombre, tipo, isla, lat, lon, x: mx, y: my, z: mz };
      dibujarMarcadorInfraestructura(mx, my, mz, tipo, codigo, nombre, isla, lat, lon);
    }
  }
}

// MARCADORES PUERTOS Y AEROPUERTOS
function dibujarMarcadorInfraestructura(mx, my, mz, tipo, codigo, nombre, isla, lat, lon) {
  const color = tipo === "aeropuerto" ? 0x00e5ff : 0xffab00;
  const grupo = new THREE.Group();

  const pilar = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.16, tipo === "aeropuerto" ? 16 : 6), new THREE.MeshBasicMaterial({ color: color }));
  pilar.rotation.x = Math.PI / 2;
  pilar.position.set(0, 0, 0.05);
  grupo.add(pilar);

  const anillo = new THREE.Mesh(new THREE.RingGeometry(0.06, 0.11, 24), new THREE.MeshBasicMaterial({ color: color, side: THREE.DoubleSide, transparent: true, opacity: 0.85 }));
  anillo.position.set(0, 0, 0.01);
  grupo.add(anillo);

  grupo.position.set(mx, my, mz);
  grupo.userData = { esInfraestructura: true, tipo, codigo, nombre, isla, lat, lon };
  scene.add(grupo);
  anillosRadar.push({ mesh: anillo, fase: Math.random() * Math.PI * 2 });
}

// CARGA Y PROCESADO DE CSV TRÁFICO
function cargarTraficoCSV() {
  fetch("/src/trafico_canarias.csv").then(r => r.text()).then(content => {
    const filas = content.trim().split("\n");
    const h = filas[0].split(";").map(x => x.trim());

    for (let i = 1; i < filas.length; i++) {
      const col = filas[i].split(";");
      if (col.length > 5) {
        const ori = datosInfraestructuras[col[h.indexOf("origen")].trim()];
        const des = datosInfraestructuras[col[h.indexOf("destino")].trim()];
        if (!ori || !des) continue;

        const tipo = col[h.indexOf("tipo")].trim();
        let curva;

        if (tipo == "avion") {
          const alturaZ = (parseFloat(col[h.indexOf("altitud_m")]) / 10000) * scale;
          curva = new THREE.QuadraticBezierCurve3(
            new THREE.Vector3(ori.x, ori.y, ori.z),
            new THREE.Vector3((ori.x + des.x) / 2, (ori.y + des.y) / 2, Math.max(ori.z, des.z) + alturaZ),
            new THREE.Vector3(des.x, des.y, des.z)
          );
          scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(curva.getPoints(50)), new THREE.LineBasicMaterial({ color: 0x00e5ff, transparent: true, opacity: 0.2 })));
        } else {
          curva = new THREE.CatmullRomCurve3([new THREE.Vector3(ori.x, ori.y, 0.035), new THREE.Vector3(des.x, des.y, 0.035)]);
          scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(curva.getPoints(50)), new THREE.LineBasicMaterial({ color: 0xffab00, transparent: true, opacity: 0.2 })));
        }

        let meshNave = tipo === "avion" && modeloAvionBase ? modeloAvionBase.clone() : (tipo === "barco" && modeloBarcoBase ? modeloBarcoBase.clone() : null);
        
        const compania = col[h.indexOf("compania")].trim().toLowerCase();
        let colorHex = 0xffffff;
        if (compania.includes("binter")) colorHex = 0x00a859;
        else if (compania.includes("canaryfly")) colorHex = 0x00e5ff;
        else if (compania.includes("armas")) colorHex = 0xe3001b; 
        else if (compania.includes("olsen") || compania.includes("fred")) colorHex = 0x002c5c;
        else if (compania.includes("iberia")) colorHex = 0xffc400;
        else if (compania.includes("vueling")) colorHex = 0xffcc00;
        else if (compania.includes("ryanair")) colorHex = 0x0033a0;
        
        meshNave.traverse((child) => {
          if (child.isMesh && child.material){
            child.material = child.material.clone();
            child.material.color.setHex(colorHex);
          }
        });

        meshNave.userData = { tipo, compania: col[h.indexOf("compania")].trim(), modelo: col[h.indexOf("modelo")].trim(), origen: ori.nombre, destino: des.nombre, altitud: col[h.indexOf("altitud_m")] };
        scene.add(meshNave);

        rutasActivas.push({
          curva, mesh: meshNave,
          inicio: parseFloat(col[h.indexOf("salida_min")]),
          fin: parseFloat(col[h.indexOf("llegada_min")]),
          datos: meshNave.userData
        });
      }
    }
  });
}

function Map2Range(val, vmin, vmax, dmin, dmax) {
  return dmin + (1 - (vmax - val) / (vmax - vmin)) * (dmax - dmin);
}

function onWindowResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

// BUCLE ANIMACIÓN
function animate() {
  requestAnimationFrame(animate);
  const tReal = performance.now();

  for (const item of anillosRadar) {
    const onda = (Math.sin(tReal * 0.003 + item.fase) + 1) * 0.5;
    item.mesh.scale.set(1 + onda * 1.4, 1 + onda * 1.4, 1);
    item.mesh.material.opacity = 0.85 * (1 - onda * 0.7);
  }

  //MULTIPLICADOR DE VELOCIDAD
  if (!animacionPausada) {
    tiempoSimulacion += (0.5 * multiplicadorVelocidad);
    if (tiempoSimulacion > 600) tiempoSimulacion = 360;

    for (const ruta of rutasActivas) {
      if (tiempoSimulacion >= ruta.inicio && tiempoSimulacion <= ruta.fin) {
        ruta.mesh.visible = true;
        const progreso = (tiempoSimulacion - ruta.inicio) / (ruta.fin - ruta.inicio);
        const pos = ruta.curva.getPointAt(progreso);
        ruta.mesh.position.copy(pos);
      } else {
        ruta.mesh.visible = false;
      }
    }
  }

  // RAYCASTER Y HUD
  raycaster.setFromCamera(raton, camera);
  const interactivos = [...rutasActivas.filter(r => r.mesh.visible).map(r => r.mesh)];
  scene.traverse((child) => { if (child.userData && child.userData.esInfraestructura) interactivos.push(child); });

  const intersecciones = raycaster.intersectObjects(interactivos, true);

  if (intersecciones.length > 0) {
    let obj = intersecciones[0].object;
    while (obj && !obj.userData.compania && !obj.userData.esInfraestructura && obj.parent) obj = obj.parent;

    if (obj && obj.userData) {
      const d = obj.userData;
      if (d.esInfraestructura) {
        tooltip.innerHTML = `<strong style="color:#00ffcc">${d.tipo === "aeropuerto" ? "✈️🛬" : "🚢⚓"} ${d.nombre || ""}</strong><br/>Siglas: <b>${d.codigo || ""}</b> (${d.isla || ""})<br/>Lat: ${(d.lat || 0).toFixed(4)} | Lon: ${(d.lon || 0).toFixed(4)}`;
        tooltip.style.display = "block";
      } else if (d.compania) {
        tooltip.innerHTML = `<strong style="color:#00e5ff">${d.tipo === "avion" ? "✈️" : "⛴️"} ${d.compania}</strong><br/>Modelo: ${d.modelo}<br/>Ruta: ${d.origen} ➔ ${d.destino}${d.tipo === "avion" ? `<br/>Altitud: ${d.altitud} m` : ""}`;
        tooltip.style.display = "block";
      }
    }
  } else {
    tooltip.style.display = "none";
  }

  // ANIMACIÓN DEL MAR (olas)
  const oceano = scene.getObjectByName("Oceano");
  if (oceano && !animacionPausada && multiplicadorVelocidad > 0){
    oceano.material.normalMap.offset.x -= (0.0005 * multiplicadorVelocidad);
    oceano.material.normalMap.offset.y += (0.0002 * multiplicadorVelocidad);
  }

  // CÁMARA DE SEGUIMIENTO (click en el avion o barco)
  if (rutaSeguida && rutaSeguida.mesh.visible) {
    const p = (tiempoSimulacion - rutaSeguida.inicio) / (rutaSeguida.fin - rutaSeguida.inicio);
    if (p < 0.99) {
      const posActual = rutaSeguida.curva.getPointAt(p);
      const tangente = rutaSeguida.curva.getTangentAt(p).normalize();
      const esAvion = rutaSeguida.datos.tipo === "avion";
      
      const posCamara = posActual.clone().add(tangente.clone().multiplyScalar(esAvion ? -0.45 : -0.25));
      posCamara.z += esAvion ? 0.15 : 0.08;
      
      camera.position.copy(posCamara);
      camera.up.set(0, 0, 1);
      
      const objetivo = posActual.clone();
      objetivo.z += (esAvion ? 0.02 : 0.01);
      camera.lookAt(objetivo);
    }
  } else {
    if (rutaSeguida) salirSeguimiento();
    camcontrols.update(); 
  }

  renderer.render(scene, camera);
}