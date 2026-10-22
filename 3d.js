let scene, camera, renderer, orbit, transformControl, raycaster, mouse;
let cabinetGroup;
let is3DInitialized = false;
let selectedObject = null;
let shutterDragProxy = null;
let lastProxyPos = null;
let currentKitchenMode = 'both'; // 'base', 'both', or 'wall'
let currentThickness = 0.75; // Standard 3/4" (18-19mm) plywood

// Base Cabinet Dimensions (inches)
let currentW = 132, currentH = 32, currentD = 24, currentPlinth = 3;

// Wall Cabinet Dimensions (inches)
let currentWallW = 132, currentWallH = 30, currentWallD = 12, currentDadoGap = 22;

// Kitchen Layout State ('straight', 'l-shape', 'u-shape')
let currentKitchenLayout = 'straight';
let currentLReturnFt = 7;
let currentLReturnSide = 'right'; // 'right' or 'left'
let currentULeftFt = 7;
let currentURightFt = 7;

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
    transformControl.renderOrder = 999;
    
    shutterDragProxy = new THREE.Object3D();
    scene.add(shutterDragProxy);
    lastProxyPos = new THREE.Vector3();

    transformControl.addEventListener('dragging-changed', function (event) {
        orbit.enabled = !event.value;
    });
    transformControl.addEventListener('objectChange', function () {
        if (transformControl.object === shutterDragProxy && selectedObject && selectedObject.userData && selectedObject.userData.type === 'shutter') {
            const deltaX = shutterDragProxy.position.x - lastProxyPos.x;
            const deltaY = shutterDragProxy.position.y - lastProxyPos.y;
            selectedObject.position.x += deltaX;
            selectedObject.position.y += deltaY;
            lastProxyPos.copy(shutterDragProxy.position);
        } else if (selectedObject && selectedObject.userData && selectedObject.userData.isDrawerGroup) {
            const maxZ = selectedObject.userData.maxSlideZ || (selectedObject.userData.drawerD ? selectedObject.userData.drawerD * 0.65 : 14.0);
            if (selectedObject.position.z < 0) selectedObject.position.z = 0;
            if (selectedObject.position.z > maxZ) selectedObject.position.z = maxZ;
        } else if (selectedObject && selectedObject.userData && selectedObject.userData.type === 'shutter') {
            const isWall = (selectedObject.userData.module === 'wall');
            const d = isWall ? currentWallD : currentD;
            const centerZ = isWall ? getWallCenterZ() : 0;
            const shutterD = selectedObject.userData.shutterD || 0.75;
            selectedObject.position.z = centerZ + (d / 2) + (shutterD / 2) + 0.05 + (shutterD / 2);
        }
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
    renderer.domElement.addEventListener('dblclick', onDoubleClick);
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
    
    // When double-clicked into drag mode (TransformControls attached), hide dimensions so drag arrows are clean
    if (transformControl && transformControl.object) {
        overlaysContainer.innerHTML = '';
        return;
    }

    if (!selectedObject || (!selectedObject.userData.type && !selectedObject.userData.isDrawerGroup)) {
        overlaysContainer.innerHTML = '';
        return;
    }
    
    const type = selectedObject.userData.type || (selectedObject.userData.isDrawerGroup ? 'drawer' : null);
    if (type !== 'shelf' && type !== 'divider' && type !== 'shutter') {
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

    if (type === 'shutter') {
        const w = selectedObject.userData.shutterW || (selectedObject.geometry ? selectedObject.geometry.parameters.width : 0);
        const h = selectedObject.userData.shutterH || (selectedObject.geometry ? selectedObject.geometry.parameters.height : 0);
        const d = selectedObject.userData.shutterD || 0.75;
        const label = selectedObject.userData.label || "Cabinet Shutter";
        const totalShutters = selectedObject.userData.totalShutters || '';

        const box = new THREE.Box3().setFromObject(selectedObject);
        const center = new THREE.Vector3();
        box.getCenter(center);

        const topEdge = new THREE.Vector3(center.x, box.max.y, box.max.z);
        const leftEdge = new THREE.Vector3(box.min.x, center.y, box.max.z);
        const rightEdge = new THREE.Vector3(box.max.x, center.y, box.max.z);

        const screenCenter = center.clone().project(camera);
        const screenTop = topEdge.clone().project(camera);
        const screenLeft = leftEdge.clone().project(camera);
        const screenRight = rightEdge.clone().project(camera);

        if (screenCenter.z < 1) {
            const cX = (screenCenter.x * 0.5 + 0.5) * width;
            const cY = (screenCenter.y * -0.5 + 0.5) * height;
            const tY = (screenTop.y * -0.5 + 0.5) * height;
            const lX = (screenLeft.x * 0.5 + 0.5) * width;
            const rX = (screenRight.x * 0.5 + 0.5) * width;

            const wFt = (w / 12).toFixed(2);
            const hFt = (h / 12).toFixed(2);

            // 1. Shutter Dimension Callout HUD hovering over clicked shutter
            const hud = document.createElement('div');
            hud.className = 'cad-shutter-callout-hud';
            hud.innerHTML = `
                <div style="font-size: 0.68rem; font-weight: 700; color: #38bdf8; text-transform: uppercase; margin-bottom: 2px;">
                    ${label} ${totalShutters ? `(${totalShutters} Total)` : ''}
                </div>
                <div style="display: flex; align-items: baseline; gap: 6px; margin: 2px 0;">
                    <span style="font-size: 0.72rem; color: #cbd5e1;">WIDTH (BREADTH):</span>
                    <span style="font-size: 1.05rem; font-weight: 800; color: #facc15; font-family: monospace;">
                        ${w.toFixed(2)}"
                    </span>
                    <span style="font-size: 0.72rem; color: #94a3b8;">(~${wFt} ft)</span>
                </div>
                <div style="display: flex; gap: 8px; font-size: 0.7rem; color: #94a3b8; border-top: 1px solid rgba(255,255,255,0.1); padding-top: 3px; margin-top: 2px;">
                    <span>HEIGHT: <b style="color: #fff;">${h.toFixed(2)}"</b> (~${hFt} ft)</span>
                    <span>THICK: <b style="color: #fff;">${d.toFixed(2)}"</b></span>
                </div>
            `;
            hud.style.position = 'absolute';
            hud.style.left = `${cX}px`;
            hud.style.top = `${tY - 12}px`;
            hud.style.transform = 'translate(-50%, -100%)';
            hud.style.background = 'rgba(15, 23, 42, 0.94)';
            hud.style.border = '1.5px solid #38bdf8';
            hud.style.borderRadius = '8px';
            hud.style.padding = '6px 10px';
            hud.style.boxShadow = '0 8px 20px rgba(0,0,0,0.6), 0 0 12px rgba(56, 189, 248, 0.3)';
            hud.style.pointerEvents = 'none';
            hud.style.zIndex = '15';
            hud.style.whiteSpace = 'nowrap';
            overlaysContainer.appendChild(hud);

            // 2. Shutter Width Dimension Line
            const spanW = Math.max(Math.abs(rX - lX), 40);
            const minX = Math.min(lX, rX);
            const dimLine = document.createElement('div');
            dimLine.style.position = 'absolute';
            dimLine.style.left = `${minX}px`;
            dimLine.style.top = `${cY}px`;
            dimLine.style.width = `${spanW}px`;
            dimLine.style.height = '20px';
            dimLine.style.transform = 'translateY(-50%)';
            dimLine.style.pointerEvents = 'none';
            dimLine.style.display = 'flex';
            dimLine.style.alignItems = 'center';
            dimLine.style.justifyContent = 'center';
            dimLine.innerHTML = `
                <div style="position: absolute; left: 0; right: 0; height: 2px; background: #facc15; box-shadow: 0 0 6px rgba(250, 204, 21, 0.6);"></div>
                <div style="position: absolute; left: 0; width: 2px; height: 10px; background: #facc15; transform: translateY(-4px);"></div>
                <div style="position: absolute; right: 0; width: 2px; height: 10px; background: #facc15; transform: translateY(-4px);"></div>
                <span style="position: relative; background: #0f172a; color: #facc15; padding: 1px 6px; border-radius: 4px; font-size: 11px; font-weight: bold; border: 1px solid #facc15; font-family: monospace;">
                    ◄ ${w.toFixed(2)}" ►
                </span>
            `;
            overlaysContainer.appendChild(dimLine);
        }
    } else if (type === 'divider') {
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
        
    } else if (type === 'shelf') {
        const objY = selectedObject.position.y;
        const h = selectedObject.geometry ? selectedObject.geometry.parameters.height : currentThickness;
        
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
    raycaster.layers.enable(1);

    const hitControls = raycaster.intersectObject(transformControl, true);
    if (hitControls.length > 0 && transformControl.axis !== null) return;
    
    const intersects = raycaster.intersectObjects(internalParts, false);

    if (intersects.length > 0) {
        const object = intersects[0].object;
        const targetObj = object.userData.parentGroup ? object.userData.parentGroup : object;

        if (selectedObject !== targetObj) {
            selectObject(object, false); // Single-click: dimensions only, no arrows
        } else if (transformControl.object) {
            // Clicking body of already-selected object: return to dimension-only (detach arrows)
            transformControl.detach();
        }
    } else {
        deselectObject();
    }
}

function onDoubleClick(event) {
    if (transformControl.dragging) return;
    if (event.button !== 0) return;

    const rect = renderer.domElement.getBoundingClientRect();
    mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    raycaster.setFromCamera(mouse, camera);
    raycaster.layers.set(0);
    raycaster.layers.enable(1);

    const hitControls = raycaster.intersectObject(transformControl, true);
    if (hitControls.length > 0 && transformControl.axis !== null) return;

    const intersects = raycaster.intersectObjects(internalParts, false);

    if (intersects.length > 0) {
        const object = intersects[0].object;
        selectObject(object, true); // Double-click: show draggable arrows (X-axis, Y-axis)!
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

function selectObject(hitBoxMesh, showArrows = false) {
    if (!hitBoxMesh) return;
    const targetObj = hitBoxMesh.userData.parentGroup ? hitBoxMesh.userData.parentGroup : hitBoxMesh;

    if (selectedObject !== targetObj) {
        deselectObject();
        selectedObject = targetObj;
        setEmissive(selectedObject, 0x333333);
        populateInspector(selectedObject);
    }
    
    const type = hitBoxMesh.userData.type || (selectedObject.userData && selectedObject.userData.type);
    
    if (showArrows) {
        if (type === 'shutter') {
            // Door / Shutter: Center draggable arrows (X and Y axis) right on the door panel
            const box = new THREE.Box3().setFromObject(selectedObject);
            const center = new THREE.Vector3();
            box.getCenter(center);
            if (shutterDragProxy) {
                shutterDragProxy.position.copy(center);
                lastProxyPos.copy(center);
                transformControl.attach(shutterDragProxy);
            } else {
                transformControl.attach(selectedObject);
            }
            transformControl.showX = true;
            transformControl.showY = true;
            transformControl.showZ = false;
        } else if (type === 'shelf') {
            transformControl.attach(selectedObject);
            transformControl.showX = false;
            transformControl.showY = true;
            transformControl.showZ = false;
        } else if (type === 'divider') {
            transformControl.attach(selectedObject);
            transformControl.showX = true;
            transformControl.showY = false;
            transformControl.showZ = false;
        } else if (type === 'drawer') {
            transformControl.attach(selectedObject);
            transformControl.showX = false;
            transformControl.showY = false;
            transformControl.showZ = true;
        } else {
            transformControl.attach(selectedObject);
            transformControl.showX = true;
            transformControl.showY = true;
            transformControl.showZ = false;
        }

        transformControl.renderOrder = 999;
        transformControl.traverse(c => {
            c.renderOrder = 999;
            if (c.material) c.material.depthTest = false;
        });
    } else {
        transformControl.detach();
    }
    updateDimensionsOverlay();
    if (renderer && scene && camera) renderer.render(scene, camera);
}

function deselectObject() {
    if (selectedObject) {
        transformControl.detach();
        setEmissive(selectedObject, 0x000000);
        selectedObject = null;
        
        const inspector = document.getElementById('property-inspector');
        if (inspector) inspector.style.display = 'none';
        updateDimensionsOverlay();
        if (renderer && scene && camera) renderer.render(scene, camera);
    }
}

function populateInspector(obj) {
    const inspector = document.getElementById('property-inspector');
    if (!inspector) return;
    
    inspector.style.display = 'flex';
    
    const nameEl = document.getElementById('prop-part-name');
    const widthEl = document.getElementById('prop-width-val');
    const heightEl = document.getElementById('prop-height-val');
    const thickValEl = document.getElementById('prop-thick-val');
    const thickEl = document.getElementById('prop-thickness');
    const lamEl = document.getElementById('prop-laminate');
    const edgeEl = document.getElementById('prop-edge');
    
    const heightRow = document.getElementById('prop-height-row');
    const thickRow = document.getElementById('prop-thick-row');
    const matControls = document.getElementById('prop-material-controls');
    
    let name = obj.userData.label || "Cabinet Part";
    let thickness = currentThickness;
    let laminate = obj.userData.customLaminate || "double";
    let edge = obj.userData.customEdge || "front";
    
    let partW = obj.userData.shutterW || obj.userData.drawerW || obj.userData.w || (obj.geometry && obj.geometry.parameters ? obj.geometry.parameters.width : 0);
    let partH = obj.userData.shutterH || obj.userData.drawerH || obj.userData.h || (obj.geometry && obj.geometry.parameters ? obj.geometry.parameters.height : 0);
    let partD = obj.userData.shutterD || obj.userData.drawerD || obj.userData.d || (obj.geometry && obj.geometry.parameters ? obj.geometry.parameters.depth : 0.75);

    if (obj.userData.type === 'shutter') {
        thickness = obj.userData.shutterD || 0.75;
    } else if (obj.userData.type === 'shelf') {
        thickness = obj.userData.customThickness || (obj.geometry && obj.geometry.parameters ? obj.geometry.parameters.height : currentThickness);
    } else if (obj.userData.type === 'divider') {
        thickness = obj.userData.customThickness || (obj.geometry && obj.geometry.parameters ? obj.geometry.parameters.width : currentThickness);
    } else if (obj.userData.isDrawerGroup) {
        thickness = currentThickness;
    }
    
    if (obj.userData.isDrawerGroup) {
        name = obj.userData.label || "Drawer Assembly";
        if (heightRow) heightRow.style.display = 'none';
        if (thickRow) thickRow.style.display = 'none';
        if (matControls) matControls.style.display = 'none';
        if (thickEl) thickEl.disabled = true;
    } else {
        if (heightRow) heightRow.style.display = 'flex';
        if (thickRow) thickRow.style.display = 'flex';
        if (matControls) matControls.style.display = 'block';
        if (thickEl) thickEl.disabled = (obj.userData.type === 'shutter');
    }
    
    if (nameEl) nameEl.textContent = name;

    if (widthEl) {
        const wVal = parseFloat(partW) || 0;
        widthEl.textContent = `${wVal.toFixed(2)}" (~${(wVal / 12).toFixed(2)} ft)`;
    }
    if (heightEl) {
        const hVal = parseFloat(partH) || 0;
        heightEl.textContent = `${hVal.toFixed(2)}" (~${(hVal / 12).toFixed(2)} ft)`;
    }
    if (thickValEl) {
        const tVal = parseFloat(thickness) || 0.75;
        thickValEl.textContent = `${tVal.toFixed(2)}"`;
    }
    
    if (thickEl) thickEl.value = (typeof thickness === 'number' ? thickness : parseFloat(thickness) || 0.75);
    if (lamEl) lamEl.value = laminate;
    if (edgeEl) edgeEl.value = edge;
}

function setupInspector() {
    const thickEl = document.getElementById('prop-thickness');
    const lamEl = document.getElementById('prop-laminate');
    
    if (thickEl) {
        thickEl.addEventListener('focus', () => thickEl.select());
        thickEl.addEventListener('input', (e) => {
            if (!selectedObject || selectedObject.userData.isDrawerGroup) return;
            
            const parsed = parseDim(e.target.value, 'in');
            const newT = parsed ? parsed.in : parseFloat(e.target.value);
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
        thickEl.addEventListener('blur', () => {
            const parsed = parseDim(thickEl.value, 'in');
            if (parsed && parsed.display) {
                thickEl.value = parsed.display;
            }
        });
        thickEl.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') thickEl.blur();
        });
    }
    
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

    const closeBtn = document.getElementById('btn-close-inspector');
    if (closeBtn) {
        closeBtn.addEventListener('click', () => {
            deselectObject();
        });
    }

    const propDeleteBtn = document.getElementById('btn-prop-delete');
    if (propDeleteBtn) {
        propDeleteBtn.addEventListener('click', () => {
            deleteSelectedPart();
        });
    }
}

function deleteSelectedPart() {
    if (!selectedObject) return;

    const objToDelete = selectedObject;
    const isDrawer = objToDelete.userData && (objToDelete.userData.isDrawerGroup || objToDelete.userData.type === 'drawer');
    const isShutter = objToDelete.userData && objToDelete.userData.type === 'shutter';
    const isAutoShelf = objToDelete.userData && objToDelete.userData.isAutoShelf;
    const isAutoDivider = objToDelete.userData && objToDelete.userData.isAutoDivider;
    const partModule = (objToDelete.userData && objToDelete.userData.module) || 'base';

    // 1. Cleanly deselect first: detaches transform controls, clears emissive, hides inspector, hides HUDs
    deselectObject();

    // 2. Handle deletion according to part type
    if (isDrawer) {
        const group = objToDelete.userData.parentGroup || objToDelete;
        removeDrawerGroup(group);
    } else {
        // Recursive disposal of Three.js geometry and materials
        const disposeObject = (obj) => {
            if (obj.geometry) {
                obj.geometry.dispose();
            }
            if (obj.material) {
                if (Array.isArray(obj.material)) {
                    obj.material.forEach(m => m && m.dispose && m.dispose());
                } else if (obj.material.dispose) {
                    obj.material.dispose();
                }
            }
            if (obj.children && obj.children.length > 0) {
                [...obj.children].forEach(child => disposeObject(child));
            }
        };

        // Remove from parent
        if (objToDelete.parent) {
            objToDelete.parent.remove(objToDelete);
        } else {
            cabinetGroup.remove(objToDelete);
        }

        // Remove from internal tracking
        internalParts = internalParts.filter(p => p !== objToDelete && p.userData.parentGroup !== objToDelete);
        shellObjects = shellObjects.filter(p => p !== objToDelete);

        // Auto count synchronization
        if (isAutoShelf) {
            const shelfInputId = (partModule === 'wall') ? 'cad-wall-shelves-count' : 'cad-shelves-count';
            const shelfInput = document.getElementById(shelfInputId);
            if (shelfInput) {
                const currentVal = parseInt(shelfInput.value) || 0;
                if (currentVal > 0) shelfInput.value = currentVal - 1;
            }
        } else if (isAutoDivider) {
            const divInputId = (partModule === 'wall') ? 'cad-wall-dividers-count' : 'cad-dividers-count';
            const divInput = document.getElementById(divInputId);
            if (divInput) {
                const currentVal = parseInt(divInput.value) || 0;
                if (currentVal > 0) divInput.value = currentVal - 1;
            }
            if (partModule === 'base') {
                updateExistingDrawers();
            }
        } else if (isShutter) {
            const remainingShutters = cabinetGroup.children.filter(c => c.userData && c.userData.type === 'shutter' && c.userData.module === partModule);
            const selectId = (partModule === 'wall') ? 'cad-wall-shutter-select' : 'cad-shutter-select';
            const subId = (partModule === 'wall') ? 'cad-wall-shutter-sub' : 'cad-shutter-sub';
            const select = document.getElementById(selectId);
            const subEl = document.getElementById(subId);
            if (remainingShutters.length === 0) {
                if (select) select.value = '0';
                if (subEl) subEl.textContent = 'None (Open)';
            } else if (subEl) {
                subEl.textContent = `${remainingShutters.length} Door(s) Remaining (${remainingShutters[0].userData.w.toFixed(1)}" W)`;
            }
        }

        disposeObject(objToDelete);
    }

    // 3. Clear overlays and re-render scene immediately
    updateDimensionsOverlay();
    if (renderer && scene && camera) {
        renderer.render(scene, camera);
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

function parseDim(str, defaultUnit = 'in') {
    if (str === null || str === undefined) return null;
    str = String(str).trim().toLowerCase();
    if (!str) return null;

    // Explicit feet: "2ft", "2 ft", "2.5 ft", "2'", "2 feet", "2 foot"
    const ftMatch = str.match(/^([0-9]*\.?[0-9]+)\s*(ft|feet|foot|')\s*$/);
    if (ftMatch) {
        const num = parseFloat(ftMatch[1]);
        if (!isNaN(num) && num >= 0) {
            return {
                num: num,
                unit: 'ft',
                in: num * 12,
                ft: num,
                display: String(num)
            };
        }
    }

    // Explicit inches: "2in", "2 in", "2.5 in", "2\"", "2 inch", "2 inches"
    const inMatch = str.match(/^([0-9]*\.?[0-9]+)\s*(in|inch|inches|"|'')\s*$/);
    if (inMatch) {
        const num = parseFloat(inMatch[1]);
        if (!isNaN(num) && num >= 0) {
            return {
                num: num,
                unit: 'in',
                in: num,
                ft: num / 12,
                display: String(num)
            };
        }
    }

    // Plain number without unit
    const plainMatch = str.match(/^([0-9]*\.?[0-9]+)\s*$/);
    if (plainMatch) {
        const num = parseFloat(plainMatch[1]);
        if (!isNaN(num) && num >= 0) {
            if (defaultUnit === 'ft') {
                return {
                    num: num,
                    unit: 'ft',
                    in: num * 12,
                    ft: num,
                    display: String(num)
                };
            } else {
                return {
                    num: num,
                    unit: 'in',
                    in: num,
                    ft: num / 12,
                    display: String(num)
                };
            }
        }
    }

    // Loose fallback for any typed text containing numbers
    const num = parseFloat(str);
    if (!isNaN(num) && num >= 0) {
        if (str.includes('ft') || str.includes("'")) {
            return { num, unit: 'ft', in: num * 12, ft: num, display: String(num) };
        }
        if (str.includes('in') || str.includes('"')) {
            return { num, unit: 'in', in: num, ft: num / 12, display: String(num) };
        }
        if (defaultUnit === 'ft') {
            return { num, unit: 'ft', in: num * 12, ft: num, display: String(num) };
        } else {
            return { num, unit: 'in', in: num, ft: num / 12, display: String(num) };
        }
    }

    return null;
}

function updateDimensionsFromInputs() {
    // 1. Read Base Unit Inputs
    const hInput = document.getElementById('cad-h-in');
    const wInput = document.getElementById('cad-w-ft');
    const dInput = document.getElementById('cad-d-ft');
    const plinthInput = document.getElementById('cad-plinth-in');

    const hUnit = (hInput && hInput.dataset.activeUnit) || 'in';
    const wUnit = (wInput && wInput.dataset.activeUnit) || 'ft';
    const dUnit = (dInput && dInput.dataset.activeUnit) || 'ft';
    const plinthUnit = (plinthInput && plinthInput.dataset.activeUnit) || 'in';

    const hParsed = parseDim(hInput ? hInput.value : '', hUnit) || { in: 32, ft: 2.67, unit: 'in', num: 32 };
    const wParsed = parseDim(wInput ? wInput.value : '', wUnit) || { in: 132, ft: 11, unit: 'ft', num: 11 };
    const dParsed = parseDim(dInput ? dInput.value : '', dUnit) || { in: 24, ft: 2, unit: 'ft', num: 2 };
    const plinthParsed = parseDim(plinthInput ? plinthInput.value : '', plinthUnit) || { in: 3, ft: 0.25, unit: 'in', num: 3 };

    if (hInput && hParsed.unit) hInput.dataset.activeUnit = hParsed.unit;
    if (wInput && wParsed.unit) wInput.dataset.activeUnit = wParsed.unit;
    if (dInput && dParsed.unit) dInput.dataset.activeUnit = dParsed.unit;
    if (plinthInput && plinthParsed.unit) plinthInput.dataset.activeUnit = plinthParsed.unit;

    currentH = hParsed.in;
    currentW = wParsed.in;
    currentD = dParsed.in;
    currentPlinth = plinthParsed.in;
    currentThickness = 0.75;

    // Dynamically update column labels to reflect active unit (IN vs FT)
    const lblH = document.getElementById('lbl-cad-h-in');
    const lblW = document.getElementById('lbl-cad-w-ft');
    const lblD = document.getElementById('lbl-cad-d-ft');
    const lblPlinth = document.getElementById('lbl-cad-plinth-in');
    if (lblH) lblH.textContent = `HEIGHT (${hParsed.unit.toUpperCase()})`;
    if (lblW) lblW.textContent = `WIDTH (${wParsed.unit.toUpperCase()})`;
    if (lblD) lblD.textContent = `DEPTH (${dParsed.unit.toUpperCase()})`;
    if (lblPlinth) lblPlinth.textContent = `PLINTH (${plinthParsed.unit.toUpperCase()})`;

    // Update Base Subtext Labels
    const hSub = document.getElementById('cad-h-sub');
    const wSub = document.getElementById('cad-w-sub');
    const dSub = document.getElementById('cad-d-sub');
    const plinthSub = document.getElementById('cad-plinth-sub');
    const summary = document.getElementById('cad-dim-summary');

    if (hSub) hSub.textContent = `~ ${hParsed.in.toFixed(0)}" (${hParsed.ft.toFixed(2)} ft)`;
    if (wSub) wSub.textContent = `~ ${wParsed.in.toFixed(0)}" (${wParsed.ft.toFixed(0)} ft)`;
    const dFtDisplay = dParsed.ft >= 1 ? dParsed.ft.toFixed(0) : dParsed.ft.toFixed(2);
    if (dSub) dSub.textContent = `~ ${dParsed.in.toFixed(0)}" (${dFtDisplay} ft)`;
    if (plinthSub) plinthSub.textContent = `~ ${plinthParsed.in.toFixed(0)}"`;
    if (summary) summary.textContent = `${hParsed.in.toFixed(0)}" H × ${wParsed.in.toFixed(0)}" W × ${dParsed.in.toFixed(0)}" D`;

    // 2. Read Wall Unit Inputs
    const wallHInput = document.getElementById('cad-wall-h-in');
    const wallWInput = document.getElementById('cad-wall-w-ft');
    const wallDInput = document.getElementById('cad-wall-d-ft');
    const dadoGapInput = document.getElementById('cad-dado-gap-in');

    const wallHUnit = (wallHInput && wallHInput.dataset.activeUnit) || 'in';
    const wallWUnit = (wallWInput && wallWInput.dataset.activeUnit) || 'ft';
    const wallDUnit = (wallDInput && wallDInput.dataset.activeUnit) || 'ft';
    const dadoGapUnit = (dadoGapInput && dadoGapInput.dataset.activeUnit) || 'in';

    const wallHParsed = parseDim(wallHInput ? wallHInput.value : '', wallHUnit) || { in: 30, ft: 2.5, unit: 'in', num: 30 };
    const wallWParsed = parseDim(wallWInput ? wallWInput.value : '', wallWUnit) || { in: 132, ft: 11, unit: 'ft', num: 11 };
    const wallDParsed = parseDim(wallDInput ? wallDInput.value : '', wallDUnit) || { in: 12, ft: 1, unit: 'ft', num: 1 };
    const dadoGapParsed = parseDim(dadoGapInput ? dadoGapInput.value : '', dadoGapUnit) || { in: 22, ft: 1.83, unit: 'in', num: 22 };

    if (wallHInput && wallHParsed.unit) wallHInput.dataset.activeUnit = wallHParsed.unit;
    if (wallWInput && wallWParsed.unit) wallWInput.dataset.activeUnit = wallWParsed.unit;
    if (wallDInput && wallDParsed.unit) wallDInput.dataset.activeUnit = wallDParsed.unit;
    if (dadoGapInput && dadoGapParsed.unit) dadoGapInput.dataset.activeUnit = dadoGapParsed.unit;

    currentWallH = wallHParsed.in;
    currentWallW = wallWParsed.in;
    currentWallD = wallDParsed.in;
    currentDadoGap = dadoGapParsed.in;

    // Dynamically update Wall column labels
    const lblWallH = document.getElementById('lbl-cad-wall-h-in');
    const lblWallW = document.getElementById('lbl-cad-wall-w-ft');
    const lblWallD = document.getElementById('lbl-cad-wall-d-ft');
    const lblDadoGap = document.getElementById('lbl-cad-dado-gap-in');
    if (lblWallH) lblWallH.textContent = `HEIGHT (${wallHParsed.unit.toUpperCase()})`;
    if (lblWallW) lblWallW.textContent = `WIDTH (${wallWParsed.unit.toUpperCase()})`;
    if (lblWallD) lblWallD.textContent = `DEPTH (${wallDParsed.unit.toUpperCase()})`;
    if (lblDadoGap) lblDadoGap.textContent = `WALL GAP (${dadoGapParsed.unit.toUpperCase()})`;

    // Update Wall Subtext Labels
    const wallHSub = document.getElementById('cad-wall-h-sub');
    const wallWSub = document.getElementById('cad-wall-w-sub');
    const wallDSub = document.getElementById('cad-wall-d-sub');
    const dadoGapSub = document.getElementById('cad-dado-gap-sub');
    const wallSummary = document.getElementById('cad-wall-dim-summary');

    if (wallHSub) wallHSub.textContent = `~ ${wallHParsed.in.toFixed(0)}" (${wallHParsed.ft.toFixed(2)} ft)`;
    if (wallWSub) wallWSub.textContent = `~ ${wallWParsed.in.toFixed(0)}" (${wallWParsed.ft.toFixed(0)} ft)`;
    const wallDFtDisplay = wallDParsed.ft >= 1 ? wallDParsed.ft.toFixed(0) : wallDParsed.ft.toFixed(2);
    if (wallDSub) wallDSub.textContent = `~ ${wallDParsed.in.toFixed(0)}" (${wallDFtDisplay} ft)`;
    if (dadoGapSub) dadoGapSub.textContent = `~ ${dadoGapParsed.in.toFixed(0)}" (Dado)`;
    if (wallSummary) wallSummary.textContent = `${wallHParsed.in.toFixed(0)}" H × ${wallWParsed.in.toFixed(0)}" W × ${wallDParsed.in.toFixed(0)}" D`;

    // 3. Read Multi-run Return Inputs (for L & U Kitchens)
    const lReturnInput = document.getElementById('cad-l-return-ft');
    if (lReturnInput) {
        const lUnit = lReturnInput.dataset.activeUnit || 'ft';
        const lParsed = parseDim(lReturnInput.value, lUnit) || { in: 84, ft: 7, unit: 'ft', num: 7 };
        if (lParsed.unit) lReturnInput.dataset.activeUnit = lParsed.unit;
        currentLReturnFt = lParsed.ft;
        const lSub = document.getElementById('cad-l-return-sub');
        if (lSub) lSub.textContent = `~ ${lParsed.in.toFixed(0)}" (${lParsed.ft.toFixed(0)} ft)`;
    }

    const uLeftInput = document.getElementById('cad-u-left-ft');
    if (uLeftInput) {
        const uLUnit = uLeftInput.dataset.activeUnit || 'ft';
        const uLParsed = parseDim(uLeftInput.value, uLUnit) || { in: 84, ft: 7, unit: 'ft', num: 7 };
        if (uLParsed.unit) uLeftInput.dataset.activeUnit = uLParsed.unit;
        currentULeftFt = uLParsed.ft;
        const uLSub = document.getElementById('cad-u-left-sub');
        if (uLSub) uLSub.textContent = `~ ${uLParsed.in.toFixed(0)}" (${uLParsed.ft.toFixed(0)} ft)`;
    }

    const uRightInput = document.getElementById('cad-u-right-ft');
    if (uRightInput) {
        const uRUnit = uRightInput.dataset.activeUnit || 'ft';
        const uRParsed = parseDim(uRightInput.value, uRUnit) || { in: 84, ft: 7, unit: 'ft', num: 7 };
        if (uRParsed.unit) uRightInput.dataset.activeUnit = uRParsed.unit;
        currentURightFt = uRParsed.ft;
        const uRSub = document.getElementById('cad-u-right-sub');
        if (uRSub) uRSub.textContent = `~ ${uRParsed.in.toFixed(0)}" (${uRParsed.ft.toFixed(0)} ft)`;
    }

    // Dynamic Run Width Label updates
    if (currentKitchenLayout === 'l-shape') {
        if (lblW) lblW.textContent = `MAIN RUN (${wParsed.unit.toUpperCase()})`;
        if (lblWallW) lblWallW.textContent = `MAIN RUN (${wallWParsed.unit.toUpperCase()})`;
        if (summary) summary.textContent = `${hParsed.in.toFixed(0)}" H × ${wParsed.in.toFixed(0)}" Main × ${(currentLReturnFt * 12).toFixed(0)}" Ret`;
    } else if (currentKitchenLayout === 'u-shape') {
        if (lblW) lblW.textContent = `CENTER RUN (${wParsed.unit.toUpperCase()})`;
        if (lblWallW) lblWallW.textContent = `CENTER RUN (${wallWParsed.unit.toUpperCase()})`;
        if (summary) summary.textContent = `${hParsed.in.toFixed(0)}" H × [${(currentULeftFt * 12).toFixed(0)}" | ${wParsed.in.toFixed(0)}" | ${(currentURightFt * 12).toFixed(0)}"]`;
    }
    
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

function setKitchenLayout(layout) {
    currentKitchenLayout = layout;
    
    // Update active pill
    document.querySelectorAll('.layout-pill').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.layout === layout);
    });

    const badge = document.getElementById('cad-layout-badge');
    const lControls = document.getElementById('cad-l-controls');
    const uControls = document.getElementById('cad-u-controls');
    const lblBaseW = document.getElementById('lbl-cad-w-ft');
    const lblWallW = document.getElementById('lbl-cad-wall-w-ft');

    if (layout === 'l-shape') {
        if (badge) badge.textContent = 'L-Kitchen';
        if (lControls) lControls.style.display = 'block';
        if (uControls) uControls.style.display = 'none';
        if (lblBaseW) lblBaseW.textContent = 'MAIN RUN (FT)';
        if (lblWallW) lblWallW.textContent = 'MAIN RUN (FT)';
    } else if (layout === 'u-shape') {
        if (badge) badge.textContent = 'U-Kitchen';
        if (lControls) lControls.style.display = 'none';
        if (uControls) uControls.style.display = 'block';
        if (lblBaseW) lblBaseW.textContent = 'CENTER RUN (FT)';
        if (lblWallW) lblWallW.textContent = 'CENTER RUN (FT)';
    } else {
        if (badge) badge.textContent = 'Straight';
        if (lControls) lControls.style.display = 'none';
        if (uControls) uControls.style.display = 'none';
        if (lblBaseW) lblBaseW.textContent = 'WIDTH (FT)';
        if (lblWallW) lblWallW.textContent = 'WIDTH (FT)';
    }

    updateDimensionsFromInputs();
}

function buildReturnWing(wingSide, wingLengthFt) {
    const isRight = (wingSide === 'right');
    const sign = isRight ? 1 : -1;
    const wingLen = wingLengthFt * 12; // in inches
    const t = currentThickness;
    const shellColor = 0xc89d68;
    const plinthColor = 0x27272a;
    const kickRecess = 2; // 2" recessed toe kick
    const plinthY = currentPlinth / 2;

    const wMain = currentW;
    const dBase = currentD; // standard 24"
    const clearLenBase = Math.max(12, wingLen - dBase);

    const zStart = dBase / 2;
    const zEnd = -dBase / 2 + wingLen;
    const zCenter = (zStart + zEnd) / 2;
    const xBaseCenter = sign * (wMain / 2 - dBase / 2);

    // 1. BASE CABINET SHELL FOR RETURN WING
    if (currentKitchenMode === 'base' || currentKitchenMode === 'both') {
        const centerY = getBaseCenterY();
        const prefix = `[Base Return ${isRight ? 'R' : 'L'}]`;

        // Outer Back Panel along outer wall (facing perpendicular)
        const backP = createPanel(t, currentH, clearLenBase, shellColor, false, 'side');
        backP.position.set(sign * (wMain / 2 - t / 2), centerY, zCenter);
        backP.userData.label = `${prefix} Outer Side Panel`;
        backP.userData.module = 'base';
        backP.userData.w = t; backP.userData.h = currentH; backP.userData.d = clearLenBase;
        cabinetGroup.add(backP);
        shellObjects.push(backP);

        // Top Panel
        const topP = createPanel(dBase - t, t, clearLenBase, shellColor, false, 'top');
        topP.position.set(sign * (wMain / 2 - dBase / 2 - t / 4), centerY + currentH / 2 - t / 2, zCenter);
        topP.userData.label = `${prefix} Top`;
        topP.userData.module = 'base';
        topP.userData.w = dBase - t; topP.userData.h = t; topP.userData.d = clearLenBase;
        cabinetGroup.add(topP);
        shellObjects.push(topP);

        // Bottom Panel
        const botP = createPanel(dBase - t, t, clearLenBase, shellColor, false, 'bottom');
        botP.position.set(sign * (wMain / 2 - dBase / 2 - t / 4), centerY - currentH / 2 + t / 2, zCenter);
        botP.userData.label = `${prefix} Bottom`;
        botP.userData.module = 'base';
        botP.userData.w = dBase - t; botP.userData.h = t; botP.userData.d = clearLenBase;
        cabinetGroup.add(botP);
        shellObjects.push(botP);

        // End Capping Panel (at the open tip of the wing)
        const endP = createPanel(dBase, currentH, t, shellColor, false, 'side');
        endP.position.set(xBaseCenter, centerY, zEnd - t / 2);
        endP.userData.label = `${prefix} End Cap`;
        endP.userData.module = 'base';
        endP.userData.w = dBase; endP.userData.h = currentH; endP.userData.d = t;
        cabinetGroup.add(endP);
        shellObjects.push(endP);

        // Corner Junction Divider (between main run and return run)
        const cornerDiv = createPanel(dBase, currentH - 2 * t, t, shellColor, false, 'divider');
        cornerDiv.position.set(xBaseCenter, centerY, zStart + t / 2);
        cornerDiv.userData.label = `${prefix} Corner Divider`;
        cornerDiv.userData.module = 'base';
        cornerDiv.userData.w = dBase; cornerDiv.userData.h = currentH - 2 * t; cornerDiv.userData.d = t;
        cabinetGroup.add(cornerDiv);
        shellObjects.push(cornerDiv);

        // Plinth Kickboard for Return Wing
        if (currentPlinth > 0) {
            const innerPlinthX = sign * (wMain / 2 - dBase + kickRecess + t / 2);
            const plinthLen = clearLenBase - kickRecess;
            const kickReturn = createPanel(t, currentPlinth, plinthLen, plinthColor, false, 'plinth');
            kickReturn.position.set(innerPlinthX, plinthY, zStart + plinthLen / 2);
            kickReturn.userData.label = `${prefix} Plinth Kickboard`;
            kickReturn.userData.module = 'base';
            cabinetGroup.add(kickReturn);
            plinthObjects.push(kickReturn);

            const endPlinth = createPanel(dBase - kickRecess, currentPlinth, t, plinthColor, false, 'plinth');
            endPlinth.position.set(sign * (wMain / 2 - dBase / 2 + kickRecess / 2), plinthY, zEnd - kickRecess - t / 2);
            endPlinth.userData.label = `${prefix} Plinth End`;
            endPlinth.userData.module = 'base';
            cabinetGroup.add(endPlinth);
            plinthObjects.push(endPlinth);
        }

        // Return Countertop Slab
        if (currentKitchenMode === 'both') {
            const ctThick = 1.25;
            const ctY = getBaseTopY() + ctThick / 2;
            const ctLen = clearLenBase + 0.5; // 0.5" overhang at the tip
            const ctWidth = dBase + 1.0;
            const ctGeo = new THREE.BoxGeometry(ctWidth, ctThick, ctLen);
            const ctMat = new THREE.MeshPhongMaterial({ color: 0x1e293b, shininess: 40 });
            const ctMesh = new THREE.Mesh(ctGeo, ctMat);
            ctMesh.position.set(sign * (wMain / 2 - dBase / 2), ctY, zStart + ctLen / 2);
            const ctEdge = new THREE.LineSegments(new THREE.EdgesGeometry(ctGeo), new THREE.LineBasicMaterial({ color: 0x475569 }));
            ctMesh.add(ctEdge);
            ctMesh.userData = { isDecor: true, label: `Granite/Quartz Countertop (${isRight ? 'Right' : 'Left'} Return)` };
            cabinetGroup.add(ctMesh);
            decorObjects.push(ctMesh);
        }
    }

    // 2. DADO BACKSPLASH WALL FOR RETURN RUN
    if (currentKitchenMode === 'both' && currentDadoGap > 0) {
        const bsH = currentDadoGap;
        const bsD = 0.5;
        const bsY = getCountertopTopY() + bsH / 2;
        const bsGeo = new THREE.BoxGeometry(bsD, bsH, wingLen);
        const bsMat = new THREE.MeshPhongMaterial({ color: 0x334155, shininess: 20 });
        const bsMesh = new THREE.Mesh(bsGeo, bsMat);
        bsMesh.position.set(sign * (wMain / 2 - bsD / 2), bsY, -dBase / 2 + wingLen / 2);
        const bsEdge = new THREE.LineSegments(new THREE.EdgesGeometry(bsGeo), new THREE.LineBasicMaterial({ color: 0x64748b }));
        bsMesh.add(bsEdge);
        bsMesh.userData = { isDecor: true, label: `Dado Backsplash Wall (${isRight ? 'Right' : 'Left'} Return)` };
        cabinetGroup.add(bsMesh);
        decorObjects.push(bsMesh);
    }

    // 3. WALL CABINET FOR RETURN RUN
    if (currentKitchenMode === 'wall' || currentKitchenMode === 'both') {
        const dWall = currentWallD; // 12"
        const clearLenWall = Math.max(12, wingLen - dWall);
        const zWallStart = -dBase / 2 + dWall;
        const zWallEnd = -dBase / 2 + wingLen;
        const zWallCenter = (zWallStart + zWallEnd) / 2;
        const xWallCenter = sign * (currentWallW / 2 - dWall / 2);
        const wallCenterY = getWallCenterY();
        const prefix = `[Wall Return ${isRight ? 'R' : 'L'}]`;

        // Outer Back Panel along outer wall
        const backW = createPanel(t, currentWallH, clearLenWall, shellColor, false, 'side');
        backW.position.set(sign * (currentWallW / 2 - t / 2), wallCenterY, zWallCenter);
        backW.userData.label = `${prefix} Outer Side Panel`;
        backW.userData.module = 'wall';
        backW.userData.w = t; backW.userData.h = currentWallH; backW.userData.d = clearLenWall;
        cabinetGroup.add(backW);
        shellObjects.push(backW);

        // Top Panel
        const topW = createPanel(dWall - t, t, clearLenWall, shellColor, false, 'top');
        topW.position.set(sign * (currentWallW / 2 - dWall / 2 - t / 4), wallCenterY + currentWallH / 2 - t / 2, zWallCenter);
        topW.userData.label = `${prefix} Top`;
        topW.userData.module = 'wall';
        topW.userData.w = dWall - t; topW.userData.h = t; topW.userData.d = clearLenWall;
        cabinetGroup.add(topW);
        shellObjects.push(topW);

        // Bottom Panel
        const botW = createPanel(dWall - t, t, clearLenWall, shellColor, false, 'bottom');
        botW.position.set(sign * (currentWallW / 2 - dWall / 2 - t / 4), wallCenterY - currentWallH / 2 + t / 2, zWallCenter);
        botW.userData.label = `${prefix} Bottom`;
        botW.userData.module = 'wall';
        botW.userData.w = dWall - t; botW.userData.h = t; botW.userData.d = clearLenWall;
        cabinetGroup.add(botW);
        shellObjects.push(botW);

        // End Capping Panel
        const endW = createPanel(dWall, currentWallH, t, shellColor, false, 'side');
        endW.position.set(xWallCenter, wallCenterY, zWallEnd - t / 2);
        endW.userData.label = `${prefix} End Cap`;
        endW.userData.module = 'wall';
        endW.userData.w = dWall; endW.userData.h = currentWallH; endW.userData.d = t;
        cabinetGroup.add(endW);
        shellObjects.push(endW);
    }
}

function syncReturnWingPartitions(wingSide, wingLengthFt, module) {
    const isRight = (wingSide === 'right');
    const sign = isRight ? 1 : -1;
    const isWall = (module === 'wall');
    const wingLen = wingLengthFt * 12;
    const t = currentThickness;
    const dBase = currentD;
    const dWall = currentWallD;
    const depth = isWall ? dWall : dBase;
    const clearLen = isWall ? Math.max(12, wingLen - dWall) : Math.max(12, wingLen - dBase);
    const zStart = isWall ? (-dBase / 2 + dWall) : (dBase / 2);
    const zEnd = -dBase / 2 + wingLen;
    const zCenter = (zStart + zEnd) / 2;
    const prefix = `[${isWall ? 'Wall' : 'Base'} Return ${isRight ? 'R' : 'L'}]`;

    // 1. Shelves
    const shelfInputId = isWall ? 'cad-wall-shelves-count' : 'cad-shelves-count';
    const shelfCount = parseInt(document.getElementById(shelfInputId)?.value) || 0;
    if (shelfCount > 0) {
        const innerH = (isWall ? currentWallH : currentH) - (2 * t);
        const innerBottomY = isWall ? (getWallBottomY() + t) : (getBaseBottomY() + t);
        const spacing = innerH / (shelfCount + 1);
        const shelfW = depth - 2 * t - 0.5;
        const shelfLen = clearLen - 2 * t;
        const shelfX = sign * ((isWall ? currentWallW : currentW) / 2 - depth / 2);

        for (let s = 1; s <= shelfCount; s++) {
            const shelf = createPanel(shelfW, t, shelfLen, 0xdeb887, true, 'shelf');
            shelf.position.set(shelfX, innerBottomY + (s * spacing), zCenter);
            shelf.userData.label = `${prefix} Shelf ${s}`;
            shelf.userData.isAutoShelf = true;
            shelf.userData.module = module;
            cabinetGroup.add(shelf);
        }
    }

    // 2. Shutters (Doors)
    let doorCount = 2;
    if (clearLen <= 32) doorCount = 1;
    else if (clearLen > 68) doorCount = 3;

    const gap = 0.125;
    const totalGaps = gap * (doorCount + 1);
    const doorLen = (clearLen - totalGaps) / doorCount;
    const doorH = (isWall ? currentWallH : currentH) - (gap * 2);
    const doorThickness = 0.75;
    const doorCenterY = isWall ? getWallCenterY() : getBaseCenterY();
    const faceX = sign * ((isWall ? currentWallW : currentW) / 2 - depth) + (sign * -doorThickness / 2);

    let curZ = zStart + gap + doorLen / 2;
    for (let d = 0; d < doorCount; d++) {
        const door = createPanel(doorThickness, doorH, doorLen, 0xdeb887, true, 'shutter');
        door.userData.label = `${prefix} Shutter ${d + 1}`;
        door.userData.module = module;
        door.userData.type = 'shutter';
        door.userData.shutterIndex = d + 1;
        door.userData.w = doorLen;
        door.userData.h = doorH;
        door.userData.d = doorThickness;
        door.userData.shutterW = doorLen;
        door.userData.shutterH = doorH;
        door.userData.shutterD = doorThickness;
        door.userData.customEdge = 'all';
        door.userData.customLaminate = 'single';
        applyLaminateMaterials(door, 'shutter', 'single', 'all');

        const isHingedFar = (d % 2 === 1);
        const pivotOffsetZ = isHingedFar ? doorLen / 2 : -doorLen / 2;
        door.geometry.translate(0, 0, -pivotOffsetZ);
        door.children.forEach(c => {
            if (c.geometry) c.geometry.translate(0, 0, -pivotOffsetZ);
        });

        door.position.set(faceX, doorCenterY, curZ + pivotOffsetZ);

        door.userData.closedRotationY = 0;
        if (isRight) {
            door.userData.openRotationY = isHingedFar ? -Math.PI / 2 : Math.PI / 2;
        } else {
            door.userData.openRotationY = isHingedFar ? Math.PI / 2 : -Math.PI / 2;
        }

        if (shuttersOpen) {
            door.rotation.y = door.userData.openRotationY;
            door.layers.set(1);
        }

        cabinetGroup.add(door);
        curZ += doorLen + gap;
    }
}

function updateCameraFraming() {
    let centerY = 0;
    let maxDim = 100;

    const totalH = (currentKitchenMode === 'both') ? getWallTopY() : ((currentKitchenMode === 'base') ? getBaseTopY() : currentWallH);
    centerY = totalH / 2;

    const maxW = (currentKitchenMode === 'wall') ? currentWallW : Math.max(currentW, currentWallW);
    let maxD = currentD;

    if (currentKitchenLayout === 'l-shape') {
        maxD = currentD + (currentLReturnFt * 12);
        maxDim = Math.max(maxW, maxD, totalH);
        const sign = (currentLReturnSide === 'right') ? 1 : -1;
        const targetZ = (-currentD / 2 + (currentLReturnFt * 12)) * 0.35;
        camera.position.set(-sign * (maxDim * 0.65), centerY + (maxDim * 0.55), maxDim * 1.35);
        orbit.target.set(0, centerY, targetZ);
    } else if (currentKitchenLayout === 'u-shape') {
        maxD = currentD + Math.max(currentULeftFt, currentURightFt) * 12;
        maxDim = Math.max(maxW, maxD, totalH);
        const targetZ = (-currentD / 2 + Math.max(currentULeftFt, currentURightFt) * 12) * 0.35;
        camera.position.set(0, centerY + (maxDim * 0.65), maxDim * 1.45);
        orbit.target.set(0, centerY, targetZ);
    } else {
        maxDim = Math.max(maxW, totalH, currentD);
        camera.position.set(0, centerY + (maxDim * 0.35), maxDim * 1.55);
        orbit.target.set(0, centerY, 0);
    }

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

    // Modular Multi-Run Layout Generation (L-Kitchen & U-Kitchen)
    if (currentKitchenLayout === 'l-shape') {
        buildReturnWing(currentLReturnSide, currentLReturnFt);
    } else if (currentKitchenLayout === 'u-shape') {
        buildReturnWing('left', currentULeftFt);
        buildReturnWing('right', currentURightFt);
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

    // Sync Return Wings for L-Kitchen & U-Kitchen
    if (currentKitchenLayout === 'l-shape') {
        if (currentKitchenMode === 'base' || currentKitchenMode === 'both') {
            syncReturnWingPartitions(currentLReturnSide, currentLReturnFt, 'base');
        }
        if (currentKitchenMode === 'wall' || currentKitchenMode === 'both') {
            syncReturnWingPartitions(currentLReturnSide, currentLReturnFt, 'wall');
        }
    } else if (currentKitchenLayout === 'u-shape') {
        if (currentKitchenMode === 'base' || currentKitchenMode === 'both') {
            syncReturnWingPartitions('left', currentULeftFt, 'base');
            syncReturnWingPartitions('right', currentURightFt, 'base');
        }
        if (currentKitchenMode === 'wall' || currentKitchenMode === 'both') {
            syncReturnWingPartitions('left', currentULeftFt, 'wall');
            syncReturnWingPartitions('right', currentURightFt, 'wall');
        }
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
    
    if (count <= 0) {
        if (module === 'base') updateExistingDrawers();
        return;
    }
    
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

    if (module === 'base') {
        updateExistingDrawers();
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
    
    if (count <= 0) {
        if (module === 'base') updateExistingDrawers();
        syncShuttersFromSelect(module);
        return;
    }
    
    const t = currentThickness;
    const isWall = (module === 'wall');
    const h = isWall ? currentWallH : currentH;
    const d = isWall ? currentWallD : currentD;
    
    const innerH = h - (2 * t);
    const divDepth = d - 1.0;
    const divColor = 0xdeb887;
    const prefix = isWall ? '[Wall]' : '[Base]';

    const centerY = isWall ? getWallCenterY() : getBaseCenterY();
    const centerZ = isWall ? (getWallCenterZ() - 0.5) : -0.5;
    
    const layout = calculateBayLayout(module);
    
    for (let i = 1; i <= count; i++) {
        const divX = layout.startX + (i * layout.pocketW) + ((i - 0.5) * t);
        const divider = createPanel(t, innerH, divDepth, divColor, true, 'divider');
        divider.position.set(divX, centerY, centerZ);
        divider.userData.label = `${prefix} Vertical Divider ${i}`;
        divider.userData.isAutoDivider = true;
        divider.userData.module = module;
        cabinetGroup.add(divider);
    }

    if (module === 'base') {
        updateExistingDrawers();
    }
    syncShuttersFromSelect(module);
}

function updateShutterSubtexts() {
    ['base', 'wall'].forEach(mod => {
        const selectId = (mod === 'wall') ? 'cad-wall-shutter-select' : 'cad-shutter-select';
        const subId = (mod === 'wall') ? 'cad-wall-shutter-sub' : 'cad-shutter-sub';
        const select = document.getElementById(selectId);
        const subEl = document.getElementById(subId);
        if (!select || !subEl) return;
        const count = parseInt(select.value) || 0;
        if (count <= 0) {
            subEl.textContent = 'None (Open)';
            return;
        }
        const isWall = (mod === 'wall');
        const w = isWall ? currentWallW : currentW;
        const h = isWall ? currentWallH : currentH;
        const gap = 0.125;
        const totalGapSpace = gap * (count + 1);
        const shutterW = (w - totalGapSpace) / count;
        const shutterH = h - (gap * 2);
        subEl.textContent = `Each: ${shutterW.toFixed(1)}" W × ${shutterH.toFixed(1)}" H`;
    });
}

function syncShuttersFromSelect(module) {
    const selectId = (module === 'wall') ? 'cad-wall-shutter-select' : 'cad-shutter-select';
    const shutterSelect = document.getElementById(selectId);
    if (!shutterSelect) return;

    // Handle "Custom..." door count entry
    if (shutterSelect.value === 'custom') {
        const promptMsg = `Enter number of doors for ${module === 'wall' ? 'WALL' : 'BASE'} cabinet (e.g. 7, 8, 12, 16, 20):`;
        const defaultVal = shutterSelect.dataset.prevValue && shutterSelect.dataset.prevValue !== 'custom' ? shutterSelect.dataset.prevValue : '8';
        const userInput = prompt(promptMsg, defaultVal);
        const parsed = parseInt(userInput);
        if (!isNaN(parsed) && parsed >= 0 && parsed <= 50) {
            let opt = Array.from(shutterSelect.options).find(o => o.value === String(parsed));
            if (!opt) {
                opt = document.createElement('option');
                opt.value = String(parsed);
                opt.textContent = parsed === 0 ? 'None (Open)' : (parsed === 1 ? '1 Door' : `${parsed} Doors`);
                const customOpt = shutterSelect.querySelector('option[value="custom"]');
                if (customOpt) shutterSelect.insertBefore(opt, customOpt);
                else shutterSelect.appendChild(opt);
            }
            shutterSelect.value = String(parsed);
        } else {
            shutterSelect.value = shutterSelect.dataset.prevValue || '4';
            return;
        }
    }
    shutterSelect.dataset.prevValue = shutterSelect.value;
    const count = parseInt(shutterSelect.value) || 0;
    
    // Update subtext indicator immediately
    updateShutterSubtexts();

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
        shutter.userData.type = 'shutter';
        shutter.userData.shutterIndex = i + 1;
        shutter.userData.totalShutters = count;
        shutter.userData.shutterW = shutterW;
        shutter.userData.shutterH = shutterH;
        shutter.userData.shutterD = shutterD;
        shutter.userData.w = shutterW;
        shutter.userData.h = shutterH;
        shutter.userData.d = shutterD;
        shutter.userData.customEdge = 'all';
        shutter.userData.customLaminate = 'single';
        applyLaminateMaterials(shutter, 'shutter', 'single', 'all');
        if (!internalParts.includes(shutter)) internalParts.push(shutter);
        
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
        shutter.userData.lockX = false;
        shutter.userData.lockY = false;

        if (shuttersOpen) {
            shutter.rotation.y = shutter.userData.openRotationY;
            shutter.layers.set(1);
        }
        
        cabinetGroup.add(shutter);
        
        // Auto hinge partition between door pairs (only when manual vertical dividers are 0)
        const divInputId = (module === 'wall') ? 'cad-wall-dividers-count' : 'cad-dividers-count';
        const manualDivCount = parseInt(document.getElementById(divInputId)?.value) || 0;
        if (manualDivCount === 0 && i % 2 === 1 && i < count - 1) {
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
    if (hInput) {
        hInput.value = preset.hIn;
        hInput.dataset.activeUnit = 'in';
    }
    if (wInput) {
        wInput.value = preset.wFt;
        wInput.dataset.activeUnit = 'ft';
    }
    if (dInput) {
        dInput.value = preset.dFt;
        dInput.dataset.activeUnit = 'ft';
    }
    if (plinthInput) {
        plinthInput.value = preset.plinthIn;
        plinthInput.dataset.activeUnit = 'in';
    }
    if (shelvesInput) shelvesInput.value = preset.shelves;
    if (dividersInput) dividersInput.value = preset.dividers;
    if (shutterSelect) shutterSelect.value = preset.shutters;

    if (wallHInput && preset.wallHIn !== undefined) {
        wallHInput.value = preset.wallHIn;
        wallHInput.dataset.activeUnit = 'in';
    }
    if (wallWInput && preset.wallWFt !== undefined) {
        wallWInput.value = preset.wallWFt;
        wallWInput.dataset.activeUnit = 'ft';
    }
    if (wallDInput && preset.wallDFt !== undefined) {
        wallDInput.value = preset.wallDFt;
        wallDInput.dataset.activeUnit = 'ft';
    }
    if (dadoGapInput && preset.dadoGapIn !== undefined) {
        dadoGapInput.value = preset.dadoGapIn;
        dadoGapInput.dataset.activeUnit = 'in';
    }
    if (wallShelvesInput && preset.wallShelves !== undefined) wallShelvesInput.value = preset.wallShelves;
    if (wallDividersInput && preset.wallDividers !== undefined) wallDividersInput.value = preset.wallDividers;
    if (wallShutterSelect && preset.wallShutters !== undefined) wallShutterSelect.value = preset.wallShutters;
    
    const layoutSec = document.getElementById('cad-kitchen-layout-section');
    if (presetKey.startsWith('kitchen-')) {
        if (layoutSec) layoutSec.style.display = 'block';
    } else {
        if (layoutSec) layoutSec.style.display = 'none';
        currentKitchenLayout = 'straight';
        document.querySelectorAll('.layout-pill').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.layout === 'straight');
        });
        const lControls = document.getElementById('cad-l-controls');
        const uControls = document.getElementById('cad-u-controls');
        if (lControls) lControls.style.display = 'none';
        if (uControls) uControls.style.display = 'none';
    }

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

    // Kitchen Layout Shape Selector Pills (Straight / L-Kitchen / U-Kitchen)
    document.querySelectorAll('.layout-pill').forEach(btn => {
        btn.addEventListener('click', () => {
            setKitchenLayout(btn.dataset.layout);
        });
    });

    // Corner Return Side Toggle (Left / Right)
    document.querySelectorAll('.corner-side-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.corner-side-btn').forEach(b => b.classList.toggle('active', b === btn));
            currentLReturnSide = btn.dataset.side;
            updateDimensionsFromInputs();
        });
    });

    function attachDimFieldHandlers(inputId, defaultUnit) {
        const el = document.getElementById(inputId);
        if (!el) return;

        el.addEventListener('focus', () => {
            el.select();
        });

        el.addEventListener('input', () => {
            const raw = el.value.trim().toLowerCase();
            const hasExplicitUnit = /(?:in|inch|inches|"|''|ft|feet|foot|')$/i.test(raw);
            const activeUnit = el.dataset.activeUnit || defaultUnit;
            const parsed = parseDim(el.value, activeUnit);
            
            if (parsed) {
                if (parsed.unit) {
                    el.dataset.activeUnit = parsed.unit;
                }
                if (hasExplicitUnit) {
                    // Stripping the unit from the input field so it becomes invisible,
                    // leaving pure number in the input box, while activeUnit & bracket are updated!
                    el.value = parsed.num;
                }
            }
            updateDimensionsFromInputs();
            buildShell();
            syncPartitionsAndDoors();
        });

        const commitValue = () => {
            const activeUnit = el.dataset.activeUnit || defaultUnit;
            const parsed = parseDim(el.value, activeUnit);
            if (parsed && !isNaN(parsed.num)) {
                el.dataset.activeUnit = parsed.unit;
                el.value = parsed.num;
            }
            updateDimensionsFromInputs();
            buildShell();
            syncPartitionsAndDoors();
        };

        el.addEventListener('blur', commitValue);
        el.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                commitValue();
                el.blur();
            }
        });
    }

    // Attach smart dimension field handlers (supporting 2in, 2 in, 2ft, 2 ft, auto unit conversion)
    attachDimFieldHandlers('cad-h-in', 'in');
    attachDimFieldHandlers('cad-w-ft', 'ft');
    attachDimFieldHandlers('cad-d-ft', 'ft');
    attachDimFieldHandlers('cad-plinth-in', 'in');

    attachDimFieldHandlers('cad-wall-h-in', 'in');
    attachDimFieldHandlers('cad-wall-w-ft', 'ft');
    attachDimFieldHandlers('cad-wall-d-ft', 'ft');
    attachDimFieldHandlers('cad-dado-gap-in', 'in');

    attachDimFieldHandlers('cad-l-return-ft', 'ft');
    attachDimFieldHandlers('cad-u-left-ft', 'ft');
    attachDimFieldHandlers('cad-u-right-ft', 'ft');

    // Auto-select text on focus and Enter-blur for integer count inputs
    ['cad-shelves-count', 'cad-dividers-count', 'cad-wall-shelves-count', 'cad-wall-dividers-count', 'cab-preset-qty', 'cad-l-return-ft', 'cad-u-left-ft', 'cad-u-right-ft'].forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.addEventListener('focus', () => el.select());
            el.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') el.blur();
            });
        }
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

    // Modern Stepper Arrow Controls for Shelves & Vertical Dividers
    document.querySelectorAll('.cad-stepper-arrow').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            const targetId = btn.dataset.target;
            const input = document.getElementById(targetId);
            if (!input) return;
            const isUp = btn.classList.contains('cad-stepper-up');
            let val = parseInt(input.value);
            if (isNaN(val)) val = 0;
            val = isUp ? val + 1 : Math.max(0, val - 1);
            input.value = val;
            input.dispatchEvent(new Event('input', { bubbles: true }));
        });
    });

    // ArrowUp / ArrowDown keyboard stepper on partition & return inputs
    ['cad-shelves-count', 'cad-dividers-count', 'cad-wall-shelves-count', 'cad-wall-dividers-count', 'cad-l-return-ft', 'cad-u-left-ft', 'cad-u-right-ft'].forEach(id => {
        const input = document.getElementById(id);
        if (input) {
            input.addEventListener('keydown', (e) => {
                if (e.key === 'ArrowUp') {
                    e.preventDefault();
                    let val = parseInt(input.value);
                    if (isNaN(val)) val = 0;
                    input.value = val + 1;
                    input.dispatchEvent(new Event('input', { bubbles: true }));
                } else if (e.key === 'ArrowDown') {
                    e.preventDefault();
                    let val = parseInt(input.value);
                    if (isNaN(val)) val = 0;
                    input.value = Math.max(0, val - 1);
                    input.dispatchEvent(new Event('input', { bubbles: true }));
                }
            });
        }
    });
    
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

    // Global Keyboard Listeners (Escape to deselect/cancel, Delete/Backspace to delete part)
    window.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' || e.key === 'Esc') {
            const activeTag = document.activeElement ? document.activeElement.tagName.toUpperCase() : '';
            const isEditable = document.activeElement && (
                activeTag === 'INPUT' || 
                activeTag === 'TEXTAREA' || 
                activeTag === 'SELECT' || 
                document.activeElement.isContentEditable
            );
            if (isEditable) {
                document.activeElement.blur();
                return;
            }
            if (selectedObject) {
                e.preventDefault();
                deselectObject();
            }
            return;
        }

        if (e.key === 'Delete' || e.key === 'Del' || e.key === 'Backspace') {
            const activeTag = document.activeElement ? document.activeElement.tagName.toUpperCase() : '';
            const isEditable = document.activeElement && (
                activeTag === 'INPUT' || 
                activeTag === 'TEXTAREA' || 
                activeTag === 'SELECT' || 
                document.activeElement.isContentEditable
            );
            if (isEditable) return;

            if (selectedObject) {
                e.preventDefault();
                deleteSelectedPart();
            }
        }
    });
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

