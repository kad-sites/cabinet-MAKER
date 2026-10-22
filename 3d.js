let scene, camera, renderer, orbit, transformControl, raycaster, mouse;
let cabinetGroup;
let is3DInitialized = false;
let selectedObject = null;
let currentThickness = 0.75;
let currentW = 132, currentH = 32, currentD = 24, currentPlinth = 3, currentR = 0;
let shellObjects = [];
let plinthObjects = [];
let internalParts = [];
let partCounter = 1;

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
    camera.position.set(0, 50, 120);

    // Renderer setup
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    container.appendChild(renderer.domElement);

    // Orbit Controls
    orbit = new THREE.OrbitControls(camera, renderer.domElement);
    orbit.enableDamping = false; // Disabled "fluidic" glide for precise CAD feel
    orbit.maxPolarAngle = Math.PI / 2 + 0.1; // Prevent camera from going completely underneath the floor
    orbit.minDistance = 10;
    orbit.maxDistance = 500;

    // Transform Controls (for dragging)
    transformControl = new THREE.TransformControls(camera, renderer.domElement);
    transformControl.addEventListener('dragging-changed', function (event) {
        orbit.enabled = !event.value; // Disable orbit while dragging
    });
    scene.add(transformControl);

    // Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);
    const dirLight = new THREE.DirectionalLight(0xffffff, 0.6);
    dirLight.position.set(50, 100, 50);
    scene.add(dirLight);

    cabinetGroup = new THREE.Group();
    scene.add(cabinetGroup);

    // Raycaster for Selection
    raycaster = new THREE.Raycaster();
    mouse = new THREE.Vector2();

    renderer.domElement.addEventListener('pointerdown', onPointerDown);

    // Resize
    window.addEventListener('resize', resize3D);

    // Property Inspector Setup
    setupInspector();

    // Attach CAD UI listeners
    setupCADListeners();

    is3DInitialized = true;
    
    // Initial Shell and Partitions
    updateDimensionsFromInputs();
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
    
    // Only show for Y-axis or X-axis moving things
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

    if (type === 'divider') {
        const objX = selectedObject.position.x;
        const w = selectedObject.geometry.parameters.width;
        
        const leftSurface = objX - (w / 2);
        const rightSurface = objX + (w / 2);
        
        const cabInnerLeft = -currentW / 2 + currentThickness;
        const cabInnerRight = currentW / 2 - currentThickness;
        
        const distLeft = (leftSurface - cabInnerLeft).toFixed(1);
        const distRight = (cabInnerRight - rightSurface).toFixed(1);

        const pos = new THREE.Vector3();
        selectedObject.getWorldPosition(pos);
        pos.z += currentD / 2; // Move to front edge

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
            h = hitBox.geometry.parameters.height;
        } else {
            h = selectedObject.geometry.parameters.height;
        }
        
        const topSurface = objY + (h / 2);
        const bottomSurface = objY - (h / 2);
        
        const cabInnerTop = currentH / 2 - currentThickness;
        const cabInnerBottom = -currentH / 2 + currentThickness;
        
        const distTop = (cabInnerTop - topSurface).toFixed(1);
        const distBottom = (bottomSurface - cabInnerBottom).toFixed(1);

        const pos = new THREE.Vector3();
        selectedObject.getWorldPosition(pos);
        pos.z += currentD / 2; 

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
    // Only intersect layer 0 (visible items)
    raycaster.layers.set(0);

    const hitControls = raycaster.intersectObject(transformControl, true);
    if (hitControls.length > 0 && transformControl.axis !== null) return;
    
    const intersects = raycaster.intersectObjects(internalParts, false);

    if (intersects.length > 0) {
        const object = intersects[0].object;
        
        // For groups (like drawers), the hitBox holds the parent group reference
        const targetObj = object.userData.parentGroup ? object.userData.parentGroup : object;

        // If we clicked a NEW object, select it. If we clicked the ALREADY selected object, do nothing (keep it selected).
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
    
    // For groups (like drawers), the hitBox holds the parent group reference
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
    
    // Populate Property Inspector
    populateInspector(selectedObject);
}

