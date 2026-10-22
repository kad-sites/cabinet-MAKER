let scene, camera, renderer, orbit, transformControl, raycaster, mouse;
let cabinetGroup;
let is3DInitialized = false;
let selectedObject = null;
let currentKitchenMode = 'both'; // 'base', 'both', or 'wall'
let currentThickness = 0.75; // Standard 3/4" (18-19mm) plywood

// Base Cabinet Dimensions (inches)
let currentW = 132, currentH = 32, currentD = 24, currentPlinth = 3;

// Wall Cabinet Dimensions (inches)
let currentWallW = 132, currentWallH = 30, currentWallD = 12, currentDadoGap = 22;

let shellObjects = [];
let plinthObjects = [];
let decorObjects = []; // Countertop & Backsplash
let internalParts = [];
let partCounter = 1;
let shuttersOpen = false;

// Height and Coordinate Helpers
function getBaseBottomY() {
    return currentPlinth;
}

function getBaseTopY() {
    return currentPlinth + currentH;
}

function getBaseCenterY() {
    return currentPlinth + (currentH / 2);
}

function getCountertopTopY() {
    return getBaseTopY() + 1.25; // 1.25" countertop slab
}

function getWallBottomY() {
    if (currentKitchenMode === 'both') {
        return getCountertopTopY() + currentDadoGap;
    }
    return 0;
}

function getWallTopY() {
    return getWallBottomY() + currentWallH;
}

function getWallCenterY() {
    return getWallBottomY() + (currentWallH / 2);
}

function getWallCenterZ() {
    if (currentKitchenMode === 'both') {
        return (-currentD / 2) + (currentWallD / 2);
    }
    return 0;
}

function init3D() {
    if (is3DInitialized) return;
    const container = document.getElementById('3d-container');
    if (!container) return;

    // Scene setup
    scene = new THREE.Scene();
    scene.background = new THREE.Color('#1a1a2e');

    // Camera setup
    const aspect = container.clientWidth / container.clientHeight;
    camera = new THREE.PerspectiveCamera(45, aspect, 0.1, 1000);
    camera.position.set(0, 50, 140);

    // Renderer setup
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    container.appendChild(renderer.domElement);

    // Orbit Controls
    orbit = new THREE.OrbitControls(camera, renderer.domElement);
    orbit.enableDamping = false;
    orbit.maxPolarAngle = Math.PI / 2 + 0.1;
    orbit.minDistance = 10;
    orbit.maxDistance = 500;

    // Transform Controls (for dragging internal parts)
    transformControl = new THREE.TransformControls(camera, renderer.domElement);
    transformControl.addEventListener('dragging-changed', function (event) {
        orbit.enabled = !event.value;
    });
    scene.add(transformControl);

    // Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.65);
    scene.add(ambientLight);
    const dirLight = new THREE.DirectionalLight(0xffffff, 0.65);
    dirLight.position.set(60, 120, 80);
    scene.add(dirLight);

    const backFillLight = new THREE.DirectionalLight(0xffffff, 0.3);
    backFillLight.position.set(-60, 80, -60);
    scene.add(backFillLight);

    cabinetGroup = new THREE.Group();
    scene.add(cabinetGroup);

    // Raycaster for Selection
    raycaster = new THREE.Raycaster();
    mouse = new THREE.Vector2();

    renderer.domElement.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('resize', resize3D);
    if (window.ResizeObserver) {
        const ro = new ResizeObserver(() => {
            resize3D();
        });
        ro.observe(container);
    }

    // Property Inspector Setup
    setupInspector();

    // Attach CAD UI listeners
    setupCADListeners();

    is3DInitialized = true;
    
    // Initial build
    setKitchenMode('both');
    animate();
}

function resize3D() {
    const container = document.getElementById('3d-container');
    if (!container || !camera || !renderer) return;
    if (container.clientWidth > 0 && container.clientHeight > 0) {
        camera.aspect = container.clientWidth / container.clientHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(container.clientWidth, container.clientHeight);
    }
}

function updateDimensionsOverlay() {
    const overlaysContainer = document.getElementById('3d-overlays');
    if (!overlaysContainer) return;
    
    if (!selectedObject || (!selectedObject.userData.type && !selectedObject.userData.isDrawerGroup)) {
        overlaysContainer.innerHTML = '';
        return;
    }
    
    const type = selectedObject.userData.type || (selectedObject.userData.isDrawerGroup ? 'drawer' : null);
    if (type !== 'shelf' && type !== 'drawer' && type !== 'divider') {
        overlaysContainer.innerHTML = '';
        return;
    }

    overlaysContainer.innerHTML = '';
    
    const container = document.getElementById('3d-container');
    const width = container.clientWidth;
    const height = container.clientHeight;

    const createLabel = (x, y, text) => {
        const div = document.createElement('div');
        div.style.position = 'absolute';
        div.style.left = `${x}px`;
        div.style.top = `${y}px`;
        div.style.transform = 'translate(-50%, -50%)';
        div.style.background = 'rgba(59, 130, 246, 0.9)';
        div.style.color = '#fff';
        div.style.padding = '2px 6px';
        div.style.borderRadius = '4px';
        div.style.fontSize = '12px';
        div.style.fontWeight = 'bold';
        div.style.pointerEvents = 'none';
        div.textContent = `${text}"`;
        return div;
    };

    const isWallPart = (selectedObject.userData.module === 'wall');
    const boxW = isWallPart ? currentWallW : currentW;
    const boxH = isWallPart ? currentWallH : currentH;
    const boxD = isWallPart ? currentWallD : currentD;
    const boxCenterY = isWallPart ? getWallCenterY() : getBaseCenterY();

    if (type === 'divider') {
        const objX = selectedObject.position.x;
        const w = selectedObject.geometry.parameters.width;
        
        const leftSurface = objX - (w / 2);
        const rightSurface = objX + (w / 2);
        
        const cabInnerLeft = -boxW / 2 + currentThickness;
        const cabInnerRight = boxW / 2 - currentThickness;
        
        const distLeft = (leftSurface - cabInnerLeft).toFixed(1);
        const distRight = (cabInnerRight - rightSurface).toFixed(1);

        const pos = new THREE.Vector3();
        selectedObject.getWorldPosition(pos);
        pos.z += boxD / 2;

        const leftPos = pos.clone(); leftPos.x = leftSurface - (leftSurface - cabInnerLeft)/2;
        const rightPos = pos.clone(); rightPos.x = rightSurface + (cabInnerRight - rightSurface)/2;

        leftPos.project(camera);
        rightPos.project(camera);

        const leftX = (leftPos.x * .5 + .5) * width;
        const leftY = (leftPos.y * -.5 + .5) * height;
        
        const rightX = (rightPos.x * .5 + .5) * width;
        const rightY = (rightPos.y * -.5 + .5) * height;

        if (distLeft >= 0 && leftPos.z < 1) overlaysContainer.appendChild(createLabel(leftX, leftY, distLeft));
        if (distRight >= 0 && rightPos.z < 1) overlaysContainer.appendChild(createLabel(rightX, rightY, distRight));
        
    } else {
        const objY = selectedObject.position.y;
        let h = 0;
        if (selectedObject.userData.isDrawerGroup) {
            const hitBox = selectedObject.children[selectedObject.children.length - 1];
            h = hitBox.geometry ? hitBox.geometry.parameters.height : 8;
        } else {
            h = selectedObject.geometry ? selectedObject.geometry.parameters.height : currentThickness;
        }
        
        const topSurface = objY + (h / 2);
        const bottomSurface = objY - (h / 2);
        
        const cabInnerTop = boxCenterY + boxH / 2 - currentThickness;
        const cabInnerBottom = boxCenterY - boxH / 2 + currentThickness;
        
        const distTop = (cabInnerTop - topSurface).toFixed(1);
        const distBottom = (bottomSurface - cabInnerBottom).toFixed(1);

        const pos = new THREE.Vector3();
        selectedObject.getWorldPosition(pos);
        pos.z += boxD / 2; 

        const topPos = pos.clone(); topPos.y = topSurface + (cabInnerTop - topSurface)/2;
        const botPos = pos.clone(); botPos.y = bottomSurface - (bottomSurface - cabInnerBottom)/2;

        topPos.project(camera);
        botPos.project(camera);

        const topX = (topPos.x * .5 + .5) * width;
        const topY = (topPos.y * -.5 + .5) * height;
        
        const botX = (botPos.x * .5 + .5) * width;
        const botY = (botPos.y * -.5 + .5) * height;

        if (distTop >= 0 && topPos.z < 1) overlaysContainer.appendChild(createLabel(topX, topY, distTop));
        if (distBottom >= 0 && botPos.z < 1) overlaysContainer.appendChild(createLabel(botX, botY, distBottom));
    }
}