function calculateBayLayout(module = 'base') {
    const isWall = (module === 'wall');
    const t = currentThickness;
    const w = isWall ? currentWallW : currentW;
    const innerW = w - (2 * t);
    const inputId = isWall ? 'cad-wall-dividers-count' : 'cad-dividers-count';
    const divInput = document.getElementById(inputId);
    const divCount = divInput ? (parseInt(divInput.value) || 0) : 0;
    const numBays = divCount + 1;
    
    // Equal clear pocket width between dividers
    const pocketW = (innerW - (divCount * t)) / numBays;
    const startX = -innerW / 2;
    
    const bayCenters = [];
    for (let k = 0; k < numBays; k++) {
        bayCenters.push(startX + (k * (pocketW + t)) + (pocketW / 2));
    }
    
    let middleBayIndices = [];
    if (numBays <= 1) {
        middleBayIndices = [0];
    } else if (numBays % 2 === 1) {
        // Odd number of bays (e.g. 3 bays => center bay index 1)
        middleBayIndices = [Math.floor(numBays / 2)];
    } else {
        // Even number of bays (e.g. 4 bays => middle bays indices 1 and 2; 2 bays => indices 0 and 1)
        const mid = numBays / 2;
        middleBayIndices = [mid - 1, mid];
    }
    
    return {
        isWall,
        t,
        w,
        innerW,
        divCount,
        numBays,
        pocketW,
        startX,
        bayCenters,
        middleBayIndices
    };
}