function deselectObject() {
    if (selectedObject) {
        transformControl.detach();
        setEmissive(selectedObject, 0x000000); // Reset color
        selectedObject = null;
        
        // Hide Property Inspector
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
    
    // Fallbacks
    let name = obj.userData.label || "Cabinet Part";
    let thickness = currentThickness;
    let laminate = obj.userData.customLaminate || "double"; // Default everything to double sided except shell maybe
    let edge = obj.userData.customEdge || "front"; // Default to front edge banded
    
    if (obj.userData.isDrawerGroup) {
        name = "Drawer Assembly";
        thickEl.disabled = true; // Hard to dynamically rebuild drawer thickness in real-time, disable for now
    } else {
        thickEl.disabled = false;
        if (obj.userData.customThickness) {
            thickness = obj.userData.customThickness;
        } else {
            // Infer thickness from geometry
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
        
        // Dynamically rebuild geometry
        const type = selectedObject.userData.type;
        let w = selectedObject.geometry.parameters.width;
        let h = selectedObject.geometry.parameters.height;
        let d = selectedObject.geometry.parameters.depth;
        
        if (type === 'shelf') h = newT;
        if (type === 'divider') w = newT;
        
        const geo = new THREE.BoxGeometry(w, h, d);
        selectedObject.geometry.dispose();
        selectedObject.geometry = geo;
        
        // Update Edge lines
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
        
        // Re-apply emissive glow so it doesn't disappear when material changes
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
        // Remove from internalParts (either the object itself, or its hitBox)
        internalParts = internalParts.filter(p => p !== selectedObject && p.userData.parentGroup !== selectedObject);
        deselectObject();
    }
}

function applyLaminateMaterials(mesh, type, laminateConfig, edgeConfig) {
    const ply = new THREE.MeshPhongMaterial({ color: 0xdeb887, shininess: 10 });
    const liner = new THREE.MeshPhongMaterial({ color: 0xe5e7eb, shininess: 20 });
    const edgeBand = new THREE.MeshPhongMaterial({ color: 0xd1d5db, shininess: 15 }); // slightly darker grey for edge band
    
    const materials = [
        ply.clone(), ply.clone(), ply.clone(), 
        ply.clone(), ply.clone(), ply.clone()
    ];
    
    // Order of BoxGeometry faces: 0:+x, 1:-x, 2:+y, 3:-y, 4:+z, 5:-z
    // Top/Bottom (or Left/Right) Laminate
    if (laminateConfig === 'double') {
        if (type === 'shelf') { materials[2] = liner.clone(); materials[3] = liner.clone(); }
        else if (type === 'divider') { materials[0] = liner.clone(); materials[1] = liner.clone(); }
        else if (type === 'shutter') { materials[4] = liner.clone(); materials[5] = liner.clone(); }
    } else if (laminateConfig === 'single') {
        if (type === 'shelf') { materials[2] = liner.clone(); } // Top
        else if (type === 'divider') { materials[1] = liner.clone(); } // Left
        else if (type === 'shutter') { materials[5] = liner.clone(); } // Back (Inner Liner)
    }
    
    // Edge Banding
    if (edgeConfig === 'front') {
        if (type === 'shutter') materials[0] = edgeBand.clone(); // Arbitrary edge for shutter if 'front' is chosen
        else materials[4] = edgeBand.clone(); // +z face is front
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
        mesh.material = new THREE.MeshPhongMaterial({ color: colorHex, shininess: 10 });
        mesh.userData = { isShell: true, w: w, h: h, d: d };
        shellObjects.push(mesh);
    }

    const edgeGeo = new THREE.EdgesGeometry(geometry);
    const edgeMat = new THREE.LineBasicMaterial({ color: 0x5c4033, linewidth: 2 });
    const edges = new THREE.LineSegments(edgeGeo, edgeMat);
    mesh.add(edges);

    return mesh;
}

function createRoundedShell(w, h, d, t, r, colorHex, flags) {
    const shape = new THREE.Shape();
    
    // Outer boundary
    const ow = w; const oh = h;
    
    if (flags.bl) shape.moveTo(-ow/2 + r, -oh/2);
    else shape.moveTo(-ow/2, -oh/2);
    
    if (flags.br) {
        shape.lineTo(ow/2 - r, -oh/2);
        shape.quadraticCurveTo(ow/2, -oh/2, ow/2, -oh/2 + r);
    } else {
        shape.lineTo(ow/2, -oh/2);
    }
    
    if (flags.tr) {
        shape.lineTo(ow/2, oh/2 - r);
        shape.quadraticCurveTo(ow/2, oh/2, ow/2 - r, oh/2);
    } else {
        shape.lineTo(ow/2, oh/2);
    }
    
    if (flags.tl) {
        shape.lineTo(-ow/2 + r, oh/2);
        shape.quadraticCurveTo(-ow/2, oh/2, -ow/2, oh/2 - r);
    } else {
        shape.lineTo(-ow/2, oh/2);
    }
    
    if (flags.bl) {
        shape.lineTo(-ow/2, -oh/2 + r);
        shape.quadraticCurveTo(-ow/2, -oh/2, -ow/2 + r, -oh/2);
    } else {
        shape.lineTo(-ow/2, -oh/2);
    }

    // Inner hole
    const holePath = new THREE.Path();
    const iw = w - 2*t; const ih = h - 2*t;
    const ir = Math.max(0, r - t);
    
    if (flags.bl && ir > 0) holePath.moveTo(-iw/2 + ir, -ih/2);
    else holePath.moveTo(-iw/2, -ih/2);
    
    if (flags.br && ir > 0) {
        holePath.lineTo(iw/2 - ir, -ih/2);
        holePath.quadraticCurveTo(iw/2, -ih/2, iw/2, -ih/2 + ir);
    } else {
        holePath.lineTo(iw/2, -ih/2);
    }
    
    if (flags.tr && ir > 0) {
        holePath.lineTo(iw/2, ih/2 - ir);
        holePath.quadraticCurveTo(iw/2, ih/2, iw/2 - ir, ih/2);
    } else {
        holePath.lineTo(iw/2, ih/2);
    }
    
    if (flags.tl && ir > 0) {
        holePath.lineTo(-iw/2 + ir, ih/2);
        holePath.quadraticCurveTo(-iw/2, ih/2, -iw/2, ih/2 - ir);
    } else {
        holePath.lineTo(-iw/2, ih/2);
    }
    
    if (flags.bl && ir > 0) {
        holePath.lineTo(-iw/2, -ih/2 + ir);
        holePath.quadraticCurveTo(-iw/2, -ih/2, -iw/2 + ir, -ih/2);
    } else {
        holePath.lineTo(-iw/2, -ih/2);
    }
    
    shape.holes.push(holePath);

    const extrudeSettings = {
        depth: d,
        bevelEnabled: false,
        curveSegments: 12
    };

    const geometry = new THREE.ExtrudeGeometry(shape, extrudeSettings);
    geometry.translate(0, 0, -d/2);
    
    const material = new THREE.MeshPhongMaterial({ color: colorHex, shininess: 10 });
    const mesh = new THREE.Mesh(geometry, material);
    
    const edgeGeo = new THREE.EdgesGeometry(geometry, 20);
    const edgeMat = new THREE.LineBasicMaterial({ color: 0x5c4033, linewidth: 2 });
    const edges = new THREE.LineSegments(edgeGeo, edgeMat);
    mesh.add(edges);

    // Store data to be mathematically exploded into standard rectangular flat parts for cut list
    mesh.userData = { isComplexShell: true, w: w, h: h, d: d, t: t };
    shellObjects.push(mesh);
    return mesh;
}

const CABINET_PRESETS = {
    'kitchen-base': {
        name: 'Kitchen Base Unit',
        hIn: 32,
        wFt: 11,
        dFt: 2,
        plinthIn: 3,
        shelves: 2,
        dividers: 0,
        shutters: '2'
    },
    'wardrobe': {
        name: 'Full Height Wardrobe',
        hIn: 84,
        wFt: 4,
        dFt: 2,
        plinthIn: 3,
        shelves: 3,
        dividers: 1,
        shutters: '2'
    },
    'kitchen-wall': {
        name: 'Kitchen Wall Unit',
        hIn: 30,
        wFt: 3,
        dFt: 1,
        plinthIn: 0,
        shelves: 2,
        dividers: 0,
        shutters: '2'
    },
    'tv-console': {
        name: 'TV Media Console',
        hIn: 20,
        wFt: 6,
        dFt: 1.5,
        plinthIn: 2,
        shelves: 1,
        dividers: 2,
        shutters: '2'
    },
    'shoe-rack': {
        name: 'Shoe Rack Cabinet',
        hIn: 36,
        wFt: 3,
        dFt: 1.25,
        plinthIn: 2,
        shelves: 4,
        dividers: 0,
        shutters: '2'
    }
};

function updateDimensionsFromInputs() {
    const hInput = document.getElementById('cad-h-in');
    const wInput = document.getElementById('cad-w-ft');
    const dInput = document.getElementById('cad-d-ft');
    const plinthInput = document.getElementById('cad-plinth-in');
    
    if (!hInput || !wInput || !dInput) return;
    
    const hIn = parseFloat(hInput.value) || 32;
    const wFt = parseFloat(wInput.value) || 11;
    const dFt = parseFloat(dInput.value) || 2;
    const plinthIn = plinthInput ? (parseFloat(plinthInput.value) || 0) : 0;
    
    currentH = hIn;
    currentW = wFt * 12; // feet to inches
    currentD = dFt * 12; // feet to inches
    currentPlinth = plinthIn;
    currentThickness = 0.75;
    
    // Update subtext labels
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
    
    buildShell();
    syncPartitionsAndDoors();
}

function buildShell() {
    deselectObject();
    
    // Remove old shell and plinth
    shellObjects.forEach(obj => cabinetGroup.remove(obj));
    shellObjects = [];
    plinthObjects.forEach(obj => cabinetGroup.remove(obj));
    plinthObjects = [];

    const t = currentThickness;
    const w = currentW;
    const h = currentH;
    const d = currentD;
    const plinth = currentPlinth;
    const innerW = w - (2 * t);
    const innerH = h - (2 * t);
    
    const shellColor = 0xcd853f; 

    // Standard sharp 5-piece shell
    const left = createPanel(t, h, d, shellColor, false, 'side');
    left.position.set(-w/2 + t/2, 0, 0);
    left.userData.label = "Left Side";
    cabinetGroup.add(left);

    const right = createPanel(t, h, d, shellColor, false, 'side');
    right.position.set(w/2 - t/2, 0, 0);
    right.userData.label = "Right Side";
    cabinetGroup.add(right);
    
    const top = createPanel(innerW, t, d, shellColor, false, 'top');
    top.position.set(0, h/2 - t/2, 0);
    top.userData.label = "Top";
    cabinetGroup.add(top);

    const bot = createPanel(innerW, t, d, shellColor, false, 'bottom');
    bot.position.set(0, -h/2 + t/2, 0);
    bot.userData.label = "Bottom";
    cabinetGroup.add(bot);

    // Back Panel (recessed inside the box)
    const back = createPanel(innerW, innerH, t, shellColor, false, 'back');
    back.position.set(0, 0, -d/2 + t/2);
    back.userData.label = "Back Panel";
    cabinetGroup.add(back);

    // Render Plinth / Skirting kickboard if plinth > 0
    if (plinth > 0) {
        const plinthColor = 0x27272a; // dark kickboard
        const kickRecess = 2; // 2" recessed toe kick
        const plinthY = -h/2 - plinth/2;
        
        // Front kickboard
        const kickboard = createPanel(w - 2*t, plinth, t, plinthColor, false, 'plinth');
        kickboard.position.set(0, plinthY, d/2 - kickRecess - t/2);
        kickboard.userData.label = "Plinth Kickboard";
        kickboard.userData.w = w - 2*t; kickboard.userData.h = plinth; kickboard.userData.d = t;
        cabinetGroup.add(kickboard);
        plinthObjects.push(kickboard);
        
        // Left plinth support
        const plinthL = createPanel(t, plinth, d - kickRecess, plinthColor, false, 'plinth');
        plinthL.position.set(-w/2 + t/2, plinthY, -kickRecess/2);
        plinthL.userData.label = "Plinth Side";
        plinthL.userData.w = t; plinthL.userData.h = plinth; plinthL.userData.d = d - kickRecess;
        cabinetGroup.add(plinthL);
        plinthObjects.push(plinthL);
        
        // Right plinth support
        const plinthR = createPanel(t, plinth, d - kickRecess, plinthColor, false, 'plinth');
        plinthR.position.set(w/2 - t/2, plinthY, -kickRecess/2);
        plinthR.userData.label = "Plinth Side";
        plinthR.userData.w = t; plinthR.userData.h = plinth; plinthR.userData.d = d - kickRecess;
        cabinetGroup.add(plinthR);
        plinthObjects.push(plinthR);
    }

    // Update Camera
    const maxDim = Math.max(w, h, d);
    camera.position.set(0, maxDim * 0.4, maxDim * 1.6);
    orbit.target.set(0, 0, 0);
    orbit.update();
}

function syncPartitionsAndDoors() {
    syncShelvesFromCount();
    syncDividersFromCount();
    syncShuttersFromSelect();
}

function syncShelvesFromCount() {
    const shelvesInput = document.getElementById('cad-shelves-count');
    if (!shelvesInput) return;
    const count = parseInt(shelvesInput.value) || 0;
    
    // Remove existing auto shelves
    const toRemove = [];
    internalParts.forEach(part => {
        if (part.userData && part.userData.isAutoShelf) {
            toRemove.push(part);
        }
    });
    toRemove.forEach(part => {
        cabinetGroup.remove(part);
        internalParts = internalParts.filter(p => p !== part);
    });
    
    if (count <= 0) return;
    
    const t = currentThickness;
    const innerW = currentW - (2 * t);
    const innerH = currentH - (2 * t);
    const shelfDepth = currentD - 1.0;
    const shelfColor = 0xdeb887;
    
    const spacing = innerH / (count + 1);
    const startY = -innerH / 2;
    
    for (let i = 1; i <= count; i++) {
        const shelf = createPanel(innerW, t, shelfDepth, shelfColor, true, 'shelf');
        shelf.position.set(0, startY + (i * spacing), -0.5);
        shelf.userData.label = `Shelf ${i}`;
        shelf.userData.isAutoShelf = true;
        cabinetGroup.add(shelf);
    }
}

function syncDividersFromCount() {
    const divInput = document.getElementById('cad-dividers-count');
    if (!divInput) return;
    const count = parseInt(divInput.value) || 0;
    
    // Remove existing auto dividers
    const toRemove = [];
    internalParts.forEach(part => {
        if (part.userData && part.userData.isAutoDivider) {
            toRemove.push(part);
        }
    });
    toRemove.forEach(part => {
        cabinetGroup.remove(part);
        internalParts = internalParts.filter(p => p !== part);
    });
    
    if (count <= 0) return;
    
    const t = currentThickness;
    const innerW = currentW - (2 * t);
    const innerH = currentH - (2 * t);
    const divDepth = currentD - 1.0;
    const divColor = 0xdeb887;
    
    const spacing = innerW / (count + 1);
    const startX = -innerW / 2;
    
    for (let i = 1; i <= count; i++) {
        const divider = createPanel(t, innerH, divDepth, divColor, true, 'divider');
        divider.position.set(startX + (i * spacing), 0, -0.5);
        divider.userData.label = `Vertical Divider ${i}`;
        divider.userData.isAutoDivider = true;
        cabinetGroup.add(divider);
    }
}

function syncShuttersFromSelect() {
    const shutterSelect = document.getElementById('cad-shutter-select');
    if (!shutterSelect) return;
    const count = parseInt(shutterSelect.value) || 0;
    
    // Remove existing shutters and auto-hinge partitions
    const toRemove = [];
    cabinetGroup.children.forEach(child => {
        if (child.userData && (child.userData.type === 'shutter' || child.userData.isAutoHingePartition)) {
            toRemove.push(child);
        }
    });
    toRemove.forEach(child => {
        cabinetGroup.remove(child);
        internalParts = internalParts.filter(p => p !== child);
    });
    
    if (count <= 0) return;
    
    const gap = 0.125; // 1/8 inch
    const totalGapSpace = gap * (count + 1);
    const shutterW = (currentW - totalGapSpace) / count;
    const shutterH = currentH - (gap * 2);
    const shutterD = 0.75;
    
    let startX = (-currentW / 2) + gap + (shutterW / 2);
    const zPos = (currentD / 2) + (shutterD / 2) + 0.05;
    
    for (let i = 0; i < count; i++) {
        const shutter = createPanel(shutterW, shutterH, shutterD, 0xdeb887, true, 'shutter');
        shutter.userData.label = `Shutter ${i + 1}`;
        shutter.userData.customEdge = 'all';
        shutter.userData.customLaminate = 'single';
        applyLaminateMaterials(shutter, 'shutter', 'single', 'all');
        
        let isRightHinged = (i % 2 === 1);
        if (count === 1) isRightHinged = false;
        
        shutter.geometry.translate(isRightHinged ? -shutterW/2 : shutterW/2, 0, -shutterD/2);
        shutter.children.forEach(c => {
            if (c.geometry) c.geometry.translate(isRightHinged ? -shutterW/2 : shutterW/2, 0, -shutterD/2);
        });

        shutter.position.set(isRightHinged ? startX + shutterW/2 : startX - shutterW/2, 0, zPos + shutterD/2);
        shutter.userData.closedRotationY = shutter.rotation.y;
        shutter.userData.openRotationY = isRightHinged ? Math.PI / 2 : -Math.PI / 2;
        
        shutter.userData.lockZ = true; 
        shutter.userData.lockX = true;
        shutter.userData.lockY = true;
        
        cabinetGroup.add(shutter);
        
        if (i % 2 === 1 && i < count - 1) {
            const gapCenterX = startX + (shutterW / 2) + (gap / 2);
            const t = currentThickness;
            const innerH = currentH - (2 * t);
            const divDepth = currentD - 1.0; 
            
            const divider = createPanel(t, innerH, divDepth, 0xdeb887, true, 'divider');
            divider.position.set(gapCenterX, 0, -0.5);
            divider.userData.label = `Auto Hinge Partition`;
            divider.userData.isAutoHingePartition = true;
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
    
    if (nameInput) nameInput.value = preset.name;
    if (hInput) hInput.value = preset.hIn;
    if (wInput) wInput.value = preset.wFt;
    if (dInput) dInput.value = preset.dFt;
    if (plinthInput) plinthInput.value = preset.plinthIn;
    if (shelvesInput) shelvesInput.value = preset.shelves;
    if (dividersInput) dividersInput.value = preset.dividers;
    if (shutterSelect) shutterSelect.value = preset.shutters;
    
    updateDimensionsFromInputs();
}

function setupCADListeners() {
    ['cad-h-in', 'cad-w-ft', 'cad-d-ft', 'cad-plinth-in'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('input', updateDimensionsFromInputs);
    });
    
    const shelvesInput = document.getElementById('cad-shelves-count');
    if (shelvesInput) shelvesInput.addEventListener('input', syncShelvesFromCount);
    
    const divInput = document.getElementById('cad-dividers-count');
    if (divInput) divInput.addEventListener('input', syncDividersFromCount);
    
    const shutterSelect = document.getElementById('cad-shutter-select');
    if (shutterSelect) shutterSelect.addEventListener('change', syncShuttersFromSelect);
    
    document.querySelectorAll('.preset-pill').forEach(btn => {
        btn.addEventListener('click', () => applyPreset(btn.dataset.preset));
    });
    
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
    
    const toggleDoorsBtn = document.getElementById('btn-toggle-shutters');
    if (toggleDoorsBtn) toggleDoorsBtn.addEventListener('click', toggleShutters);
    
    const addDrawerBtn = document.getElementById('btn-add-drawer-quick');
    if (addDrawerBtn) addDrawerBtn.addEventListener('click', () => addDrawer('full'));
    
    const deleteBtn = document.getElementById('btn-delete-selected');
    if (deleteBtn) deleteBtn.addEventListener('click', deleteSelectedPart);
    
    const exportBtn = document.getElementById('btn-cad-export');
    if (exportBtn) exportBtn.addEventListener('click', exportToOptimizer);
}

function addShelf() {
    const t = currentThickness;
    const innerW = currentW - (2 * t);
    const shelfDepth = currentD - 1.0; 
    
    const shelfColor = 0xdeb887; 
    const shelf = createPanel(innerW, t, shelfDepth, shelfColor, true, 'shelf');
    
    shelf.position.set(0, 0, -0.5);
    shelf.userData.label = `Shelf ${partCounter++}`;
    
    cabinetGroup.add(shelf);
    selectObject(shelf);
}

function addDivider() {
    const t = currentThickness;
    const innerH = currentH - (2 * t);
    const divDepth = currentD - 1.0; 
    
    const divColor = 0xdeb887;
    const divider = createPanel(t, innerH, divDepth, divColor, true, 'divider');
    
    divider.position.set(0, 0, -0.5);
    divider.userData.label = `Vertical Divider ${partCounter++}`;
    
    cabinetGroup.add(divider);
    selectObject(divider);
}

function addDrawer(sizeType) {
    const t = currentThickness;
    const gapPerSide = parseFloat(document.getElementById('cad-drawer-gap').value) || 0.5;
    const totalGap = gapPerSide * 2;
    
    const innerW = currentW - (2 * t);
    
    // For Full Drawer, use full internal width. 
    // For Half Drawer, assume it fits perfectly between the left wall and a centered vertical divider.
    let drawerW;
    let posX;
    
    if (sizeType === 'full') {
        drawerW = innerW - totalGap;
        posX = 0;
    } else {
        const usableHalfSpace = (innerW / 2) - (t / 2);
        drawerW = usableHalfSpace - totalGap;
        posX = -(innerW / 4) - (t / 4);
    }
    
    const drawerH = 8.0; // Default drawer height 8 inches
    const drawerD = currentD - 2.0; 
    
    const colorHex = 0xdeb887;
    
    const group = new THREE.Group();
    const dInnerW = drawerW - (2 * t);
    const dInnerD = drawerD - (2 * t);

    // Provide standard material for pieces
    const material = new THREE.MeshPhongMaterial({ color: colorHex, shininess: 10 });
    const edgeMat = new THREE.LineBasicMaterial({ color: 0x5c4033, linewidth: 2 });

    const makeSubPanel = (w, h, d, px, py, pz, label) => {
        const geo = new THREE.BoxGeometry(w, h, d);
        const mesh = new THREE.Mesh(geo, material);
        mesh.add(new THREE.LineSegments(new THREE.EdgesGeometry(geo), edgeMat));
        mesh.position.set(px, py, pz);
        mesh.userData = { isSubPart: true, w: w, h: h, d: d, label: label };
        group.add(mesh);
    };

    const labelPrefix = `Drw ${partCounter++}`;

    makeSubPanel(t, drawerH, drawerD, -drawerW/2 + t/2, 0, 0, `${labelPrefix} Side L`);
    makeSubPanel(t, drawerH, drawerD, drawerW/2 - t/2, 0, 0, `${labelPrefix} Side R`);
    makeSubPanel(dInnerW, drawerH, t, 0, 0, drawerD/2 - t/2, `${labelPrefix} Front`);
    makeSubPanel(dInnerW, drawerH, t, 0, 0, -drawerD/2 + t/2, `${labelPrefix} Back`);
    makeSubPanel(drawerW, t, drawerD, 0, -drawerH/2 + t/2, 0, `${labelPrefix} Bottom`); // Bottom caps it

    // HitBox for raycasting
    const hitBoxGeo = new THREE.BoxGeometry(drawerW, drawerH, drawerD);
    const hitBoxMat = new THREE.MeshBasicMaterial({ visible: false });
    const hitBox = new THREE.Mesh(hitBoxGeo, hitBoxMat);
    group.add(hitBox);
    
    hitBox.userData = { type: 'drawer', parentGroup: group };
    internalParts.push(hitBox);

    group.userData = { isDrawerGroup: true };
    group.position.set(posX, 0, -1.0);
    
    cabinetGroup.add(group);
    selectObject(hitBox);
}

function addDrawer(type) {
    const gapEl = document.getElementById('cad-drawer-gap');
    const gap = parseFloat(gapEl.value) || 0.5;
    
    const h = type === 'full' ? 10 : 5;
    const innerW = currentW - (2 * currentThickness);
    
    const w = innerW;
    const d = currentD - 2;
    
    const drawerGroup = new THREE.Group();
    drawerGroup.position.set(0, 0, 0);
    
    const boxW = w - (gap * 2);
    
    // Left side
    const lSide = createPanel(currentThickness, h, d, 0xdeb887, true, 'drawer_part');
    lSide.position.set(-boxW/2 + currentThickness/2, 0, 0);
    lSide.userData = { isSubPart: true, label: "Drawer Side", w: currentThickness, h: h, d: d };
    
    // Right side
    const rSide = createPanel(currentThickness, h, d, 0xdeb887, true, 'drawer_part');
    rSide.position.set(boxW/2 - currentThickness/2, 0, 0);
    rSide.userData = { isSubPart: true, label: "Drawer Side", w: currentThickness, h: h, d: d };
    
    // Back
    const bW = boxW - (2 * currentThickness);
    const back = createPanel(bW, h, currentThickness, 0xdeb887, true, 'drawer_part');
    back.position.set(0, 0, -d/2 + currentThickness/2);
    back.userData = { isSubPart: true, label: "Drawer Back", w: bW, h: h, d: currentThickness };
    
    // Front (Inner)
    const front = createPanel(bW, h, currentThickness, 0xdeb887, true, 'drawer_part');
    front.position.set(0, 0, d/2 - currentThickness/2);
    front.userData = { isSubPart: true, label: "Drawer Front Inner", w: bW, h: h, d: currentThickness };
    
    // Bottom (assume 1/4 inch inset)
    const botW = boxW - currentThickness;
    const botD = d - currentThickness;
    const bottom = createPanel(botW, 0.25, botD, 0xdeb887, true, 'drawer_part');
    bottom.position.set(0, -h/2 + 0.5, 0);
    bottom.userData = { isSubPart: true, label: "Drawer Bottom", w: botW, h: 0.25, d: botD };
    
    // Fascia (Outer Front) - covers the gap
    const fascia = createPanel(w - 0.25, h + 1, currentThickness, 0xdeb887, true, 'drawer_part');
    fascia.position.set(0, 0, d/2 + currentThickness/2);
    fascia.userData = { isSubPart: true, label: "Drawer Fascia", w: w - 0.25, h: h + 1, d: currentThickness };
    
    // Hitbox for selection
    const hitBoxGeo = new THREE.BoxGeometry(w, h + 1, d + currentThickness);
    const hitBoxMat = new THREE.MeshBasicMaterial({ visible: false });
    const hitBox = new THREE.Mesh(hitBoxGeo, hitBoxMat);
    hitBox.position.set(0, 0, 0);
    hitBox.userData = { type: 'drawer', label: type === 'full' ? "Full Drawer" : "Half Drawer", isDrawerGroup: true };
    internalParts.push(hitBox);
    
    drawerGroup.add(lSide, rSide, back, front, bottom, fascia, hitBox);
    
    drawerGroup.userData = { isDrawerGroup: true };
    hitBox.userData.parentGroup = drawerGroup;
    
    cabinetGroup.add(drawerGroup);
}

function addShutters() {
    const countInput = document.getElementById('cad-shutter-count');
    const warningEl = document.getElementById('shutter-warning');
    let count = parseInt(countInput.value) || 2;
    
    // Smart validation
    let optimumWidth = currentW / count;
    if (optimumWidth < 9 && count > 1) {
        count = Math.max(1, Math.floor(currentW / 9));
        countInput.value = count;
        warningEl.textContent = `Too many doors for this width. Reduced to ${count}.`;
        warningEl.classList.remove('hidden');
    } else if (optimumWidth > 26) {
        count = Math.ceil(currentW / 24);
        countInput.value = count;
        warningEl.textContent = `Doors would be too wide. Increased to ${count}.`;
        warningEl.classList.remove('hidden');
    } else {
        warningEl.classList.add('hidden');
    }
    
    // Remove existing shutters and auto-partitions
    const toRemove = [];
    cabinetGroup.children.forEach(child => {
        if (child.userData && child.userData.type === 'shutter') toRemove.push(child);
        if (child.userData && child.userData.isAutoHingePartition) toRemove.push(child);
    });
    toRemove.forEach(child => {
        cabinetGroup.remove(child);
        internalParts = internalParts.filter(p => p !== child);
    });
    
    // Standard gap (reveal) between doors and around edges
    const gap = 0.125; // 1/8 inch
    const totalGapSpace = gap * (count + 1); // e.g. 2 doors have 3 gaps (left, middle, right)
    
    const shutterW = (currentW - totalGapSpace) / count;
    const shutterH = currentH - (gap * 2); // Top and bottom gaps
    const shutterD = 0.75; // Standard 3/4" thick door
    
    let startX = (-currentW / 2) + gap + (shutterW / 2);
    const zPos = (currentD / 2) + (shutterD / 2) + 0.05; // Placed on the very front edge (Full Overlay)
    
    for (let i = 0; i < count; i++) {
        const shutter = createPanel(shutterW, shutterH, shutterD, 0xdeb887, true, 'shutter');
        shutter.userData.label = `Shutter ${i + 1}`;
        shutter.userData.customEdge = 'all'; // Default edge banding all 4 edges
        shutter.userData.customLaminate = 'single'; // Usually single inner side laminate
        applyLaminateMaterials(shutter, 'shutter', 'single', 'all'); // Refresh materials with new edge default
        
        // Doors should alternate hinging to create pairs. 
        // Door 0: Left, Door 1: Right, Door 2: Left, Door 3: Right
        let isRightHinged = (i % 2 === 1);
        
        // However, if there's only 1 door total, or it's the very last odd-count door (like Door 3 of a 3-door set), 
        // it can hinge either way, but our logic is mathematically sound as long as it matches the partitions.
        // If count = 1, force left hinge.
        if (count === 1) isRightHinged = false; 
        
        shutter.geometry.translate(isRightHinged ? -shutterW/2 : shutterW/2, 0, -shutterD/2);
        
        // Also translate the edges geometry to match
        shutter.children.forEach(c => {
            if (c.geometry) {
                c.geometry.translate(isRightHinged ? -shutterW/2 : shutterW/2, 0, -shutterD/2);
            }
        });

        shutter.position.set(isRightHinged ? startX + shutterW/2 : startX - shutterW/2, 0, zPos + shutterD/2);
        
        shutter.userData.closedRotationY = shutter.rotation.y;
        shutter.userData.openRotationY = isRightHinged ? Math.PI / 2 : -Math.PI / 2;
        
        // Disable translation controls for shutters so they stay flat
        shutter.userData.lockZ = true; 
        shutter.userData.lockX = true;
        shutter.userData.lockY = true;
        
        cabinetGroup.add(shutter);
        
        // AI Structural Partition Logic: Place an upright after every ODD index (e.g. after Door 2, Door 4)
        // EXCEPT if it's the very last door, because the last door hinges on the right shell wall.
        if (i % 2 === 1 && i < count - 1) {
            const gapCenterX = startX + (shutterW / 2) + (gap / 2);
            const t = currentThickness;
            const innerH = currentH - (2 * t);
            const divDepth = currentD - 1.0; 
            
            const divider = createPanel(t, innerH, divDepth, 0xdeb887, true, 'divider');
            divider.position.set(gapCenterX, 0, -0.5);
            divider.userData.label = `Auto Hinge Partition`;
            divider.userData.isAutoHingePartition = true;
            
            cabinetGroup.add(divider);
        }
        
        startX += shutterW + gap;
    }
}

let shuttersOpen = false;
function toggleShutters() {
    shuttersOpen = !shuttersOpen;
    cabinetGroup.children.forEach(child => {
        if (child.userData && child.userData.type === 'shutter') {
            child.rotation.y = shuttersOpen ? child.userData.openRotationY : child.userData.closedRotationY;
            // Disable raycasting when open so we can click through them to internal shelves
            child.layers.set(shuttersOpen ? 1 : 0); 
        }
    });
}

function exportToOptimizer() {
    const exportedParts = [];
    
    // 1. Export Shell
    shellObjects.forEach(obj => {
        let laminate = obj.userData.customLaminate || "double";
        
        if (obj.userData.isComplexShell) {
            // Explode the hollow extrusion into flat cut list parts
            const t = obj.userData.t;
            const innerW = obj.userData.w - (2 * t);
            exportedParts.push({ label: "Left Side", w: obj.userData.h, h: obj.userData.d, laminate: laminate });
            exportedParts.push({ label: "Right Side", w: obj.userData.h, h: obj.userData.d, laminate: laminate });
            exportedParts.push({ label: "Top", w: innerW, h: obj.userData.d, laminate: laminate });
            exportedParts.push({ label: "Bottom", w: innerW, h: obj.userData.d, laminate: laminate });
        } else {
            const dims = [obj.userData.w, obj.userData.h, obj.userData.d].sort((a,b) => b-a);
            exportedParts.push({
                label: obj.userData.label,
                w: dims[1], 
                h: dims[0],
                laminate: laminate
            });
        }
    });

    // 1b. Export Plinth / Kickboard (if present)
    plinthObjects.forEach(obj => {
        const dims = [obj.userData.w, obj.userData.h, obj.userData.d].sort((a,b) => b-a);
        exportedParts.push({
            label: obj.userData.label || "Plinth Kickboard",
            w: dims[1],
            h: dims[0],
            laminate: "none"
        });
    });
    
    // 2. Export Internal Parts & Drawer Groups
    cabinetGroup.children.forEach(obj => {
        if (obj.userData.isDrawerGroup) {
            // The hitbox has the custom properties
            const hitBox = obj.children[obj.children.length - 1];
            let laminate = hitBox.userData.customLaminate || "double";
            
            obj.children.forEach(child => {
                if (child.userData.isSubPart) {
                    const dims = [child.userData.w, child.userData.h, child.userData.d].sort((a,b) => b-a);
                    exportedParts.push({
                        label: child.userData.label,
                        w: dims[1],
                        h: dims[0],
                        laminate: laminate
                    });
                }
            });
        }
    });

    // Simple single-mesh internal parts
    internalParts.forEach(hitBox => {
        // If it's a drawer hitBox, it has no dimensions to export itself (handled above)
        if (hitBox.userData.parentGroup) return; 
        
        let laminate = hitBox.userData.customLaminate || "double";
        const dims = [hitBox.userData.w, hitBox.userData.h, hitBox.userData.d].sort((a,b) => b-a);
        exportedParts.push({
            label: hitBox.userData.label,
            w: dims[1],
            h: dims[0],
            laminate: laminate
        });
    });

    // Multiply by Quantity & add Cabinet Name
    const qtyInput = document.getElementById('cab-preset-qty');
    const cabQty = qtyInput ? (parseInt(qtyInput.value) || 1) : 1;
    const nameInput = document.getElementById('cab-preset-name');
    const cabName = (nameInput && nameInput.value.trim()) ? nameInput.value.trim() : "Cabinet";

    const allMultipliedParts = [];
    for (let q = 1; q <= cabQty; q++) {
        const prefix = cabQty > 1 ? `${cabName} #${q}` : cabName;
        exportedParts.forEach(p => {
            allMultipliedParts.push({
                ...p,
                label: `${prefix} - ${p.label}`
            });
        });
    }

    window.cabinetParts = allMultipliedParts;
    
    // UI updates
    const ul = document.getElementById('generated-parts');
    if (ul) {
        ul.innerHTML = '';
        allMultipliedParts.forEach(p => {
            const li = document.createElement('li');
            li.textContent = `${p.label}: ${p.w.toFixed(1)}" × ${p.h.toFixed(1)}"`;
            ul.appendChild(li);
        });
        document.getElementById('parts-list').classList.remove('hidden');
    }

    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    
    document.getElementById('optimization-tab').classList.add('active');
    document.querySelector(`[data-target="optimization-tab"]`).classList.add('active');

    const matSelect = document.getElementById('cab-material');
    if (!matSelect || !matSelect.value) {
        alert("Please select a Plywood / Core material in the Cut Material tab first, then try exporting again!");
        document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        document.getElementById('designer-tab').classList.add('active');
        document.querySelector(`[data-target="designer-tab"]`).classList.add('active');
        return;
    }
    
    const selectedMat = window.materials.find(m => m.id === parseInt(matSelect.value));
    
    const linerSelect = document.getElementById('cab-liner');
    const linerVal = linerSelect ? linerSelect.value : 'none';
    const selectedLinerMat = linerVal !== 'none' ? window.materials.find(m => m.id === parseInt(linerVal)) : null;

    const micaParts = [];
    if (selectedLinerMat) {
        exportedParts.forEach(p => {
            if (p.laminate === "none") return; // Do not export mica for this part
            
            if (p.laminate === "single") {
                micaParts.push({ label: `${p.label} (Single Side)`, w: p.w, h: p.h });
            } else if (p.laminate === "double") {
                micaParts.push({ label: `${p.label} (Side 1)`, w: p.w, h: p.h });
                micaParts.push({ label: `${p.label} (Side 2)`, w: p.w, h: p.h });
            }
        });
    }

    if (window.runGlobalOptimization && selectedMat) {
        window.runGlobalOptimization(exportedParts, micaParts, selectedMat, selectedLinerMat);
    } else {
        alert("Optimization engine not ready. Please make sure materials are loaded.");
    }
}

document.addEventListener('DOMContentLoaded', () => {
    const tabs = document.querySelectorAll('.tab-btn');
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            if (tab.dataset.target === 'visualizer-tab') {
                if (!is3DInitialized) init3D();
                resize3D();
            }
        });
    });
});