function animate() {
    requestAnimationFrame(animate);
    if (orbit) orbit.update();
    if (renderer && scene && camera) {
        const container = document.getElementById('3d-container');
        if (container && (container.clientWidth !== renderer.domElement.clientWidth || container.clientHeight !== renderer.domElement.clientHeight)) {
            resize3D();
        }
        updateDimensionsOverlay();
        renderer.render(scene, camera);
    }
}

function onPointerDown(event) {
    if (transformControl.dragging) return;
    if (event.button !== 0) return; 
    
    const rect = renderer.domElement.getBoundingClientRect();
    mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    
    raycaster.setFromCamera(mouse, camera);
    raycaster.layers.set(0);

    const hitControls = raycaster.intersectObject(transformControl, true);
    if (hitControls.length > 0 && transformControl.axis !== null) return;
    
    const intersects = raycaster.intersectObjects(internalParts, false);

    if (intersects.length > 0) {
        const object = intersects[0].object;
        const targetObj = object.userData.parentGroup ? object.userData.parentGroup : object;

        if (selectedObject !== targetObj) {
            selectObject(object);
        }
    } else {
        deselectObject();
    }
}

function setEmissive(obj, hex) {
    if (obj.material) {
        if (Array.isArray(obj.material)) {
            obj.material.forEach(m => {
                if (m && m.emissive) m.emissive.setHex(hex);
            });
        } else if (obj.material.emissive) {
            obj.material.emissive.setHex(hex);
        }
    }
    if (obj.children) {
        obj.children.forEach(c => setEmissive(c, hex));
    }
}

function selectObject(hitBoxMesh) {
    deselectObject();
    
    const targetObj = hitBoxMesh.userData.parentGroup ? hitBoxMesh.userData.parentGroup : hitBoxMesh;
    selectedObject = targetObj;
    setEmissive(selectedObject, 0x333333);
    
    transformControl.attach(selectedObject);
    
    const type = hitBoxMesh.userData.type;
    if (type === 'shelf' || type === 'drawer') {
        transformControl.showX = false;
        transformControl.showY = true;
        transformControl.showZ = false;
    } else if (type === 'divider') {
        transformControl.showX = true;
        transformControl.showY = false;
        transformControl.showZ = false;
    }
    
    populateInspector(selectedObject);
}

function deselectObject() {
    if (selectedObject) {
        transformControl.detach();
        setEmissive(selectedObject, 0x000000);
        selectedObject = null;
        
        const inspector = document.getElementById('property-inspector');
        if (inspector) inspector.style.display = 'none';
    }
}

function populateInspector(obj) {
    const inspector = document.getElementById('property-inspector');
    if (!inspector) return;
    
    inspector.style.display = 'flex';
    
    const nameEl = document.getElementById('prop-part-name');
    const thickEl = document.getElementById('prop-thickness');
    const lamEl = document.getElementById('prop-laminate');
    const edgeEl = document.getElementById('prop-edge');
    
    let name = obj.userData.label || "Cabinet Part";
    let thickness = currentThickness;
    let laminate = obj.userData.customLaminate || "double";
    let edge = obj.userData.customEdge || "front";
    
    if (obj.userData.isDrawerGroup) {
        name = obj.userData.label || "Drawer Assembly";
        thickEl.disabled = true;
    } else {
        thickEl.disabled = false;
        if (obj.userData.customThickness) {
            thickness = obj.userData.customThickness;
        } else {
            if (obj.userData.type === 'shelf') thickness = obj.geometry.parameters.height;
            else if (obj.userData.type === 'divider') thickness = obj.geometry.parameters.width;
        }
    }
    
    nameEl.textContent = name;
    thickEl.value = thickness;
    lamEl.value = laminate;
    if (edgeEl) edgeEl.value = edge;
}

function setupInspector() {
    const thickEl = document.getElementById('prop-thickness');
    const lamEl = document.getElementById('prop-laminate');
    
    thickEl.addEventListener('input', (e) => {
        if (!selectedObject || selectedObject.userData.isDrawerGroup) return;
        
        const newT = parseFloat(e.target.value);
        if (isNaN(newT) || newT <= 0) return;
        
        selectedObject.userData.customThickness = newT;
        
        const type = selectedObject.userData.type;
        let w = selectedObject.geometry.parameters.width;
        let h = selectedObject.geometry.parameters.height;
        let d = selectedObject.geometry.parameters.depth;
        
        if (type === 'shelf') h = newT;
        if (type === 'divider') w = newT;
        
        const geo = new THREE.BoxGeometry(w, h, d);
        selectedObject.geometry.dispose();
        selectedObject.geometry = geo;
        
        const edges = selectedObject.children.find(c => c.type === 'LineSegments');
        if (edges) {
            edges.geometry.dispose();
            edges.geometry = new THREE.EdgesGeometry(geo);
        }
    });
    
    lamEl.addEventListener('change', (e) => {
        if (!selectedObject || selectedObject.userData.isDrawerGroup) return;
        selectedObject.userData.customLaminate = e.target.value;
        const currentEdge = selectedObject.userData.customEdge || 'front';
        applyLaminateMaterials(selectedObject, selectedObject.userData.type, e.target.value, currentEdge);
        setEmissive(selectedObject, 0x333333);
    });
    
    const edgeEl = document.getElementById('prop-edge');
    if (edgeEl) {
        edgeEl.addEventListener('change', (e) => {
            if (!selectedObject || selectedObject.userData.isDrawerGroup) return;
            selectedObject.userData.customEdge = e.target.value;
            const currentLam = selectedObject.userData.customLaminate || 'double';
            applyLaminateMaterials(selectedObject, selectedObject.userData.type, currentLam, e.target.value);
            setEmissive(selectedObject, 0x333333);
        });
    }
}