function createChannelGuides(group, drawerW, drawerH, drawerD, posX, posY, labelPrefix) {
    const channelMat = new THREE.MeshPhongMaterial({ color: 0x94a3b8, shininess: 75, specular: 0xdddddd });
    const channelEdgeMat = new THREE.LineBasicMaterial({ color: 0x475569 });

    const makeOuterGuide = (xPos, label) => {
        const geo = new THREE.BoxGeometry(0.22, 1.25, drawerD);
        const mesh = new THREE.Mesh(geo, channelMat);
        mesh.add(new THREE.LineSegments(new THREE.EdgesGeometry(geo), channelEdgeMat));
        mesh.position.set(xPos, posY - drawerH/2 + 1.2, -0.5);
        mesh.userData = { isChannelGuide: true, drawerGroup: group, label: label, module: 'base' };
        cabinetGroup.add(mesh);
    };

    makeOuterGuide(posX - drawerW/2 - 0.26, `${labelPrefix} Channel Left`);
    makeOuterGuide(posX + drawerW/2 + 0.26, `${labelPrefix} Channel Right`);
}

function createDrawerMeshGroup(drawerW, drawerH, drawerD, posX, posY, posZ, labelPrefix, bayIndex, tierIndex) {
    const t = currentThickness;
    const group = new THREE.Group();
    const dInnerW = Math.max(0.5, drawerW - (2 * t));
    const dInnerD = Math.max(0.5, drawerD - (2 * t));
    const colorHex = 0xdeb887;

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

    makeSubPanel(t, drawerH, drawerD, -drawerW/2 + t/2, 0, 0, `${labelPrefix} Side L`);
    makeSubPanel(t, drawerH, drawerD, drawerW/2 - t/2, 0, 0, `${labelPrefix} Side R`);
    makeSubPanel(dInnerW, drawerH, t, 0, 0, drawerD/2 - t/2, `${labelPrefix} Front Inner`);
    makeSubPanel(dInnerW, drawerH, t, 0, 0, -drawerD/2 + t/2, `${labelPrefix} Back`);
    makeSubPanel(drawerW, t, drawerD, 0, -drawerH/2 + t/2, 0, `${labelPrefix} Bottom`);
    makeSubPanel(drawerW + 0.5, drawerH + 1, t, 0, 0, drawerD/2 + t/2, `${labelPrefix} Fascia`);

    // Inner Channel Runners (Telescopic slide rails mounted to drawer sides)
    const runnerMat = new THREE.MeshPhongMaterial({ color: 0xe2e8f0, shininess: 90, specular: 0xffffff });
    const runnerEdgeMat = new THREE.LineBasicMaterial({ color: 0x64748b });
    const runnerGeo = new THREE.BoxGeometry(0.18, 1.05, drawerD);

    const runnerL = new THREE.Mesh(runnerGeo, runnerMat);
    runnerL.add(new THREE.LineSegments(new THREE.EdgesGeometry(runnerGeo), runnerEdgeMat));
    runnerL.position.set(-drawerW/2 - 0.09, -drawerH/2 + 1.2, 0);
    runnerL.userData = { isSubPart: true, type: 'slide_runner', label: `${labelPrefix} Channel Slide L`, module: 'base' };
    group.add(runnerL);

    const runnerR = new THREE.Mesh(runnerGeo, runnerMat);
    runnerR.add(new THREE.LineSegments(new THREE.EdgesGeometry(runnerGeo), runnerEdgeMat));
    runnerR.position.set(drawerW/2 + 0.09, -drawerH/2 + 1.2, 0);
    runnerR.userData = { isSubPart: true, type: 'slide_runner', label: `${labelPrefix} Channel Slide R`, module: 'base' };
    group.add(runnerR);

    // Modern Chrome Pull Handle on Fascia
    const handleMat = new THREE.MeshPhongMaterial({ color: 0xf8fafc, shininess: 120, specular: 0xffffff });
    const handleW = Math.min(10.0, Math.max(4.0, drawerW * 0.35));
    const handleGeo = new THREE.BoxGeometry(handleW, 0.45, 0.65);
    const handleMesh = new THREE.Mesh(handleGeo, handleMat);
    handleMesh.position.set(0, 0, drawerD/2 + t/2 + 0.4);
    handleMesh.userData = { isSubPart: true, type: 'handle', label: `${labelPrefix} Pull Handle`, module: 'base' };
    group.add(handleMesh);

    // HitBox for raycasting
    const hitBoxGeo = new THREE.BoxGeometry(drawerW + 0.5, drawerH + 1, drawerD + t);
    const hitBoxMat = new THREE.MeshBasicMaterial({ visible: false });
    const hitBox = new THREE.Mesh(hitBoxGeo, hitBoxMat);
    group.add(hitBox);

    const maxSlideZ = drawerD * 0.65;
    const initialZ = (posZ !== undefined) ? posZ : 0;

    hitBox.userData = { 
        type: 'drawer', 
        label: `${labelPrefix} Assembly`, 
        parentGroup: group, 
        module: 'base',
        bayIndex: bayIndex,
        tierIndex: tierIndex,
        w: drawerW,
        h: drawerH,
        d: drawerD,
        drawerW: drawerW,
        drawerH: drawerH,
        drawerD: drawerD,
        maxSlideZ: maxSlideZ
    };
    internalParts.push(hitBox);

    group.userData = { 
        isDrawerGroup: true, 
        module: 'base',
        hitBox: hitBox,
        labelPrefix: labelPrefix,
        label: `${labelPrefix} Assembly`,
        bayIndex: bayIndex,
        tierIndex: tierIndex,
        w: drawerW,
        h: drawerH,
        d: drawerD,
        drawerW: drawerW,
        drawerH: drawerH,
        drawerD: drawerD,
        maxSlideZ: maxSlideZ
    };
    group.position.set(posX, posY, initialZ);

    // Create fixed channel guides mounted to cabinet dividers
    createChannelGuides(group, drawerW, drawerH, drawerD, posX, posY, labelPrefix);

    return { group, hitBox };
}

function rebuildDrawerGroup(group, drawerW, drawerH, drawerD, posX, posY, posZ, bayIndex, tierIndex) {
    if (!group) return;
    
    // Clean up old channel guides
    const oldGuides = cabinetGroup.children.filter(c => c.userData && c.userData.isChannelGuide && c.userData.drawerGroup === group);
    oldGuides.forEach(g => {
        cabinetGroup.remove(g);
        if (g.geometry) g.geometry.dispose();
    });

    // Dispose old subparts
    while (group.children.length > 0) {
        const child = group.children[0];
        group.remove(child);
        if (child.geometry) child.geometry.dispose();
        if (child.material) {
            if (Array.isArray(child.material)) child.material.forEach(m => m.dispose());
            else child.material.dispose();
        }
        internalParts = internalParts.filter(p => p !== child && p.userData.parentGroup !== group);
    }

    const t = currentThickness;
    const dInnerW = Math.max(0.5, drawerW - (2 * t));
    const dInnerD = Math.max(0.5, drawerD - (2 * t));
    const colorHex = 0xdeb887;

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

    const labelPrefix = group.userData.labelPrefix || `[Base] Drw`;

    makeSubPanel(t, drawerH, drawerD, -drawerW/2 + t/2, 0, 0, `${labelPrefix} Side L`);
    makeSubPanel(t, drawerH, drawerD, drawerW/2 - t/2, 0, 0, `${labelPrefix} Side R`);
    makeSubPanel(dInnerW, drawerH, t, 0, 0, drawerD/2 - t/2, `${labelPrefix} Front Inner`);
    makeSubPanel(dInnerW, drawerH, t, 0, 0, -drawerD/2 + t/2, `${labelPrefix} Back`);
    makeSubPanel(drawerW, t, drawerD, 0, -drawerH/2 + t/2, 0, `${labelPrefix} Bottom`);
    makeSubPanel(drawerW + 0.5, drawerH + 1, t, 0, 0, drawerD/2 + t/2, `${labelPrefix} Fascia`);

    // Inner Channel Runners
    const runnerMat = new THREE.MeshPhongMaterial({ color: 0xe2e8f0, shininess: 90, specular: 0xffffff });
    const runnerEdgeMat = new THREE.LineBasicMaterial({ color: 0x64748b });
    const runnerGeo = new THREE.BoxGeometry(0.18, 1.05, drawerD);

    const runnerL = new THREE.Mesh(runnerGeo, runnerMat);
    runnerL.add(new THREE.LineSegments(new THREE.EdgesGeometry(runnerGeo), runnerEdgeMat));
    runnerL.position.set(-drawerW/2 - 0.09, -drawerH/2 + 1.2, 0);
    runnerL.userData = { isSubPart: true, type: 'slide_runner', label: `${labelPrefix} Channel Slide L`, module: 'base' };
    group.add(runnerL);

    const runnerR = new THREE.Mesh(runnerGeo, runnerMat);
    runnerR.add(new THREE.LineSegments(new THREE.EdgesGeometry(runnerGeo), runnerEdgeMat));
    runnerR.position.set(drawerW/2 + 0.09, -drawerH/2 + 1.2, 0);
    runnerR.userData = { isSubPart: true, type: 'slide_runner', label: `${labelPrefix} Channel Slide R`, module: 'base' };
    group.add(runnerR);

    // Modern Chrome Pull Handle on Fascia
    const handleMat = new THREE.MeshPhongMaterial({ color: 0xf8fafc, shininess: 120, specular: 0xffffff });
    const handleW = Math.min(10.0, Math.max(4.0, drawerW * 0.35));
    const handleGeo = new THREE.BoxGeometry(handleW, 0.45, 0.65);
    const handleMesh = new THREE.Mesh(handleGeo, handleMat);
    handleMesh.position.set(0, 0, drawerD/2 + t/2 + 0.4);
    handleMesh.userData = { isSubPart: true, type: 'handle', label: `${labelPrefix} Pull Handle`, module: 'base' };
    group.add(handleMesh);

    const hitBoxGeo = new THREE.BoxGeometry(drawerW + 0.5, drawerH + 1, drawerD + t);
    const hitBoxMat = new THREE.MeshBasicMaterial({ visible: false });
    const hitBox = new THREE.Mesh(hitBoxGeo, hitBoxMat);
    group.add(hitBox);

    const maxSlideZ = drawerD * 0.65;
    const currentSlideZ = (posZ !== undefined) ? posZ : 0;

    hitBox.userData = { 
        type: 'drawer', 
        label: `${labelPrefix} Assembly`, 
        parentGroup: group, 
        module: 'base',
        bayIndex: bayIndex,
        tierIndex: tierIndex,
        w: drawerW,
        h: drawerH,
        d: drawerD,
        drawerW: drawerW,
        drawerH: drawerH,
        drawerD: drawerD,
        maxSlideZ: maxSlideZ
    };
    internalParts.push(hitBox);

    group.userData.hitBox = hitBox;
    group.userData.bayIndex = bayIndex;
    group.userData.tierIndex = tierIndex;
    group.userData.w = drawerW;
    group.userData.h = drawerH;
    group.userData.d = drawerD;
    group.userData.drawerW = drawerW;
    group.userData.drawerH = drawerH;
    group.userData.drawerD = drawerD;
    group.userData.maxSlideZ = maxSlideZ;
    group.userData.label = `${labelPrefix} Assembly`;

    group.position.set(posX, posY, currentSlideZ);

    // Recreate fixed channel guides
    createChannelGuides(group, drawerW, drawerH, drawerD, posX, posY, labelPrefix);
}