function deleteSelectedPart() {
    if (selectedObject) {
        cabinetGroup.remove(selectedObject);
        internalParts = internalParts.filter(p => p !== selectedObject && p.userData.parentGroup !== selectedObject);
        deselectObject();
    }
}

function applyLaminateMaterials(mesh, type, laminateConfig, edgeConfig) {
    const ply = new THREE.MeshPhongMaterial({ color: 0xdeb887, shininess: 10 });
    const liner = new THREE.MeshPhongMaterial({ color: 0xe5e7eb, shininess: 20 });
    const edgeBand = new THREE.MeshPhongMaterial({ color: 0xd1d5db, shininess: 15 });
    
    const materials = [
        ply.clone(), ply.clone(), ply.clone(), 
        ply.clone(), ply.clone(), ply.clone()
    ];
    
    if (laminateConfig === 'double') {
        if (type === 'shelf') { materials[2] = liner.clone(); materials[3] = liner.clone(); }
        else if (type === 'divider') { materials[0] = liner.clone(); materials[1] = liner.clone(); }
        else if (type === 'shutter') { materials[4] = liner.clone(); materials[5] = liner.clone(); }
    } else if (laminateConfig === 'single') {
        if (type === 'shelf') { materials[2] = liner.clone(); }
        else if (type === 'divider') { materials[1] = liner.clone(); }
        else if (type === 'shutter') { materials[5] = liner.clone(); }
    }
    
    if (edgeConfig === 'front') {
        if (type === 'shutter') materials[0] = edgeBand.clone();
        else materials[4] = edgeBand.clone();
    } else if (edgeConfig === 'all') {
        if (type === 'shelf') {
            materials[0] = edgeBand.clone(); materials[1] = edgeBand.clone(); materials[4] = edgeBand.clone(); materials[5] = edgeBand.clone();
        } else if (type === 'divider') {
            materials[2] = edgeBand.clone(); materials[3] = edgeBand.clone(); materials[4] = edgeBand.clone(); materials[5] = edgeBand.clone();
        } else if (type === 'shutter') {
            materials[0] = edgeBand.clone(); materials[1] = edgeBand.clone(); materials[2] = edgeBand.clone(); materials[3] = edgeBand.clone();
        }
    }
    
    mesh.material = materials;
}

function createPanel(w, h, d, colorHex, isInternal, type) {
    const geometry = new THREE.BoxGeometry(w, h, d);
    const mesh = new THREE.Mesh(geometry);
    
    if (isInternal) {
        mesh.userData = { type: type, w: w, h: h, d: d, customLaminate: 'double', customEdge: 'front' };
        applyLaminateMaterials(mesh, type, 'double', 'front');
        internalParts.push(mesh);
    } else {
        mesh.material = new THREE.MeshPhongMaterial({ color: colorHex, shininess: 12 });
        mesh.userData = { isShell: true, w: w, h: h, d: d };
        shellObjects.push(mesh);
    }

    const edgeGeo = new THREE.EdgesGeometry(geometry);
    const edgeMat = new THREE.LineBasicMaterial({ color: 0x5c4033, linewidth: 2 });
    const edges = new THREE.LineSegments(edgeGeo, edgeMat);
    mesh.add(edges);

    return mesh;
}

const CABINET_PRESETS = {
    'kitchen-set': {
        name: 'Modular Kitchen Set',
        mode: 'both',
        hIn: 32,
        wFt: 11,
        dFt: 2,
        plinthIn: 3,
        shelves: 2,
        dividers: 0,
        shutters: '4',
        wallHIn: 30,
        wallWFt: 11,
        wallDFt: 1,
        dadoGapIn: 22,
        wallShelves: 2,
        wallDividers: 0,
        wallShutters: '4'
    },
    'kitchen-base': {
        name: 'Kitchen Base Unit',
        mode: 'base',
        hIn: 32,
        wFt: 11,
        dFt: 2,
        plinthIn: 3,
        shelves: 2,
        dividers: 0,
        shutters: '4',
        wallHIn: 30,
        wallWFt: 11,
        wallDFt: 1,
        dadoGapIn: 22,
        wallShelves: 2,
        wallDividers: 0,
        wallShutters: '4'
    },
    'kitchen-wall': {
        name: 'Kitchen Wall Unit',
        mode: 'wall',
        hIn: 32,
        wFt: 11,
        dFt: 2,
        plinthIn: 3,
        shelves: 2,
        dividers: 0,
        shutters: '4',
        wallHIn: 30,
        wallWFt: 3,
        wallDFt: 1,
        dadoGapIn: 0,
        wallShelves: 2,
        wallDividers: 0,
        wallShutters: '2'
    },
    'wardrobe': {
        name: 'Full Height Wardrobe',
        mode: 'base',
        hIn: 84,
        wFt: 4,
        dFt: 2,
        plinthIn: 3,
        shelves: 3,
        dividers: 1,
        shutters: '2',
        wallHIn: 30,
        wallWFt: 4,
        wallDFt: 1,
        dadoGapIn: 0,
        wallShelves: 2,
        wallDividers: 0,
        wallShutters: '2'
    },
    'tv-console': {
        name: 'TV Media Console',
        mode: 'base',
        hIn: 20,
        wFt: 6,
        dFt: 1.5,
        plinthIn: 2,
        shelves: 1,
        dividers: 2,
        shutters: '2',
        wallHIn: 30,
        wallWFt: 6,
        wallDFt: 1,
        dadoGapIn: 0,
        wallShelves: 2,
        wallDividers: 0,
        wallShutters: '2'
    },
    'shoe-rack': {
        name: 'Shoe Rack Cabinet',
        mode: 'base',
        hIn: 36,
        wFt: 3,
        dFt: 1.25,
        plinthIn: 2,
        shelves: 4,
        dividers: 0,
        shutters: '2',
        wallHIn: 30,
        wallWFt: 3,
        wallDFt: 1,
        dadoGapIn: 0,
        wallShelves: 2,
        wallDividers: 0,
        wallShutters: '2'
    }
};

function setKitchenMode(mode) {
    currentKitchenMode = mode;
    
    // Update toggle buttons active state
    document.querySelectorAll('.module-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.mode === mode);
    });

    // Update section visibility
    const baseDimSec = document.getElementById('cad-base-dim-section');
    const wallDimSec = document.getElementById('cad-wall-dim-section');
    const basePartSec = document.getElementById('cad-base-part-section');
    const wallPartSec = document.getElementById('cad-wall-part-section');

    if (baseDimSec) baseDimSec.style.display = (mode === 'wall') ? 'none' : 'block';
    if (wallDimSec) {
        wallDimSec.style.display = (mode === 'base') ? 'none' : 'block';
        if (mode === 'wall') {
            wallDimSec.style.marginTop = '0';
            wallDimSec.style.paddingTop = '0';
            wallDimSec.style.borderTop = 'none';
        } else {
            wallDimSec.style.marginTop = '0.4rem';
            wallDimSec.style.paddingTop = '0.4rem';
            wallDimSec.style.borderTop = '1px dashed rgba(255,255,255,0.08)';
        }
    }
    
    if (basePartSec) basePartSec.style.display = (mode === 'wall') ? 'none' : 'block';
    if (wallPartSec) {
        wallPartSec.style.display = (mode === 'base') ? 'none' : 'block';
        if (mode === 'wall') {
            wallPartSec.style.marginTop = '0';
            wallPartSec.style.paddingTop = '0';
            wallPartSec.style.borderTop = 'none';
        } else {
            wallPartSec.style.marginTop = '0.4rem';
            wallPartSec.style.paddingTop = '0.4rem';
            wallPartSec.style.borderTop = '1px dashed rgba(255,255,255,0.08)';
        }
    }

    updateDimensionsFromInputs();
}

function updateDimensionsFromInputs() {
    // 1. Read Base Unit Inputs
    const hInput = document.getElementById('cad-h-in');
    const wInput = document.getElementById('cad-w-ft');
    const dInput = document.getElementById('cad-d-ft');
    const plinthInput = document.getElementById('cad-plinth-in');
    
    const hIn = hInput ? (parseFloat(hInput.value) || 32) : 32;
    const wFt = wInput ? (parseFloat(wInput.value) || 11) : 11;
    const dFt = dInput ? (parseFloat(dInput.value) || 2) : 2;
    const plinthIn = plinthInput ? (parseFloat(plinthInput.value) || 0) : 0;
    
    currentH = hIn;
    currentW = wFt * 12;
    currentD = dFt * 12;
    currentPlinth = plinthIn;
    currentThickness = 0.75;
    
    // Update Base Subtext Labels
    const hSub = document.getElementById('cad-h-sub');
    const wSub = document.getElementById('cad-w-sub');
    const dSub = document.getElementById('cad-d-sub');
    const plinthSub = document.getElementById('cad-plinth-sub');
    const summary = document.getElementById('cad-dim-summary');
    
    if (hSub) hSub.textContent = `~ ${hIn.toFixed(0)}" (${(hIn / 12).toFixed(2)} ft)`;
    if (wSub) wSub.textContent = `~ ${(wFt * 12).toFixed(0)}" (${wFt} ft)`;
    if (dSub) dSub.textContent = `~ ${(dFt * 12).toFixed(0)}" (${dFt} ft)`;
    if (plinthSub) plinthSub.textContent = `~ ${plinthIn.toFixed(0)}"`;
    if (summary) summary.textContent = `${hIn.toFixed(0)}" H × ${(wFt * 12).toFixed(0)}" W × ${(dFt * 12).toFixed(0)}" D`;

    // 2. Read Wall Unit Inputs
    const wallHInput = document.getElementById('cad-wall-h-in');
    const wallWInput = document.getElementById('cad-wall-w-ft');
    const wallDInput = document.getElementById('cad-wall-d-ft');
    const dadoGapInput = document.getElementById('cad-dado-gap-in');

    const wallHIn = wallHInput ? (parseFloat(wallHInput.value) || 30) : 30;
    const wallWFt = wallWInput ? (parseFloat(wallWInput.value) || 11) : 11;
    const wallDFt = wallDInput ? (parseFloat(wallDInput.value) || 1) : 1;
    const dadoGapIn = dadoGapInput ? (parseFloat(dadoGapInput.value) || 22) : 22;

    currentWallH = wallHIn;
    currentWallW = wallWFt * 12;
    currentWallD = wallDFt * 12;
    currentDadoGap = dadoGapIn;

    // Update Wall Subtext Labels
    const wallHSub = document.getElementById('cad-wall-h-sub');
    const wallWSub = document.getElementById('cad-wall-w-sub');
    const wallDSub = document.getElementById('cad-wall-d-sub');
    const dadoGapSub = document.getElementById('cad-dado-gap-sub');
    const wallSummary = document.getElementById('cad-wall-dim-summary');

    if (wallHSub) wallHSub.textContent = `~ ${wallHIn.toFixed(0)}" (${(wallHIn / 12).toFixed(2)} ft)`;
    if (wallWSub) wallWSub.textContent = `~ ${(wallWFt * 12).toFixed(0)}" (${wallWFt} ft)`;
    if (wallDSub) wallDSub.textContent = `~ ${(wallDFt * 12).toFixed(0)}" (${wallDFt} ft)`;
    if (dadoGapSub) dadoGapSub.textContent = `~ ${dadoGapIn.toFixed(0)}" (Dado)`;
    if (wallSummary) wallSummary.textContent = `${wallHIn.toFixed(0)}" H × ${(wallWFt * 12).toFixed(0)}" W × ${(wallDFt * 12).toFixed(0)}" D`;
    
    buildShell();
    syncPartitionsAndDoors();
}