function removeDrawerGroup(group) {
    if (!group) return;
    if (selectedObject === group) deselectObject();

    // Remove fixed channel guides associated with this drawer
    const guides = cabinetGroup.children.filter(c => c.userData && c.userData.isChannelGuide && c.userData.drawerGroup === group);
    guides.forEach(g => {
        cabinetGroup.remove(g);
        if (g.geometry) g.geometry.dispose();
    });

    while (group.children.length > 0) {
        const child = group.children[0];
        group.remove(child);
        if (child.geometry) child.geometry.dispose();
        if (child.material) {
            if (Array.isArray(child.material)) child.material.forEach(m => m.dispose());
            else child.material.dispose();
        }
        internalParts = internalParts.filter(p => p !== child && p.userData.parentGroup !== group);
    }
    cabinetGroup.remove(group);
}

function updateExistingDrawers() {
    const existingDrawers = cabinetGroup.children.filter(c => c.userData && c.userData.isDrawerGroup && c.userData.module === 'base');
    if (existingDrawers.length === 0) return;

    const layout = calculateBayLayout('base');
    const t = currentThickness;
    const totalGap = 1.0;
    const drawerW = Math.max(4.0, layout.pocketW - totalGap);
    const drawerD = currentD - 2.0;

    const shelvesInput = document.getElementById('cad-shelves-count');
    const shelvesCount = shelvesInput ? (parseInt(shelvesInput.value) || 0) : 0;
    const innerH = currentH - (2 * t);
    const numRows = shelvesCount + 1;
    const rowH = (innerH - (shelvesCount * t)) / numRows;
    const drawerH = Math.min(8.0, Math.max(4.0, rowH - 1.0));
    const getRowCenterY = (r) => getBaseBottomY() + t + (r * (rowH + t)) + (rowH / 2);

    // Group drawers by tier
    const tiers = new Map();
    existingDrawers.forEach(d => {
        let tier = (d.userData.tierIndex !== undefined) ? d.userData.tierIndex : Math.floor(numRows / 2);
        if (tier >= numRows) tier = numRows - 1;
        if (tier < 0) tier = 0;
        d.userData.tierIndex = tier;
        if (!tiers.has(tier)) tiers.set(tier, []);
        tiers.get(tier).push(d);
    });

    if (layout.divCount === 0) {
        // "If there is no partition, then there will be a long drawer."
        const fullDrawerW = Math.max(4.0, layout.innerW - totalGap);
        tiers.forEach((tierDrawers, tier) => {
            const primaryDrawer = tierDrawers[0];
            const posY = getRowCenterY(tier);
            const currentZ = primaryDrawer.position.z;
            rebuildDrawerGroup(primaryDrawer, fullDrawerW, drawerH, drawerD, 0, posY, currentZ, 0, tier);

            for (let i = 1; i < tierDrawers.length; i++) {
                removeDrawerGroup(tierDrawers[i]);
            }
        });
    } else {
        const targetBays = layout.middleBayIndices;

        tiers.forEach((tierDrawers, tier) => {
            const posY = getRowCenterY(tier);

            if (tierDrawers.length === 1 && targetBays.length === 2) {
                // Expand 1 drawer to cover the 2 middle slots
                const firstDrawer = tierDrawers[0];
                const bay0 = targetBays[0];
                const currentZ = firstDrawer.position.z;
                rebuildDrawerGroup(firstDrawer, drawerW, drawerH, drawerD, layout.bayCenters[bay0], posY, currentZ, bay0, tier);

                const bay1 = targetBays[1];
                const labelPrefix = `[Base] Drw ${partCounter++}`;
                const { group } = createDrawerMeshGroup(drawerW, drawerH, drawerD, layout.bayCenters[bay1], posY, currentZ, labelPrefix, bay1, tier);
                cabinetGroup.add(group);
            } else if (tierDrawers.length > targetBays.length && targetBays.length === 1) {
                // Collapse 2 drawers to 1 center slot
                const primaryDrawer = tierDrawers[0];
                const centerBay = targetBays[0];
                const currentZ = primaryDrawer.position.z;
                rebuildDrawerGroup(primaryDrawer, drawerW, drawerH, drawerD, layout.bayCenters[centerBay], posY, currentZ, centerBay, tier);
                for (let i = 1; i < tierDrawers.length; i++) {
                    removeDrawerGroup(tierDrawers[i]);
                }
            } else {
                // Update each drawer in this tier to fit its bay
                tierDrawers.forEach((drawer, idx) => {
                    let assignedBay = drawer.userData.bayIndex;
                    if (assignedBay === undefined || assignedBay >= layout.numBays) {
                        assignedBay = targetBays[idx % targetBays.length];
                    }
                    if (tierDrawers.length === targetBays.length && idx < targetBays.length) {
                        assignedBay = targetBays[idx];
                    }
                    const posX = layout.bayCenters[assignedBay] !== undefined ? layout.bayCenters[assignedBay] : 0;
                    const currentZ = drawer.position.z;
                    rebuildDrawerGroup(drawer, drawerW, drawerH, drawerD, posX, posY, currentZ, assignedBay, tier);
                });
            }
        });
    }

    if (selectedObject && selectedObject.userData && selectedObject.userData.isDrawerGroup) {
        populateInspector(selectedObject);
    }
}