function buildBoxShell(module, w, h, d, centerY, centerZ, labelPrefix) {
    const t = currentThickness;
    const innerW = w - (2 * t);
    const innerH = h - (2 * t);
    const shellColor = 0xcd853f; 

    // Left Side
    const left = createPanel(t, h, d, shellColor, false, 'side');
    left.position.set(-w/2 + t/2, centerY, centerZ);
    left.userData.label = `${labelPrefix} Left Side`;
    left.userData.module = module;
    left.userData.w = t; left.userData.h = h; left.userData.d = d;
    cabinetGroup.add(left);

    // Right Side
    const right = createPanel(t, h, d, shellColor, false, 'side');
    right.position.set(w/2 - t/2, centerY, centerZ);
    right.userData.label = `${labelPrefix} Right Side`;
    right.userData.module = module;
    right.userData.w = t; right.userData.h = h; right.userData.d = d;
    cabinetGroup.add(right);

    // Top
    const top = createPanel(innerW, t, d, shellColor, false, 'top');
    top.position.set(0, centerY + h/2 - t/2, centerZ);
    top.userData.label = `${labelPrefix} Top`;
    top.userData.module = module;
    top.userData.w = innerW; top.userData.h = t; top.userData.d = d;
    cabinetGroup.add(top);

    // Bottom
    const bot = createPanel(innerW, t, d, shellColor, false, 'bottom');
    bot.position.set(0, centerY - h/2 + t/2, centerZ);
    bot.userData.label = `${labelPrefix} Bottom`;
    bot.userData.module = module;
    bot.userData.w = innerW; bot.userData.h = t; bot.userData.d = d;
    cabinetGroup.add(bot);

    // Back Panel
    const back = createPanel(innerW, innerH, t, shellColor, false, 'back');
    back.position.set(0, centerY, centerZ - d/2 + t/2);
    back.userData.label = `${labelPrefix} Back Panel`;
    back.userData.module = module;
    back.userData.w = innerW; back.userData.h = innerH; back.userData.d = t;
    cabinetGroup.add(back);
}

function buildPlinth(w, d, plinth, labelPrefix) {
    if (plinth <= 0) return;
    const t = currentThickness;
    const plinthColor = 0x27272a;
    const kickRecess = 2; // 2" recessed toe kick
    const plinthY = plinth / 2;

    // Front kickboard
    const kickboard = createPanel(w - 2*t, plinth, t, plinthColor, false, 'plinth');
    kickboard.position.set(0, plinthY, d/2 - kickRecess - t/2);
    kickboard.userData.label = `${labelPrefix} Plinth Kickboard`;
    kickboard.userData.module = 'base';
    kickboard.userData.w = w - 2*t; kickboard.userData.h = plinth; kickboard.userData.d = t;
    cabinetGroup.add(kickboard);
    plinthObjects.push(kickboard);

    // Left plinth support
    const plinthL = createPanel(t, plinth, d - kickRecess, plinthColor, false, 'plinth');
    plinthL.position.set(-w/2 + t/2, plinthY, -kickRecess/2);
    plinthL.userData.label = `${labelPrefix} Plinth Side L`;
    plinthL.userData.module = 'base';
    plinthL.userData.w = t; plinthL.userData.h = plinth; plinthL.userData.d = d - kickRecess;
    cabinetGroup.add(plinthL);
    plinthObjects.push(plinthL);

    // Right plinth support
    const plinthR = createPanel(t, plinth, d - kickRecess, plinthColor, false, 'plinth');
    plinthR.position.set(w/2 - t/2, plinthY, -kickRecess/2);
    plinthR.userData.label = `${labelPrefix} Plinth Side R`;
    plinthR.userData.module = 'base';
    plinthR.userData.w = t; plinthR.userData.h = plinth; plinthR.userData.d = d - kickRecess;
    cabinetGroup.add(plinthR);
    plinthObjects.push(plinthR);
}

function buildDecor() {
    if (currentKitchenMode !== 'both') return;

    // 1. Sleek Countertop Slab (1.25" thick polished quartz/granite)
    const ctThick = 1.25;
    const ctW = currentW + 1.0;
    const ctD = currentD + 1.0;
    const ctY = getBaseTopY() + ctThick / 2;
    const ctZ = 0.5;

    const ctGeo = new THREE.BoxGeometry(ctW, ctThick, ctD);
    const ctMat = new THREE.MeshPhongMaterial({ color: 0x1e293b, shininess: 40 });
    const ctMesh = new THREE.Mesh(ctGeo, ctMat);
    ctMesh.position.set(0, ctY, ctZ);
    const ctEdge = new THREE.LineSegments(new THREE.EdgesGeometry(ctGeo), new THREE.LineBasicMaterial({ color: 0x475569 }));
    ctMesh.add(ctEdge);
    ctMesh.userData = { isDecor: true, label: "Granite/Quartz Countertop" };
    cabinetGroup.add(ctMesh);
    decorObjects.push(ctMesh);

    // 2. Dado Backsplash Panel
    if (currentDadoGap > 0) {
        const bsW = Math.max(currentW, currentWallW);
        const bsH = currentDadoGap;
        const bsD = 0.5;
        const bsY = getCountertopTopY() + bsH / 2;
        const bsZ = (-currentD / 2) + bsD / 2;

        const bsGeo = new THREE.BoxGeometry(bsW, bsH, bsD);
        const bsMat = new THREE.MeshPhongMaterial({ color: 0x334155, shininess: 20 });
        const bsMesh = new THREE.Mesh(bsGeo, bsMat);
        bsMesh.position.set(0, bsY, bsZ);
        const bsEdge = new THREE.LineSegments(new THREE.EdgesGeometry(bsGeo), new THREE.LineBasicMaterial({ color: 0x64748b }));
        bsMesh.add(bsEdge);
        bsMesh.userData = { isDecor: true, label: "Dado Backsplash Wall" };
        cabinetGroup.add(bsMesh);
        decorObjects.push(bsMesh);
    }
}

function updateCameraFraming() {
    let centerY = 0;
    let maxDim = 100;

    if (currentKitchenMode === 'both') {
        const totalH = getWallTopY();
        centerY = totalH / 2;
        const maxW = Math.max(currentW, currentWallW);
        maxDim = Math.max(maxW, totalH, currentD);
    } else if (currentKitchenMode === 'base') {
        const totalH = getBaseTopY();
        centerY = totalH / 2;
        maxDim = Math.max(currentW, totalH, currentD);
    } else {
        const totalH = currentWallH;
        centerY = totalH / 2;
        maxDim = Math.max(currentWallW, totalH, currentWallD);
    }

    camera.position.set(0, centerY + (maxDim * 0.35), maxDim * 1.55);
    orbit.target.set(0, centerY, 0);
    orbit.update();
}

function buildShell() {
    deselectObject();
    
    // Remove existing shells, plinths, and decor
    shellObjects.forEach(obj => cabinetGroup.remove(obj));
    shellObjects = [];
    plinthObjects.forEach(obj => cabinetGroup.remove(obj));
    plinthObjects = [];
    decorObjects.forEach(obj => cabinetGroup.remove(obj));
    decorObjects = [];

    if (currentKitchenMode === 'both') {
        buildBoxShell('base', currentW, currentH, currentD, getBaseCenterY(), 0, '[Base]');
        buildPlinth(currentW, currentD, currentPlinth, '[Base]');
        buildDecor();
        buildBoxShell('wall', currentWallW, currentWallH, currentWallD, getWallCenterY(), getWallCenterZ(), '[Wall]');
    } else if (currentKitchenMode === 'base') {
        buildBoxShell('base', currentW, currentH, currentD, getBaseCenterY(), 0, '[Base]');
        buildPlinth(currentW, currentD, currentPlinth, '[Base]');
    } else if (currentKitchenMode === 'wall') {
        buildBoxShell('wall', currentWallW, currentWallH, currentWallD, getWallCenterY(), 0, '[Wall]');
    }

    updateCameraFraming();
}

function cleanupInactiveParts() {
    if (currentKitchenMode === 'base') {
        const toRemove = cabinetGroup.children.filter(c => c.userData && c.userData.module === 'wall');
        toRemove.forEach(c => {
            cabinetGroup.remove(c);
            internalParts = internalParts.filter(p => p !== c && p.userData.parentGroup !== c);
        });
    } else if (currentKitchenMode === 'wall') {
        const toRemove = cabinetGroup.children.filter(c => c.userData && c.userData.module === 'base');
        toRemove.forEach(c => {
            cabinetGroup.remove(c);
            internalParts = internalParts.filter(p => p !== c && p.userData.parentGroup !== c);
        });
    }
}

function syncPartitionsAndDoors() {
    cleanupInactiveParts();

    if (currentKitchenMode === 'base' || currentKitchenMode === 'both') {
        syncShelvesFromCount('base');
        syncDividersFromCount('base');
        syncShuttersFromSelect('base');
    }
    
    if (currentKitchenMode === 'wall' || currentKitchenMode === 'both') {
        syncShelvesFromCount('wall');
        syncDividersFromCount('wall');
        syncShuttersFromSelect('wall');
    }
}

function syncShelvesFromCount(module) {
    const inputId = (module === 'wall') ? 'cad-wall-shelves-count' : 'cad-shelves-count';
    const input = document.getElementById(inputId);
    if (!input) return;
    const count = parseInt(input.value) || 0;
    
    // Remove existing auto shelves for this module
    const toRemove = [];
    internalParts.forEach(part => {
        if (part.userData && part.userData.isAutoShelf && part.userData.module === module) {
            toRemove.push(part);
        }
    });
    toRemove.forEach(part => {
        cabinetGroup.remove(part);
        internalParts = internalParts.filter(p => p !== part);
    });
    
    if (count <= 0) return;
    
    const t = currentThickness;
    const isWall = (module === 'wall');
    const w = isWall ? currentWallW : currentW;
    const h = isWall ? currentWallH : currentH;
    const d = isWall ? currentWallD : currentD;
    
    const innerW = w - (2 * t);
    const innerH = h - (2 * t);
    const shelfDepth = d - 1.0;
    const shelfColor = 0xdeb887;
    const prefix = isWall ? '[Wall]' : '[Base]';

    const innerBottomY = isWall ? (getWallBottomY() + t) : (getBaseBottomY() + t);
    const centerZ = isWall ? (getWallCenterZ() - 0.5) : -0.5;
    const spacing = innerH / (count + 1);
    
    for (let i = 1; i <= count; i++) {
        const shelf = createPanel(innerW, t, shelfDepth, shelfColor, true, 'shelf');
        shelf.position.set(0, innerBottomY + (i * spacing), centerZ);
        shelf.userData.label = `${prefix} Shelf ${i}`;
        shelf.userData.isAutoShelf = true;
        shelf.userData.module = module;
        cabinetGroup.add(shelf);
    }
}

function syncDividersFromCount(module) {
    const inputId = (module === 'wall') ? 'cad-wall-dividers-count' : 'cad-dividers-count';
    const input = document.getElementById(inputId);
    if (!input) return;
    const count = parseInt(input.value) || 0;
    
    // Remove existing auto dividers for this module
    const toRemove = [];
    internalParts.forEach(part => {
        if (part.userData && part.userData.isAutoDivider && part.userData.module === module) {
            toRemove.push(part);
        }
    });
    toRemove.forEach(part => {
        cabinetGroup.remove(part);
        internalParts = internalParts.filter(p => p !== part);
    });
    
    if (count <= 0) return;
    
    const t = currentThickness;
    const isWall = (module === 'wall');
    const w = isWall ? currentWallW : currentW;
    const h = isWall ? currentWallH : currentH;
    const d = isWall ? currentWallD : currentD;
    
    const innerW = w - (2 * t);
    const innerH = h - (2 * t);
    const divDepth = d - 1.0;
    const divColor = 0xdeb887;
    const prefix = isWall ? '[Wall]' : '[Base]';

    const centerY = isWall ? getWallCenterY() : getBaseCenterY();
    const centerZ = isWall ? (getWallCenterZ() - 0.5) : -0.5;
    
    const spacing = innerW / (count + 1);
    const startX = -innerW / 2;
    
    for (let i = 1; i <= count; i++) {
        const divider = createPanel(t, innerH, divDepth, divColor, true, 'divider');
        divider.position.set(startX + (i * spacing), centerY, centerZ);
        divider.userData.label = `${prefix} Vertical Divider ${i}`;
        divider.userData.isAutoDivider = true;
        divider.userData.module = module;
        cabinetGroup.add(divider);
    }
}

function syncShuttersFromSelect(module) {
    const selectId = (module === 'wall') ? 'cad-wall-shutter-select' : 'cad-shutter-select';
    const shutterSelect = document.getElementById(selectId);
    if (!shutterSelect) return;
    const count = parseInt(shutterSelect.value) || 0;
    
    // Remove existing shutters and auto-hinge partitions for this module
    const toRemove = [];
    cabinetGroup.children.forEach(child => {
        if (child.userData && child.userData.module === module && (child.userData.type === 'shutter' || child.userData.isAutoHingePartition)) {
            toRemove.push(child);
        }
    });
    toRemove.forEach(child => {
        cabinetGroup.remove(child);
        internalParts = internalParts.filter(p => p !== child);
    });
    
    if (count <= 0) return;
    
    const isWall = (module === 'wall');
    const w = isWall ? currentWallW : currentW;
    const h = isWall ? currentWallH : currentH;
    const d = isWall ? currentWallD : currentD;
    const prefix = isWall ? '[Wall]' : '[Base]';

    const gap = 0.125; // 1/8 inch reveal
    const totalGapSpace = gap * (count + 1);
    const shutterW = (w - totalGapSpace) / count;
    const shutterH = h - (gap * 2);
    const shutterD = 0.75; // Standard 3/4" door
    
    let startX = (-w / 2) + gap + (shutterW / 2);
    const centerY = isWall ? getWallCenterY() : getBaseCenterY();
    const centerZ = isWall ? getWallCenterZ() : 0;
    const frontZ = centerZ + (d / 2) + (shutterD / 2) + 0.05;
    
    for (let i = 0; i < count; i++) {
        const shutter = createPanel(shutterW, shutterH, shutterD, 0xdeb887, true, 'shutter');
        shutter.userData.label = `${prefix} Shutter ${i + 1}`;
        shutter.userData.module = module;
        shutter.userData.customEdge = 'all';
        shutter.userData.customLaminate = 'single';
        applyLaminateMaterials(shutter, 'shutter', 'single', 'all');
        
        let isRightHinged = (i % 2 === 1);
        if (count === 1) isRightHinged = false;
        
        shutter.geometry.translate(isRightHinged ? -shutterW/2 : shutterW/2, 0, -shutterD/2);
        shutter.children.forEach(c => {
            if (c.geometry) c.geometry.translate(isRightHinged ? -shutterW/2 : shutterW/2, 0, -shutterD/2);
        });

        shutter.position.set(isRightHinged ? startX + shutterW/2 : startX - shutterW/2, centerY, frontZ + shutterD/2);
        shutter.userData.closedRotationY = 0;
        shutter.userData.openRotationY = isRightHinged ? Math.PI / 2 : -Math.PI / 2;
        
        shutter.userData.lockZ = true; 
        shutter.userData.lockX = true;
        shutter.userData.lockY = true;

        if (shuttersOpen) {
            shutter.rotation.y = shutter.userData.openRotationY;
            shutter.layers.set(1);
        }
        
        cabinetGroup.add(shutter);
        
        // Auto hinge partition between door pairs
        if (i % 2 === 1 && i < count - 1) {
            const gapCenterX = startX + (shutterW / 2) + (gap / 2);
            const t = currentThickness;
            const innerH = h - (2 * t);
            const divDepth = d - 1.0; 
            
            const divider = createPanel(t, innerH, divDepth, 0xdeb887, true, 'divider');
            divider.position.set(gapCenterX, centerY, isWall ? (getWallCenterZ() - 0.5) : -0.5);
            divider.userData.label = `${prefix} Auto Hinge Partition`;
            divider.userData.isAutoHingePartition = true;
            divider.userData.module = module;
            cabinetGroup.add(divider);
        }
        
        startX += shutterW + gap;
    }
}