function addDrawer(sizeType) {
    if (currentKitchenMode === 'wall') {
        alert("Drawers are placed inside Base cabinets. Please switch to Base or Base + Wall mode.");
        return;
    }
    const layout = calculateBayLayout('base');
    const t = currentThickness;
    const totalGap = 1.0; // 0.5" slide clearance per side
    const drawerW = Math.max(4.0, layout.pocketW - totalGap);
    const drawerD = currentD - 2.0;

    // Shelves and tier math
    const shelvesInput = document.getElementById('cad-shelves-count');
    const shelvesCount = shelvesInput ? (parseInt(shelvesInput.value) || 0) : 0;
    const innerH = currentH - (2 * t);
    const numRows = shelvesCount + 1;
    const rowH = (innerH - (shelvesCount * t)) / numRows;
    const drawerH = Math.min(8.0, Math.max(4.0, rowH - 1.0));
    const getRowCenterY = (r) => getBaseBottomY() + t + (r * (rowH + t)) + (rowH / 2);
    const defaultRow = Math.floor(numRows / 2);

    const existingDrawers = cabinetGroup.children.filter(c => c.userData && c.userData.isDrawerGroup && c.userData.module === 'base');
    const targetBays = layout.middleBayIndices;

    // Find first available vertical tier for middle bays
    let targetTier = defaultRow;
    const isTierFull = (tier) => targetBays.every(b => existingDrawers.some(d => d.userData.bayIndex === b && d.userData.tierIndex === tier));

    if (isTierFull(defaultRow)) {
        for (let r = numRows - 1; r >= 0; r--) {
            if (!isTierFull(r)) {
                targetTier = r;
                break;
            }
        }
    }

    const createdHitBoxes = [];
    const initialSlideZ = 0;

    targetBays.forEach(bayIdx => {
        const alreadyExists = existingDrawers.some(d => d.userData.bayIndex === bayIdx && d.userData.tierIndex === targetTier);
        if (!alreadyExists || existingDrawers.length === 0) {
            const posX = layout.bayCenters[bayIdx] !== undefined ? layout.bayCenters[bayIdx] : 0;
            const posY = getRowCenterY(targetTier);
            const labelPrefix = `[Base] Drw ${partCounter++}`;
            const { group, hitBox } = createDrawerMeshGroup(drawerW, drawerH, drawerD, posX, posY, initialSlideZ, labelPrefix, bayIdx, targetTier);
            cabinetGroup.add(group);
            createdHitBoxes.push(hitBox);
        }
    });

    if (createdHitBoxes.length === 0) {
        targetBays.forEach(bayIdx => {
            const posX = layout.bayCenters[bayIdx] !== undefined ? layout.bayCenters[bayIdx] : 0;
            const posY = getRowCenterY(targetTier);
            const labelPrefix = `[Base] Drw ${partCounter++}`;
            const { group, hitBox } = createDrawerMeshGroup(drawerW, drawerH, drawerD, posX, posY, initialSlideZ, labelPrefix, bayIdx, targetTier);
            cabinetGroup.add(group);
            createdHitBoxes.push(hitBox);
        });
    }

    if (createdHitBoxes.length > 0) {
        selectObject(createdHitBoxes[0]);
    }
}

function toggleShutters() {
    shuttersOpen = !shuttersOpen;
    const btn = document.getElementById('btn-toggle-shutters');
    if (btn) {
        btn.classList.toggle('active', shuttersOpen);
        const span = btn.querySelector('span');
        if (span) span.textContent = shuttersOpen ? 'Close Doors' : 'Toggle Doors';
    }
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