function applyPreset(presetKey) {
    const preset = CABINET_PRESETS[presetKey];
    if (!preset) return;
    
    document.querySelectorAll('.preset-pill').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.preset === presetKey);
    });
    
    const nameInput = document.getElementById('cab-preset-name');
    const hInput = document.getElementById('cad-h-in');
    const wInput = document.getElementById('cad-w-ft');
    const dInput = document.getElementById('cad-d-ft');
    const plinthInput = document.getElementById('cad-plinth-in');
    const shelvesInput = document.getElementById('cad-shelves-count');
    const dividersInput = document.getElementById('cad-dividers-count');
    const shutterSelect = document.getElementById('cad-shutter-select');

    const wallHInput = document.getElementById('cad-wall-h-in');
    const wallWInput = document.getElementById('cad-wall-w-ft');
    const wallDInput = document.getElementById('cad-wall-d-ft');
    const dadoGapInput = document.getElementById('cad-dado-gap-in');
    const wallShelvesInput = document.getElementById('cad-wall-shelves-count');
    const wallDividersInput = document.getElementById('cad-wall-dividers-count');
    const wallShutterSelect = document.getElementById('cad-wall-shutter-select');
    
    if (nameInput) nameInput.value = preset.name;
    if (hInput) hInput.value = preset.hIn;
    if (wInput) wInput.value = preset.wFt;
    if (dInput) dInput.value = preset.dFt;
    if (plinthInput) plinthInput.value = preset.plinthIn;
    if (shelvesInput) shelvesInput.value = preset.shelves;
    if (dividersInput) dividersInput.value = preset.dividers;
    if (shutterSelect) shutterSelect.value = preset.shutters;

    if (wallHInput && preset.wallHIn !== undefined) wallHInput.value = preset.wallHIn;
    if (wallWInput && preset.wallWFt !== undefined) wallWInput.value = preset.wallWFt;
    if (wallDInput && preset.wallDFt !== undefined) wallDInput.value = preset.wallDFt;
    if (dadoGapInput && preset.dadoGapIn !== undefined) dadoGapInput.value = preset.dadoGapIn;
    if (wallShelvesInput && preset.wallShelves !== undefined) wallShelvesInput.value = preset.wallShelves;
    if (wallDividersInput && preset.wallDividers !== undefined) wallDividersInput.value = preset.wallDividers;
    if (wallShutterSelect && preset.wallShutters !== undefined) wallShutterSelect.value = preset.wallShutters;
    
    setKitchenMode(preset.mode || 'both');
}

function setupCADListeners() {
    // Module Mode Buttons (Base Only / Base + Wall / Wall Only)
    document.querySelectorAll('.module-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const mode = btn.dataset.mode;
            setKitchenMode(mode);
            document.querySelectorAll('.preset-pill').forEach(p => {
                if (mode === 'both') p.classList.toggle('active', p.dataset.preset === 'kitchen-set');
                else if (mode === 'base') p.classList.toggle('active', p.dataset.preset === 'kitchen-base');
                else if (mode === 'wall') p.classList.toggle('active', p.dataset.preset === 'kitchen-wall');
            });
        });
    });

    // Base Unit Dimensions
    ['cad-h-in', 'cad-w-ft', 'cad-d-ft', 'cad-plinth-in'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('input', updateDimensionsFromInputs);
    });
    
    // Wall Unit Dimensions
    ['cad-wall-h-in', 'cad-wall-w-ft', 'cad-wall-d-ft', 'cad-dado-gap-in'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('input', updateDimensionsFromInputs);
    });

    // Base Partitions
    const shelvesInput = document.getElementById('cad-shelves-count');
    if (shelvesInput) shelvesInput.addEventListener('input', () => syncShelvesFromCount('base'));
    
    const divInput = document.getElementById('cad-dividers-count');
    if (divInput) divInput.addEventListener('input', () => syncDividersFromCount('base'));
    
    const shutterSelect = document.getElementById('cad-shutter-select');
    if (shutterSelect) shutterSelect.addEventListener('change', () => syncShuttersFromSelect('base'));

    // Wall Partitions
    const wallShelvesInput = document.getElementById('cad-wall-shelves-count');
    if (wallShelvesInput) wallShelvesInput.addEventListener('input', () => syncShelvesFromCount('wall'));
    
    const wallDivInput = document.getElementById('cad-wall-dividers-count');
    if (wallDivInput) wallDivInput.addEventListener('input', () => syncDividersFromCount('wall'));
    
    const wallShutterSelect = document.getElementById('cad-wall-shutter-select');
    if (wallShutterSelect) wallShutterSelect.addEventListener('change', () => syncShuttersFromSelect('wall'));
    
    // Preset Buttons
    document.querySelectorAll('.preset-pill').forEach(btn => {
        btn.addEventListener('click', () => applyPreset(btn.dataset.preset));
    });
    
    // Duplicate Cabinet Button
    const dupBtn = document.getElementById('btn-duplicate-cab');
    if (dupBtn) {
        dupBtn.addEventListener('click', () => {
            const qtyInput = document.getElementById('cab-preset-qty');
            if (qtyInput) {
                qtyInput.value = (parseInt(qtyInput.value) || 1) + 1;
                qtyInput.style.transform = 'scale(1.2)';
                setTimeout(() => { qtyInput.style.transform = 'scale(1)'; }, 200);
            }
        });
    }
    
    // Action Buttons
    const toggleDoorsBtn = document.getElementById('btn-toggle-shutters');
    if (toggleDoorsBtn) toggleDoorsBtn.addEventListener('click', toggleShutters);
    
    const addDrawerBtn = document.getElementById('btn-add-drawer-quick');
    if (addDrawerBtn) addDrawerBtn.addEventListener('click', () => addDrawer('full'));
    
    const deleteBtn = document.getElementById('btn-delete-selected');
    if (deleteBtn) deleteBtn.addEventListener('click', deleteSelectedPart);
}

function addShelf(module) {
    const targetModule = module || (selectedObject ? selectedObject.userData.module : (currentKitchenMode === 'wall' ? 'wall' : 'base'));
    const isWall = (targetModule === 'wall');
    const t = currentThickness;
    const w = isWall ? currentWallW : currentW;
    const d = isWall ? currentWallD : currentD;
    const innerW = w - (2 * t);
    const shelfDepth = d - 1.0; 
    const prefix = isWall ? '[Wall]' : '[Base]';
    const centerY = isWall ? getWallCenterY() : getBaseCenterY();
    const centerZ = isWall ? (getWallCenterZ() - 0.5) : -0.5;
    
    const shelf = createPanel(innerW, t, shelfDepth, 0xdeb887, true, 'shelf');
    shelf.position.set(0, centerY, centerZ);
    shelf.userData.label = `${prefix} Shelf ${partCounter++}`;
    shelf.userData.module = targetModule;
    
    cabinetGroup.add(shelf);
    selectObject(shelf);
}

function addDivider(module) {
    const targetModule = module || (selectedObject ? selectedObject.userData.module : (currentKitchenMode === 'wall' ? 'wall' : 'base'));
    const isWall = (targetModule === 'wall');
    const t = currentThickness;
    const h = isWall ? currentWallH : currentH;
    const d = isWall ? currentWallD : currentD;
    const innerH = h - (2 * t);
    const divDepth = d - 1.0; 
    const prefix = isWall ? '[Wall]' : '[Base]';
    const centerY = isWall ? getWallCenterY() : getBaseCenterY();
    const centerZ = isWall ? (getWallCenterZ() - 0.5) : -0.5;
    
    const divider = createPanel(t, innerH, divDepth, 0xdeb887, true, 'divider');
    divider.position.set(0, centerY, centerZ);
    divider.userData.label = `${prefix} Vertical Divider ${partCounter++}`;
    divider.userData.module = targetModule;
    
    cabinetGroup.add(divider);
    selectObject(divider);
}

function addDrawer(sizeType) {
    if (currentKitchenMode === 'wall') {
        alert("Drawers are placed inside Base cabinets. Please switch to Base or Base + Wall mode.");
        return;
    }
    const t = currentThickness;
    const gap = 0.5; // standard 1/2" slide clearance per side
    const totalGap = gap * 2;
    const innerW = currentW - (2 * t);
    
    let drawerW = innerW - totalGap;
    let posX = 0;
    if (sizeType === 'half') {
        const usableHalfSpace = (innerW / 2) - (t / 2);
        drawerW = usableHalfSpace - totalGap;
        posX = -(innerW / 4) - (t / 4);
    }
    
    const drawerH = 8.0; // standard 8" drawer height
    const drawerD = currentD - 2.0;
    const colorHex = 0xdeb887;
    
    const group = new THREE.Group();
    const dInnerW = drawerW - (2 * t);
    const dInnerD = drawerD - (2 * t);

    const material = new THREE.MeshPhongMaterial({ color: colorHex, shininess: 10 });
    const edgeMat = new THREE.LineBasicMaterial({ color: 0x5c4033, linewidth: 2 });

    const makeSubPanel = (w, h, d, px, py, pz, label) => {
        const geo = new THREE.BoxGeometry(w, h, d);
        const mesh = new THREE.Mesh(geo, material);
        mesh.add(new THREE.LineSegments(new THREE.EdgesGeometry(geo), edgeMat));
        mesh.position.set(px, py, pz);
        mesh.userData = { isSubPart: true, w: w, h: h, d: d, label: label, module: 'base' };
        group.add(mesh);
    };

    const labelPrefix = `[Base] Drw ${partCounter++}`;

    makeSubPanel(t, drawerH, drawerD, -drawerW/2 + t/2, 0, 0, `${labelPrefix} Side L`);
    makeSubPanel(t, drawerH, drawerD, drawerW/2 - t/2, 0, 0, `${labelPrefix} Side R`);
    makeSubPanel(dInnerW, drawerH, t, 0, 0, drawerD/2 - t/2, `${labelPrefix} Front Inner`);
    makeSubPanel(dInnerW, drawerH, t, 0, 0, -drawerD/2 + t/2, `${labelPrefix} Back`);
    makeSubPanel(drawerW, t, drawerD, 0, -drawerH/2 + t/2, 0, `${labelPrefix} Bottom`);
    makeSubPanel(drawerW + 0.5, drawerH + 1, t, 0, 0, drawerD/2 + t/2, `${labelPrefix} Fascia`);

    // HitBox for raycasting
    const hitBoxGeo = new THREE.BoxGeometry(drawerW + 0.5, drawerH + 1, drawerD + t);
    const hitBoxMat = new THREE.MeshBasicMaterial({ visible: false });
    const hitBox = new THREE.Mesh(hitBoxGeo, hitBoxMat);
    group.add(hitBox);
    
    hitBox.userData = { type: 'drawer', label: `${labelPrefix} Assembly`, parentGroup: group, module: 'base' };
    internalParts.push(hitBox);

    group.userData = { isDrawerGroup: true, module: 'base' };
    group.position.set(posX, getBaseCenterY(), 0);
    
    cabinetGroup.add(group);
    selectObject(hitBox);
}

function toggleShutters() {
    shuttersOpen = !shuttersOpen;
    cabinetGroup.children.forEach(child => {
        if (child.userData && child.userData.type === 'shutter') {
            child.rotation.y = shuttersOpen ? child.userData.openRotationY : child.userData.closedRotationY;
            child.layers.set(shuttersOpen ? 1 : 0);
        }
    });
}

function start3DApp() {
    if (!is3DInitialized) init3D();
    resize3D();
    setTimeout(resize3D, 50);
    setTimeout(resize3D, 150);
    setTimeout(resize3D, 350);
    setTimeout(resize3D, 800);
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start3DApp);
} else {
    start3DApp();
}
window.addEventListener('load', start3DApp);
