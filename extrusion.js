/**
 * Aluminum Extrusion Studio - Core 3D CAD & Parametric Engine
 * Three.js r128 Based Engineering Visualizer for T-Slot / V-Slot Tables & Frames
 */

(function() {
    'use strict';

    // ==========================================
    // 1. STATE & PARAMETRIC CONFIGURATION
    // ==========================================
    const state = {
        // Table Frame Geometry (in millimeters)
        width: 1200,          // X axis
        depth: 800,           // Z axis
        height: 750,          // Y axis
        profileType: '3030',  // '2020', '2040', '3030', '4040'
        profileFinish: 'silver', // 'silver', 'black'
        
        // Stretchers
        stretcherHeight: 150, // Elevation from floor in mm
        stretcherStyle: 'box', // 'box', 'hframe'
        centerRib: true,      // Top support rib

        // Tabletop Plywood / Mica
        enableTabletop: true,
        topThickness: 18,     // 12, 18, 25, 36 mm
        topLaminate: 'birch', // 'birch', 'white', 'charcoal', 'butcher', 'esd', 'carbon'
        overhangFront: 30,
        overhangBack: 30,
        overhangLeft: 30,
        overhangRight: 30,
        retainingSlot: true,  // 5mm routed slot for top extrusions
        upperExtrusions: false, // Upper upright frame in slot

        // Joinery & Base
        joineryType: 'gusset', // 'gusset', 'cube', 'concealed', 'plate'
        feetType: 'rubber',    // 'rubber', 'caster', 'cap'

        // Viewport HUD Toggles
        showHandles: true,
        showDimensions: true,
        wireframe: false,

        // Profile Geometry Dimensions (mm)
        profileSpecs: {
            '2020': { sizeX: 20, sizeY: 20, slot: 6, hole: 4.2, tap: 'M5', hardware: 'M5×10mm', tnut: 'M5 Drop-in', weight: 0.55 },
            '2040': { sizeX: 20, sizeY: 40, slot: 6, hole: 4.2, tap: 'M5', hardware: 'M5×10mm', tnut: 'M5 Drop-in', weight: 0.95 },
            '3030': { sizeX: 30, sizeY: 30, slot: 8, hole: 6.8, tap: 'M8', hardware: 'M6×12mm', tnut: 'M6 Roll-in', weight: 0.98 },
            '4040': { sizeX: 40, sizeY: 40, slot: 8, hole: 6.8, tap: 'M8', hardware: 'M8×16mm', tnut: 'M8 Roll-in', weight: 1.75 }
        }
    };

    // ==========================================
    // 2. THREE.JS SCENE, CAMERA, LIGHTS
    // ==========================================
    let scene, camera, renderer, controls;
    let tableAssemblyGroup, handlesGroup, dimensionsGroup;
    let canvas, viewportContainer;
    let raycaster, mouse;
    let activeDragHandle = null;
    let isDraggingHandle = false;
    let dragPlane = new THREE.Plane();
    let dragPlaneIntersect = new THREE.Vector3();
    let initialDragPoint = new THREE.Vector3();
    let initialOverhangVal = 0;

    // Materials Cache
    const materials = {};
    const textures = {};

    function initThree() {
        canvas = document.getElementById('viewport-canvas');
        viewportContainer = canvas.parentElement;

        scene = new THREE.Scene();
        scene.background = new THREE.Color(0x0e131b);

        const width = viewportContainer.clientWidth;
        const height = viewportContainer.clientHeight;

        camera = new THREE.PerspectiveCamera(45, width / height, 10, 15000);
        camera.position.set(1600, 1400, 2000);

        renderer = new THREE.WebGLRenderer({
            canvas: canvas,
            antialias: true,
            alpha: false,
            powerPreference: 'high-performance'
        });
        renderer.setSize(width, height);
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        renderer.shadowMap.enabled = true;
        renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        renderer.outputEncoding = THREE.sRGBEncoding;

        controls = new THREE.OrbitControls(camera, canvas);
        controls.enableDamping = false; // Normal direct CAD motion, no fluidic inertia
        controls.rotateSpeed = 0.8;
        controls.panSpeed = 0.8;
        controls.zoomSpeed = 1.0;
        controls.maxDistance = 6000;
        controls.minDistance = 200;
        controls.maxPolarAngle = Math.PI / 2 + 0.05;
        controls.target.set(0, state.height / 2, 0);
        controls.update();

        // Lighting
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.55);
        scene.add(ambientLight);

        const hemiLight = new THREE.HemisphereLight(0xddeeff, 0x111622, 0.45);
        scene.add(hemiLight);

        const dirLight1 = new THREE.DirectionalLight(0xffffff, 0.85);
        dirLight1.position.set(1500, 2500, 1500);
        dirLight1.castShadow = true;
        dirLight1.shadow.mapSize.width = 2048;
        dirLight1.shadow.mapSize.height = 2048;
        dirLight1.shadow.camera.near = 100;
        dirLight1.shadow.camera.far = 6000;
        const d = 1600;
        dirLight1.shadow.camera.left = -d;
        dirLight1.shadow.camera.right = d;
        dirLight1.shadow.camera.top = d;
        dirLight1.shadow.camera.bottom = -d;
        dirLight1.shadow.bias = -0.0005;
        scene.add(dirLight1);

        const dirLight2 = new THREE.DirectionalLight(0x90caff, 0.35);
        dirLight2.position.set(-1500, 1000, -1500);
        scene.add(dirLight2);

        // Ground Grid
        createGroundGrid();

        // Scene Groups
        tableAssemblyGroup = new THREE.Group();
        handlesGroup = new THREE.Group();
        dimensionsGroup = new THREE.Group();
        scene.add(tableAssemblyGroup);
        scene.add(handlesGroup);
        scene.add(dimensionsGroup);

        // Raycasting & Drag Interaction
        raycaster = new THREE.Raycaster();
        mouse = new THREE.Vector2();

        initMaterials();
        setupDragInteraction();

        window.addEventListener('resize', onWindowResize);
        animate();
    }

    function createGroundGrid() {
        // High-contrast industrial workbench floor grid
        const gridHelper = new THREE.GridHelper(4000, 80, 0x38bdf8, 0x1e293b);
        gridHelper.position.y = -0.5;
        scene.add(gridHelper);

        // Shadow Receiver Plane
        const shadowPlaneGeo = new THREE.PlaneGeometry(6000, 6000);
        const shadowPlaneMat = new THREE.ShadowMaterial({ opacity: 0.35 });
        const shadowMesh = new THREE.Mesh(shadowPlaneGeo, shadowPlaneMat);
        shadowMesh.rotation.x = -Math.PI / 2;
        shadowMesh.position.y = -0.6;
        shadowMesh.receiveShadow = true;
        scene.add(shadowMesh);
    }

    function onWindowResize() {
        if (!viewportContainer) return;
        const width = viewportContainer.clientWidth;
        const height = viewportContainer.clientHeight;
        camera.aspect = width / height;
        camera.updateProjectionMatrix();
        renderer.setSize(width, height);
    }

    function animate() {
        requestAnimationFrame(animate);
        controls.update();
        updateDimensionHUDOverlay();
        renderer.render(scene, camera);
    }

    // ==========================================
    // 3. PROCEDURAL TEXTURES & MATERIALS
    // ==========================================
    function createWoodTexture(type) {
        const c = document.createElement('canvas');
        c.width = 512;
        c.height = 512;
        const ctx = c.getContext('2d');

        if (type === 'birch') {
            ctx.fillStyle = '#dfc39a';
            ctx.fillRect(0, 0, 512, 512);
            ctx.fillStyle = '#caa673';
            for (let i = 0; i < 40; i++) {
                ctx.globalAlpha = 0.12;
                ctx.fillRect(0, Math.random() * 512, 512, 4 + Math.random() * 8);
            }
            // Fine grain
            ctx.fillStyle = '#8f6734';
            for (let i = 0; i < 3000; i++) {
                ctx.globalAlpha = 0.04;
                ctx.fillRect(Math.random() * 512, Math.random() * 512, 2, 8);
            }
        } else if (type === 'butcher') {
            ctx.fillStyle = '#9e6234';
            ctx.fillRect(0, 0, 512, 512);
            // Stave planks
            const plankH = 64;
            for (let y = 0; y < 512; y += plankH) {
                ctx.fillStyle = (y % (plankH * 2) === 0) ? '#8b5327' : '#af723f';
                ctx.fillRect(0, y, 512, plankH - 2);
            }
        }
        const tex = new THREE.CanvasTexture(c);
        tex.wrapS = THREE.RepeatWrapping;
        tex.wrapT = THREE.RepeatWrapping;
        tex.repeat.set(2, 2);
        return tex;
    }

    function initMaterials() {
        // Aluminum Finishes
        materials.aluminumSilver = new THREE.MeshStandardMaterial({
            color: 0xd4d4d8,
            metalness: 0.88,
            roughness: 0.22,
            envMapIntensity: 1.0
        });

        materials.aluminumBlack = new THREE.MeshStandardMaterial({
            color: 0x222226,
            metalness: 0.70,
            roughness: 0.40
        });

        // Corner Cast Gussets
        materials.gussetSilver = new THREE.MeshStandardMaterial({
            color: 0xb0b0b8,
            metalness: 0.65,
            roughness: 0.35
        });

        materials.gussetBlack = new THREE.MeshStandardMaterial({
            color: 0x18181b,
            metalness: 0.50,
            roughness: 0.45
        });

        // Fasteners / Bolts
        materials.steelHardware = new THREE.MeshStandardMaterial({
            color: 0xe2e8f0,
            metalness: 0.95,
            roughness: 0.15
        });

        // Rubber Foot / End Cap
        materials.blackRubber = new THREE.MeshStandardMaterial({
            color: 0x111111,
            metalness: 0.1,
            roughness: 0.85
        });

        // Laminates
        textures.birch = createWoodTexture('birch');
        textures.butcher = createWoodTexture('butcher');

        materials.micaBirch = new THREE.MeshStandardMaterial({
            map: textures.birch,
            roughness: 0.55,
            metalness: 0.05
        });

        materials.micaWhite = new THREE.MeshStandardMaterial({
            color: 0xf8fafc,
            roughness: 0.25,
            metalness: 0.05
        });

        materials.micaCharcoal = new THREE.MeshStandardMaterial({
            color: 0x334155,
            roughness: 0.35,
            metalness: 0.1
        });

        materials.micaButcher = new THREE.MeshStandardMaterial({
            map: textures.butcher,
            roughness: 0.45,
            metalness: 0.05
        });

        materials.micaEsd = new THREE.MeshStandardMaterial({
            color: 0x0284c7,
            roughness: 0.30,
            metalness: 0.15
        });

        materials.micaCarbon = new THREE.MeshStandardMaterial({
            color: 0x18181b,
            roughness: 0.25,
            metalness: 0.35
        });

        // Interactive Drag Handles
        materials.handleActive = new THREE.MeshStandardMaterial({
            color: 0x0284c7,
            emissive: 0x38bdf8,
            emissiveIntensity: 0.5,
            roughness: 0.2
        });

        materials.handleHover = new THREE.MeshStandardMaterial({
            color: 0xf59e0b,
            emissive: 0xfbbf24,
            emissiveIntensity: 0.6,
            roughness: 0.2
        });
    }

    function getActiveExtrusionMaterial() {
        return state.profileFinish === 'black' ? materials.aluminumBlack : materials.aluminumSilver;
    }

    function getActiveGussetMaterial() {
        return state.profileFinish === 'black' ? materials.gussetBlack : materials.gussetSilver;
    }

    function getActiveTabletopMaterial() {
        switch (state.topLaminate) {
            case 'white': return materials.micaWhite;
            case 'charcoal': return materials.micaCharcoal;
            case 'butcher': return materials.micaButcher;
            case 'esd': return materials.micaEsd;
            case 'carbon': return materials.micaCarbon;
            case 'birch':
            default:
                return materials.micaBirch;
        }
    }

    // ==========================================
    // 4. TRUE T-SLOT 3D PARAMETRIC EXTRUSION
    // ==========================================
    /**
     * Builds a real physical T-slot aluminum extrusion cross-section shape
     * complete with 4 slot channels and central bore
     */
    function createExtrusionShape(sizeX, sizeY, slotWidth) {
        const shape = new THREE.Shape();
        const hx = sizeX / 2;
        const hy = sizeY / 2;
        const sw2 = slotWidth / 2;
        const slotDepth = slotWidth * 0.75;
        const chamfer = 1.0;

        // Outer contour with corner chamfers
        shape.moveTo(-hx + chamfer, -hy);
        
        // Bottom slot
        shape.lineTo(-sw2, -hy);
        shape.lineTo(-sw2, -hy + slotDepth);
        shape.lineTo(sw2, -hy + slotDepth);
        shape.lineTo(sw2, -hy);
        shape.lineTo(hx - chamfer, -hy);
        shape.lineTo(hx, -hy + chamfer);

        // Right slot
        shape.lineTo(hx, -sw2);
        shape.lineTo(hx - slotDepth, -sw2);
        shape.lineTo(hx - slotDepth, sw2);
        shape.lineTo(hx, sw2);
        shape.lineTo(hx, hy - chamfer);
        shape.lineTo(hx - chamfer, hy);

        // Top slot
        shape.lineTo(sw2, hy);
        shape.lineTo(sw2, hy - slotDepth);
        shape.lineTo(-sw2, hy - slotDepth);
        shape.lineTo(-sw2, hy);
        shape.lineTo(-hx + chamfer, hy);
        shape.lineTo(-hx, hy - chamfer);

        // Left slot
        shape.lineTo(-hx, sw2);
        shape.lineTo(-hx + slotDepth, sw2);
        shape.lineTo(-hx + slotDepth, -sw2);
        shape.lineTo(-hx, -sw2);
        shape.lineTo(-hx, -hy + chamfer);
        shape.closePath();

        // Center Core Hole (Hollow interior bore)
        const holePath = new THREE.Path();
        const r = slotWidth * 0.42; // e.g. 2.1mm for 2020, 3.4mm for 3030/4040
        holePath.absarc(0, 0, r, 0, Math.PI * 2, false);
        shape.holes.push(holePath);

        return shape;
    }

    /**
     * Creates an extruded 3D mesh along an axis
     */
    function createExtrusionMember(length, profileType, axis = 'Y') {
        const spec = state.profileSpecs[profileType] || state.profileSpecs['3030'];
        const shape = createExtrusionShape(spec.sizeX, spec.sizeY, spec.slot);

        const extrudeSettings = {
            depth: length,
            bevelEnabled: false,
            steps: 1
        };

        const geom = new THREE.ExtrudeGeometry(shape, extrudeSettings);
        
        // Center the extrusion along its length
        geom.translate(0, 0, -length / 2);

        // Align along desired axis
        if (axis === 'Y') {
            geom.rotateX(Math.PI / 2);
        } else if (axis === 'X') {
            geom.rotateY(Math.PI / 2);
        } // 'Z' is default extrusion direction

        const mesh = new THREE.Mesh(geom, getActiveExtrusionMaterial());
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        mesh.userData = {
            isExtrusion: true,
            length: length,
            profile: profileType,
            axis: axis
        };

        return mesh;
    }

    // ==========================================
    // 5. HARDWARE / JOINERY GENERATORS
    // ==========================================
    /**
     * Precision 90-degree die-cast corner gusset mesh
     * In local coordinates:
     * - (0, 0, 0) is the 90-degree inside corner
     * - Arm 1 extends along +X from 0 to L
     * - Arm 2 extends along +Y from 0 to L
     * - 45-degree hypotenuse connects (L, 0) and (0, L)
     * - Centered along Z (thickness) from -thick/2 to +thick/2
     */
    function createCornerGusset(profileType) {
        const spec = state.profileSpecs[profileType] || state.profileSpecs['3030'];
        const sz = spec.sizeX;
        const L = sz * 0.88;       // length along each extrusion arm
        const thick = sz * 0.82;   // bracket width across the extrusion slot
        const tWall = sz * 0.20;   // web wall thickness
        
        // 2D Profile in local X-Y plane: 90° corner is at (0, 0)!
        const shape = new THREE.Shape();
        shape.moveTo(0, 0);
        shape.lineTo(L, 0);
        shape.lineTo(L, tWall);
        shape.lineTo(tWall, L);
        shape.lineTo(0, L);
        shape.closePath();

        const geom = new THREE.ExtrudeGeometry(shape, {
            depth: thick,
            bevelEnabled: true,
            bevelSegments: 1,
            steps: 1,
            bevelSize: 0.5,
            bevelThickness: 0.5
        });

        // Center along Z (depth) so Z=0 is the centerline of the bracket
        geom.translate(0, 0, -thick / 2);

        const mesh = new THREE.Mesh(geom, getActiveGussetMaterial());
        mesh.castShadow = true;
        return mesh;
    }

    function createCornerCube(profileType) {
        const spec = state.profileSpecs[profileType] || state.profileSpecs['3030'];
        const sz = spec.sizeX;
        const geom = new THREE.BoxGeometry(sz, sz, sz);
        const mesh = new THREE.Mesh(geom, getActiveExtrusionMaterial());
        mesh.castShadow = true;
        return mesh;
    }

    function createConcealedLBracket(profileType) {
        const spec = state.profileSpecs[profileType] || state.profileSpecs['3030'];
        const sw = spec.slot * 0.95;
        const L = spec.sizeX * 1.0;
        const group = new THREE.Group();

        // Arm 1 along +X
        const arm1 = new THREE.Mesh(new THREE.BoxGeometry(L, sw, sw), materials.steelHardware);
        arm1.position.set(L / 2, 0, 0);

        // Arm 2 along +Y
        const arm2 = new THREE.Mesh(new THREE.BoxGeometry(sw, L, sw), materials.steelHardware);
        arm2.position.set(0, L / 2, 0);

        group.add(arm1);
        group.add(arm2);
        return group;
    }

    /**
     * Places a 90° corner gusset at a corner intersection using an exact 3D orientation matrix
     * @param {THREE.Vector3} cornerPos - 3D position where the two extrusion outer faces meet
     * @param {THREE.Vector3} armDir1 - Direction along the first extrusion (local +X)
     * @param {THREE.Vector3} armDir2 - Direction along the second extrusion (local +Y)
     */
    function placeCornerGusset(cornerPos, armDir1, armDir2) {
        const gusset = state.joineryType === 'concealed'
            ? createConcealedLBracket(state.profileType)
            : createCornerGusset(state.profileType);

        // Normalize arm directions
        const uX = armDir1.clone().normalize();
        const uY = armDir2.clone().normalize();
        const uZ = new THREE.Vector3().crossVectors(uX, uY).normalize();

        // Build 4x4 orientation matrix
        const m = new THREE.Matrix4();
        m.makeBasis(uX, uY, uZ);
        m.setPosition(cornerPos);

        gusset.applyMatrix4(m);
        tableAssemblyGroup.add(gusset);
    }

    function createLevelingFoot(profileType) {
        const spec = state.profileSpecs[profileType] || state.profileSpecs['3030'];
        const group = new THREE.Group();

        if (state.feetType === 'rubber') {
            // Rubber Pad
            const padGeom = new THREE.CylinderGeometry(spec.sizeX * 0.75, spec.sizeX * 0.85, 12, 24);
            const padMesh = new THREE.Mesh(padGeom, materials.blackRubber);
            padMesh.position.y = 6;
            padMesh.castShadow = true;

            // Threaded Stem (M8 / M12)
            const stemGeom = new THREE.CylinderGeometry(spec.hole * 0.45, spec.hole * 0.45, 20, 16);
            const stemMesh = new THREE.Mesh(stemGeom, materials.steelHardware);
            stemMesh.position.y = 20;

            group.add(padMesh);
            group.add(stemMesh);
        } else if (state.feetType === 'caster') {
            // Swivel Caster Wheel
            const bracket = new THREE.Mesh(new THREE.BoxGeometry(spec.sizeX, 15, spec.sizeX), materials.steelHardware);
            bracket.position.y = 25;
            const wheelGeom = new THREE.CylinderGeometry(18, 18, 14, 24);
            wheelGeom.rotateZ(Math.PI / 2);
            const wheel = new THREE.Mesh(wheelGeom, materials.blackRubber);
            wheel.position.y = 10;
            wheel.castShadow = true;

            group.add(bracket);
            group.add(wheel);
        } else {
            // Simple flush plastic end cap
            const cap = new THREE.Mesh(new THREE.BoxGeometry(spec.sizeX + 1, 4, spec.sizeY + 1), materials.blackRubber);
            cap.position.y = 2;
            group.add(cap);
        }

        return group;
    }

    // ==========================================
    // 6. TABLE FRAME & TABLETOP BUILDER
    // ==========================================
    function buildTableAssembly() {
        // Clear previous meshes
        while (tableAssemblyGroup.children.length > 0) {
            const obj = tableAssemblyGroup.children[0];
            tableAssemblyGroup.remove(obj);
            if (obj.geometry) obj.geometry.dispose();
        }

        const W = state.width;
        const D = state.depth;
        const H = state.height;
        const spec = state.profileSpecs[state.profileType];
        const ps = spec.sizeX; // Profile dimension

        // Half spans
        const hW = W / 2 - ps / 2;
        const hD = D / 2 - ps / 2;

        // --- 1. FOUR VERTICAL LEGS ---
        const legLength = H;
        const legPositions = [
            { x: -hW, z: -hD, name: 'Leg Back-Left' },
            { x:  hW, z: -hD, name: 'Leg Back-Right' },
            { x: -hW, z:  hD, name: 'Leg Front-Left' },
            { x:  hW, z:  hD, name: 'Leg Front-Right' }
        ];

        legPositions.forEach(pos => {
            const leg = createExtrusionMember(legLength, state.profileType, 'Y');
            leg.position.set(pos.x, H / 2, pos.z);
            leg.userData.role = pos.name;
            tableAssemblyGroup.add(leg);

            // Add Base Leveling Foot at the bottom of each leg
            const foot = createLevelingFoot(state.profileType);
            foot.position.set(pos.x, 0, pos.z);
            tableAssemblyGroup.add(foot);
        });

        // --- 2. TOP PERIMETER RAILS (FLUSH WITH TOP OF LEGS) ---
        // Top surface of rails is at Y = H, perfectly flush with leg tops!
        const topRailY = H - ps / 2;

        // Front & Back Top Rails (Span along X between legs)
        const topXSpan = W - 2 * ps;
        const topFrontRail = createExtrusionMember(topXSpan, state.profileType, 'X');
        topFrontRail.position.set(0, topRailY, hD);
        topFrontRail.userData.role = 'Top Front Rail';
        tableAssemblyGroup.add(topFrontRail);

        const topBackRail = createExtrusionMember(topXSpan, state.profileType, 'X');
        topBackRail.position.set(0, topRailY, -hD);
        topBackRail.userData.role = 'Top Back Rail';
        tableAssemblyGroup.add(topBackRail);

        // Left & Right Top Rails (Span along Z between front and back rails)
        const topZSpan = D - 2 * ps;
        const topLeftRail = createExtrusionMember(topZSpan, state.profileType, 'Z');
        topLeftRail.position.set(-hW, topRailY, 0);
        topLeftRail.userData.role = 'Top Left Rail';
        tableAssemblyGroup.add(topLeftRail);

        const topRightRail = createExtrusionMember(topZSpan, state.profileType, 'Z');
        topRightRail.position.set(hW, topRailY, 0);
        topRightRail.userData.role = 'Top Right Rail';
        tableAssemblyGroup.add(topRightRail);

        // Optional Top Center Support Rib (Under Tabletop)
        if (state.centerRib) {
            const rib = createExtrusionMember(topZSpan, state.profileType, 'Z');
            rib.position.set(0, topRailY, 0);
            rib.userData.role = 'Top Center Rib';
            tableAssemblyGroup.add(rib);
        }

        // --- 3. LOWER HORIZONTAL STRETCHERS ---
        // Bound across legs at user-configured elevation (default 150mm)
        const stretcherY = state.stretcherHeight;

        // Left & Right Side Stretchers (always present to bind front & back legs)
        const sideStretcherLen = D - 2 * ps;
        const leftStretcher = createExtrusionMember(sideStretcherLen, state.profileType, 'Z');
        leftStretcher.position.set(-hW, stretcherY, 0);
        leftStretcher.userData.role = 'Lower Left Stretcher';
        tableAssemblyGroup.add(leftStretcher);

        const rightStretcher = createExtrusionMember(sideStretcherLen, state.profileType, 'Z');
        rightStretcher.position.set(hW, stretcherY, 0);
        rightStretcher.userData.role = 'Lower Right Stretcher';
        tableAssemblyGroup.add(rightStretcher);

        // Back Stretcher (binds back legs)
        const backStretcherLen = W - 2 * ps;
        const backStretcher = createExtrusionMember(backStretcherLen, state.profileType, 'X');
        backStretcher.position.set(0, stretcherY, -hD);
        backStretcher.userData.role = 'Lower Back Stretcher';
        tableAssemblyGroup.add(backStretcher);

        // Front Stretcher or Center Cross-Bar (depending on Box vs H-Frame)
        if (state.stretcherStyle === 'box') {
            const frontStretcher = createExtrusionMember(backStretcherLen, state.profileType, 'X');
            frontStretcher.position.set(0, stretcherY, hD);
            frontStretcher.userData.role = 'Lower Front Stretcher';
            tableAssemblyGroup.add(frontStretcher);
        } else {
            // H-Frame: center cross-tie between left and right stretchers (leaves front open for footrest)
            const centerTie = createExtrusionMember(backStretcherLen, state.profileType, 'X');
            centerTie.position.set(0, stretcherY, 0);
            centerTie.userData.role = 'Lower H-Frame Cross Tie';
            tableAssemblyGroup.add(centerTie);
        }

        // --- 4. CORNER JOINERY / GUSSETS ---
        addCornerJoinery(W, D, H, ps, hW, hD, topRailY, stretcherY);

        // --- 5. TABLETOP PLYWOOD & MICA SLAB ---
        if (state.enableTabletop) {
            buildTabletopSlab(W, D, H, ps);
        }

        // Update 3D drag handles & dimension HUD
        buildOverhangDragHandles(W, D, H);
        buildDimensionLines(W, D, H);

        // Refresh UI BOM counts
        calculateAndUpdateBOM();
    }

    /**
     * Adds corner gussets / brackets at all 90-degree internal intersections
     */
    function addCornerJoinery(W, D, H, ps, hW, hD, topRailY, stretcherY) {
        if (state.joineryType === 'cube') {
            const topCorners = [
                { x: -hW, z: -hD }, { x: hW, z: -hD },
                { x: -hW, z:  hD }, { x: hW, z:  hD }
            ];
            topCorners.forEach(c => {
                const cube = createCornerCube(state.profileType);
                cube.position.set(c.x, topRailY, c.z);
                tableAssemblyGroup.add(cube);
            });
            return;
        }

        const corners = [
            { legX: -hW, legZ: -hD, inX:  1, inZ:  1 }, // Back-Left
            { legX:  hW, legZ: -hD, inX: -1, inZ:  1 }, // Back-Right
            { legX: -hW, legZ:  hD, inX:  1, inZ: -1 }, // Front-Left
            { legX:  hW, legZ:  hD, inX: -1, inZ: -1 }  // Front-Right
        ];

        corners.forEach(c => {
            // --- TOP FRAME GUSSETS (Underneath top rails) ---
            // 1. Top Rail along X:
            placeCornerGusset(
                new THREE.Vector3(c.legX + c.inX * (ps / 2), H - ps, c.legZ),
                new THREE.Vector3(c.inX, 0, 0),
                new THREE.Vector3(0, -1, 0)
            );

            // 2. Top Rail along Z:
            placeCornerGusset(
                new THREE.Vector3(c.legX, H - ps, c.legZ + c.inZ * (ps / 2)),
                new THREE.Vector3(0, 0, c.inZ),
                new THREE.Vector3(0, -1, 0)
            );

            // --- LOWER STRETCHER GUSSETS (On top of lower stretchers) ---
            // 3. Lower Stretcher along X:
            if (state.stretcherStyle === 'box' || c.inZ === 1) {
                placeCornerGusset(
                    new THREE.Vector3(c.legX + c.inX * (ps / 2), stretcherY + (ps / 2), c.legZ),
                    new THREE.Vector3(c.inX, 0, 0),
                    new THREE.Vector3(0, 1, 0)
                );
            }

            // 4. Lower Stretcher along Z:
            placeCornerGusset(
                new THREE.Vector3(c.legX, stretcherY + (ps / 2), c.legZ + c.inZ * (ps / 2)),
                new THREE.Vector3(0, 0, c.inZ),
                new THREE.Vector3(0, 1, 0)
            );
        });

        // If H-frame, add 2 brackets at the center cross tie
        if (state.stretcherStyle === 'hframe') {
            placeCornerGusset(
                new THREE.Vector3(-hW + (ps / 2), stretcherY + (ps / 2), 0),
                new THREE.Vector3(1, 0, 0),
                new THREE.Vector3(0, 0, 1)
            );
            placeCornerGusset(
                new THREE.Vector3(hW - (ps / 2), stretcherY + (ps / 2), 0),
                new THREE.Vector3(-1, 0, 0),
                new THREE.Vector3(0, 0, 1)
            );
        }
    }

    /**
     * Builds the Plywood & Mica Tabletop Slab with optional 5mm Retaining Snap Slot
     */
    function buildTabletopSlab(W, D, H, ps) {
        const topW = W + state.overhangLeft + state.overhangRight;
        const topD = D + state.overhangFront + state.overhangBack;
        const thick = state.topThickness;

        // Position center of tabletop
        const posX = (state.overhangRight - state.overhangLeft) / 2;
        const posZ = (state.overhangFront - state.overhangBack) / 2;
        const posY = H + thick / 2; // Sits flush on top of frame

        const topGeom = new THREE.BoxGeometry(topW, thick, topD);
        const topMesh = new THREE.Mesh(topGeom, getActiveTabletopMaterial());
        topMesh.position.set(posX, posY, posZ);
        topMesh.castShadow = true;
        topMesh.receiveShadow = true;
        topMesh.userData = { isTabletop: true };
        tableAssemblyGroup.add(topMesh);

        // Retaining 5mm Snap Slot around perimeter for upper extrusions
        if (state.retainingSlot) {
            const slotDepth = 5; // 5mm deep channel
            const slotWidth = ps; // matches profile width
            const inset = 35; // 35mm from outer edge

            const slotMat = new THREE.MeshStandardMaterial({
                color: 0x111622,
                roughness: 0.8
            });

            // 4 recessed channel borders
            const cW = topW - inset * 2;
            const cD = topD - inset * 2;

            const frontSlot = new THREE.Mesh(new THREE.BoxGeometry(cW, slotDepth + 0.5, slotWidth), slotMat);
            frontSlot.position.set(posX, posY + thick / 2 - slotDepth / 2, posZ + cD / 2);
            tableAssemblyGroup.add(frontSlot);

            const backSlot = new THREE.Mesh(new THREE.BoxGeometry(cW, slotDepth + 0.5, slotWidth), slotMat);
            backSlot.position.set(posX, posY + thick / 2 - slotDepth / 2, posZ - cD / 2);
            tableAssemblyGroup.add(backSlot);

            const leftSlot = new THREE.Mesh(new THREE.BoxGeometry(slotWidth, slotDepth + 0.5, cD), slotMat);
            leftSlot.position.set(posX - cW / 2, posY + thick / 2 - slotDepth / 2, posZ);
            tableAssemblyGroup.add(leftSlot);

            const rightSlot = new THREE.Mesh(new THREE.BoxGeometry(slotWidth, slotDepth + 0.5, cD), slotMat);
            rightSlot.position.set(posX + cW / 2, posY + thick / 2 - slotDepth / 2, posZ);
            tableAssemblyGroup.add(rightSlot);

            // Optional Upper Uprights mounted inside slot
            if (state.upperExtrusions) {
                const upperH = 600;
                const uprightPositions = [
                    { x: posX - cW / 2, z: posZ - cD / 2 },
                    { x: posX + cW / 2, z: posZ - cD / 2 }
                ];
                uprightPositions.forEach(p => {
                    const upright = createExtrusionMember(upperH, state.profileType, 'Y');
                    upright.position.set(p.x, posY + thick / 2 + upperH / 2 - slotDepth, p.z);
                    upright.userData.role = 'Upper Upright Frame';
                    tableAssemblyGroup.add(upright);
                });

                // Top Crossbar between uprights
                const topBar = createExtrusionMember(cW, state.profileType, 'X');
                topBar.position.set(posX, posY + thick / 2 + upperH - slotDepth - ps / 2, posZ - cD / 2);
                topBar.userData.role = 'Upper Shelving Crossbar';
                tableAssemblyGroup.add(topBar);
            }
        }
    }

    // ==========================================
    // 7. INTERACTIVE 3D TABLETOP OVERHANG HANDLES
    // ==========================================
    function createArrowGizmo(direction, colorHex, handleId) {
        const group = new THREE.Group();
        group.userData = { isDragHandle: true, handleId: handleId, direction: direction };

        // Stem
        const stemGeom = new THREE.CylinderGeometry(4, 4, 30, 16);
        const stemMat = new THREE.MeshStandardMaterial({ color: colorHex, metalness: 0.5, roughness: 0.3 });
        const stem = new THREE.Mesh(stemGeom, stemMat);
        stem.position.y = 15;

        // Cone Head
        const coneGeom = new THREE.ConeGeometry(9, 20, 16);
        const coneMat = new THREE.MeshStandardMaterial({
            color: colorHex,
            emissive: colorHex,
            emissiveIntensity: 0.4,
            metalness: 0.6,
            roughness: 0.2
        });
        const cone = new THREE.Mesh(coneGeom, coneMat);
        cone.position.y = 38;

        group.add(stem);
        group.add(cone);

        // Orient gizmo towards its direction
        if (direction.x > 0) {
            group.rotateZ(-Math.PI / 2);
        } else if (direction.x < 0) {
            group.rotateZ(Math.PI / 2);
        } else if (direction.z > 0) {
            group.rotateX(Math.PI / 2);
        } else if (direction.z < 0) {
            group.rotateX(-Math.PI / 2);
        }

        return group;
    }

    function buildOverhangDragHandles(W, D, H) {
        while (handlesGroup.children.length > 0) {
            const h = handlesGroup.children[0];
            handlesGroup.remove(h);
        }

        if (!state.enableTabletop || !state.showHandles) return;

        const thick = state.topThickness;
        const topW = W + state.overhangLeft + state.overhangRight;
        const topD = D + state.overhangFront + state.overhangBack;
        const posX = (state.overhangRight - state.overhangLeft) / 2;
        const posZ = (state.overhangFront - state.overhangBack) / 2;
        const posY = H + thick / 2;

        // Front Handle (+Z)
        const frontHandle = createArrowGizmo(new THREE.Vector3(0, 0, 1), 0x38bdf8, 'front');
        frontHandle.position.set(posX, posY, posZ + topD / 2 + 10);
        handlesGroup.add(frontHandle);

        // Back Handle (-Z)
        const backHandle = createArrowGizmo(new THREE.Vector3(0, 0, -1), 0x38bdf8, 'back');
        backHandle.position.set(posX, posY, posZ - topD / 2 - 10);
        handlesGroup.add(backHandle);

        // Right Handle (+X)
        const rightHandle = createArrowGizmo(new THREE.Vector3(1, 0, 0), 0xf59e0b, 'right');
        rightHandle.position.set(posX + topW / 2 + 10, posY, posZ);
        handlesGroup.add(rightHandle);

        // Left Handle (-X)
        const leftHandle = createArrowGizmo(new THREE.Vector3(-1, 0, 0), 0xf59e0b, 'left');
        leftHandle.position.set(posX - topW / 2 - 10, posY, posZ);
        handlesGroup.add(leftHandle);
    }

    // ==========================================
    // 8. 3D DRAG INTERACTION & LIVE MM BADGE
    // ==========================================
    function setupDragInteraction() {
        const badge = document.getElementById('drag-dimension-badge');

        canvas.addEventListener('pointerdown', (e) => {
            if (!state.showHandles) return;
            const rect = canvas.getBoundingClientRect();
            mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
            mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

            raycaster.setFromCamera(mouse, camera);
            const intersects = raycaster.intersectObjects(handlesGroup.children, true);

            if (intersects.length > 0) {
                controls.enabled = false;
                isDraggingHandle = true;

                // Find top group handle
                let hitObj = intersects[0].object;
                while (hitObj.parent && !hitObj.userData.isDragHandle) {
                    hitObj = hitObj.parent;
                }
                activeDragHandle = hitObj;

                // Set up mathematical drag plane
                const normal = activeDragHandle.userData.direction.clone();
                if (normal.z !== 0) {
                    dragPlane.setFromNormalAndCoplanarPoint(new THREE.Vector3(0, 1, 0), activeDragHandle.position);
                } else {
                    dragPlane.setFromNormalAndCoplanarPoint(new THREE.Vector3(0, 1, 0), activeDragHandle.position);
                }

                raycaster.ray.intersectPlane(dragPlane, initialDragPoint);

                if (activeDragHandle.userData.handleId === 'front') initialOverhangVal = state.overhangFront;
                else if (activeDragHandle.userData.handleId === 'back') initialOverhangVal = state.overhangBack;
                else if (activeDragHandle.userData.handleId === 'left') initialOverhangVal = state.overhangLeft;
                else if (activeDragHandle.userData.handleId === 'right') initialOverhangVal = state.overhangRight;

                badge.style.display = 'block';
                updateBadgePosition(e.clientX, e.clientY);
            }
        });

        window.addEventListener('pointermove', (e) => {
            if (!isDraggingHandle || !activeDragHandle) return;

            const rect = canvas.getBoundingClientRect();
            mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
            mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

            raycaster.setFromCamera(mouse, camera);
            if (raycaster.ray.intersectPlane(dragPlane, dragPlaneIntersect)) {
                const diff = dragPlaneIntersect.clone().sub(initialDragPoint);
                const handleId = activeDragHandle.userData.handleId;

                let delta = 0;
                if (handleId === 'front') delta = diff.z;
                else if (handleId === 'back') delta = -diff.z;
                else if (handleId === 'right') delta = diff.x;
                else if (handleId === 'left') delta = -diff.x;

                let newVal = Math.max(0, Math.min(250, Math.round((initialOverhangVal + delta) / 5) * 5));

                if (handleId === 'front') {
                    state.overhangFront = newVal;
                    document.getElementById('slider-overhang-front').value = newVal;
                    document.getElementById('input-overhang-front').value = newVal;
                } else if (handleId === 'back') {
                    state.overhangBack = newVal;
                    document.getElementById('slider-overhang-back').value = newVal;
                    document.getElementById('input-overhang-back').value = newVal;
                } else if (handleId === 'left') {
                    state.overhangLeft = newVal;
                    document.getElementById('slider-overhang-left').value = newVal;
                    document.getElementById('input-overhang-left').value = newVal;
                } else if (handleId === 'right') {
                    state.overhangRight = newVal;
                    document.getElementById('slider-overhang-right').value = newVal;
                    document.getElementById('input-overhang-right').value = newVal;
                }

                badge.textContent = `${handleId.toUpperCase()} Overhang: +${newVal} mm`;
                updateBadgePosition(e.clientX, e.clientY);

                // Live rebuild
                buildTableAssembly();
            }
        });

        window.addEventListener('pointerup', () => {
            if (isDraggingHandle) {
                isDraggingHandle = false;
                activeDragHandle = null;
                controls.enabled = true;
                badge.style.display = 'none';
            }
        });

        function updateBadgePosition(clientX, clientY) {
            const rect = viewportContainer.getBoundingClientRect();
            badge.style.left = `${clientX - rect.left}px`;
            badge.style.top = `${clientY - rect.top - 15}px`;
        }
    }

    // ==========================================
    // 9. 3D DIMENSION GUIDES & HUD
    // ==========================================
    function buildDimensionLines(W, D, H) {
        while (dimensionsGroup.children.length > 0) {
            const d = dimensionsGroup.children[0];
            dimensionsGroup.remove(d);
            if (d.geometry) d.geometry.dispose();
        }

        if (!state.showDimensions) return;

        const dimMat = new THREE.LineBasicMaterial({ color: 0x38bdf8, opacity: 0.65, transparent: true });

        // Width Dimension Line (Front bottom)
        const wPoints = [
            new THREE.Vector3(-W / 2, 0, D / 2 + 50),
            new THREE.Vector3(W / 2, 0, D / 2 + 50)
        ];
        const wGeom = new THREE.BufferGeometry().setFromPoints(wPoints);
        dimensionsGroup.add(new THREE.Line(wGeom, dimMat));

        // Depth Dimension Line (Right bottom)
        const dPoints = [
            new THREE.Vector3(W / 2 + 50, 0, -D / 2),
            new THREE.Vector3(W / 2 + 50, 0, D / 2)
        ];
        const dGeom = new THREE.BufferGeometry().setFromPoints(dPoints);
        dimensionsGroup.add(new THREE.Line(dGeom, dimMat));

        // Height Dimension Line (Back-Left vertical)
        const hPoints = [
            new THREE.Vector3(-W / 2 - 50, 0, -D / 2),
            new THREE.Vector3(-W / 2 - 50, H, -D / 2)
        ];
        const hGeom = new THREE.BufferGeometry().setFromPoints(hPoints);
        dimensionsGroup.add(new THREE.Line(hGeom, dimMat));
    }

    function updateDimensionHUDOverlay() {
        const frameBadge = document.getElementById('hud-frame-size');
        if (frameBadge) {
            frameBadge.textContent = `${state.width} × ${state.depth} × ${state.height} mm`;
        }
        const profileBadge = document.getElementById('hud-profile-type');
        if (profileBadge) {
            profileBadge.textContent = `${state.profileType} ${state.profileFinish === 'black' ? 'Matte Black' : 'Anodized Silver'}`;
        }
        const stretcherBadge = document.getElementById('hud-stretcher-elev');
        if (stretcherBadge) {
            stretcherBadge.textContent = `${state.stretcherHeight} mm from floor`;
        }
    }

    // ==========================================
    // 10. BILL OF MATERIALS (BOM) & CUT LIST
    // ==========================================
    function calculateAndUpdateBOM() {
        const spec = state.profileSpecs[state.profileType];
        const ps = spec.sizeX;
        const W = state.width;
        const D = state.depth;
        const H = state.height;

        const cutList = [];

        // 1. Legs
        cutList.push({
            role: 'Vertical Legs',
            profile: state.profileType,
            length: H,
            qty: 4
        });

        // 2. Top Perimeter Rails
        const topXSpan = W - 2 * ps;
        cutList.push({
            role: 'Top Front/Back Rails',
            profile: state.profileType,
            length: topXSpan,
            qty: 2
        });

        const topZSpan = D - 2 * ps;
        cutList.push({
            role: 'Top Side Rails',
            profile: state.profileType,
            length: topZSpan,
            qty: 2
        });

        // 3. Center Rib
        if (state.centerRib) {
            cutList.push({
                role: 'Top Center Support Rib',
                profile: state.profileType,
                length: topZSpan,
                qty: 1
            });
        }

        // 4. Lower Stretchers
        cutList.push({
            role: 'Lower Side Stretchers',
            profile: state.profileType,
            length: topZSpan,
            qty: 2
        });

        if (state.stretcherStyle === 'box') {
            cutList.push({
                role: 'Lower Front/Back Stretchers',
                profile: state.profileType,
                length: topXSpan,
                qty: 2
            });
        } else {
            cutList.push({
                role: 'Lower Back Stretcher & H-Tie',
                profile: state.profileType,
                length: topXSpan,
                qty: 2
            });
        }

        // 5. Upper Extrusions (if enabled)
        if (state.enableTabletop && state.retainingSlot && state.upperExtrusions) {
            cutList.push({
                role: 'Upper Upright Columns',
                profile: state.profileType,
                length: 600,
                qty: 2
            });
            cutList.push({
                role: 'Upper Cross Bar',
                profile: state.profileType,
                length: W - 70,
                qty: 1
            });
        }

        // Calculate Totals
        let totalLinearMm = 0;
        let totalPieces = 0;
        cutList.forEach(item => {
            totalLinearMm += item.length * item.qty;
            totalPieces += item.qty;
        });

        const totalMeters = (totalLinearMm / 1000).toFixed(2);

        // Hardware counts
        let bracketQty = 0;
        if (state.joineryType === 'gusset' || state.joineryType === 'concealed') {
            bracketQty = 16; // 8 top + 8 bottom
        } else if (state.joineryType === 'cube') {
            bracketQty = 4; // 4 corner cubes
        } else {
            bracketQty = 8;
        }

        const tnutQty = bracketQty * 2;
        const boltQty = bracketQty * 2;

        // Tabletop Dimensions
        const topW = W + state.overhangLeft + state.overhangRight;
        const topD = D + state.overhangFront + state.overhangBack;

        // Update Sidebar Stats (if elements exist)
        const elStatMeters = document.getElementById('stat-total-meters');
        if (elStatMeters) elStatMeters.textContent = `${totalMeters} m`;
        const elBadgeMeters = document.getElementById('badge-total-meters');
        if (elBadgeMeters) elBadgeMeters.textContent = `${totalMeters} m`;
        const elStatPieces = document.getElementById('stat-cut-pieces');
        if (elStatPieces) elStatPieces.textContent = `${totalPieces} pcs`;
        const elStatBrackets = document.getElementById('stat-brackets');
        if (elStatBrackets) elStatBrackets.textContent = `${bracketQty} pcs`;
        const elStatTnuts = document.getElementById('stat-tnuts');
        if (elStatTnuts) elStatTnuts.textContent = `${tnutQty} pairs`;

        const elBadgeTop = document.getElementById('badge-top-dims');
        if (elBadgeTop) elBadgeTop.textContent = `${topW} × ${topD}`;
        const elOverhangSum = document.getElementById('val-overhang-summary');
        if (elOverhangSum) elOverhangSum.textContent = `F:${state.overhangFront} B:${state.overhangBack} L:${state.overhangLeft} R:${state.overhangRight} mm`;

        // Update Right Dock Panel Elements
        const rightBadgeMeters = document.getElementById('right-total-meters-badge');
        if (rightBadgeMeters) rightBadgeMeters.textContent = `${totalMeters} m`;
        const rightStatMeters = document.getElementById('right-stat-total-meters');
        if (rightStatMeters) rightStatMeters.textContent = `${totalMeters} m`;
        const rightStatPieces = document.getElementById('right-stat-cut-pieces');
        if (rightStatPieces) rightStatPieces.textContent = `${totalPieces} pcs`;
        const rightStatBrackets = document.getElementById('right-stat-brackets');
        if (rightStatBrackets) rightStatBrackets.textContent = `${bracketQty} pcs`;
        const rightStatTnuts = document.getElementById('right-stat-tnuts');
        if (rightStatTnuts) rightStatTnuts.textContent = `${tnutQty} pairs`;

        // Update Right Panel Cut List Table
        const rightTbodyCut = document.getElementById('right-tbody-cut-list');
        if (rightTbodyCut) {
            rightTbodyCut.innerHTML = '';
            cutList.forEach((item) => {
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td><strong>${item.role}</strong></td>
                    <td>${item.profile}</td>
                    <td><code>${item.length}mm</code></td>
                    <td><strong>${item.qty}</strong></td>
                `;
                rightTbodyCut.appendChild(tr);
            });
            const trTotal = document.createElement('tr');
            trTotal.style.background = 'rgba(56, 189, 248, 0.08)';
            trTotal.innerHTML = `
                <td colspan="2"><strong>Grand Total</strong></td>
                <td colspan="2"><strong style="color: var(--accent-blue);">${totalMeters} m (${totalPieces} pcs)</strong></td>
            `;
            rightTbodyCut.appendChild(trTotal);
        }

        // Update Right Panel Hardware Table
        const rightTbodyHw = document.getElementById('right-tbody-hardware');
        if (rightTbodyHw) {
            rightTbodyHw.innerHTML = `
                <tr><td>Corner Brackets</td><td>${state.joineryType}</td><td><strong>${bracketQty} pcs</strong></td></tr>
                <tr><td>T-Nuts</td><td>${spec.tnut}</td><td><strong>${tnutQty} pcs</strong></td></tr>
                <tr><td>Socket Screws</td><td>${spec.hardware}</td><td><strong>${boltQty} pcs</strong></td></tr>
                <tr><td>Base Leveling Feet</td><td>${state.feetType}</td><td><strong>4 pcs</strong></td></tr>
                <tr><td>Tabletop Z-Clips</td><td>Slotted Clip</td><td><strong>8 pcs</strong></td></tr>
            `;
        }

        // Update Right Panel Tabletop Slab Table
        const rightTbodyTop = document.getElementById('right-tbody-tabletop');
        if (rightTbodyTop) {
            rightTbodyTop.innerHTML = state.enableTabletop ? `
                <tr>
                    <td>${state.topLaminate.toUpperCase()} Mica</td>
                    <td><strong>${topW} × ${topD} × ${state.topThickness} mm</strong></td>
                </tr>
            ` : `
                <tr><td colspan="2" style="color:var(--text-muted);">None (Open Frame)</td></tr>
            `;
        }

        // Update Modal Tables (if open)
        const tbodyCut = document.getElementById('tbody-cut-list');
        if (tbodyCut) {
            tbodyCut.innerHTML = '';
            cutList.forEach((item, idx) => {
                const totalItemMm = item.length * item.qty;
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td>${idx + 1}</td>
                    <td><strong>${item.role}</strong></td>
                    <td>${item.profile} T-Slot</td>
                    <td><code>${item.length} mm</code></td>
                    <td>${item.qty}</td>
                    <td><code>${totalItemMm} mm</code></td>
                `;
                tbodyCut.appendChild(tr);
            });
            // Total row
            const trTotal = document.createElement('tr');
            trTotal.style.background = 'rgba(56, 189, 248, 0.08)';
            trTotal.innerHTML = `
                <td colspan="4"><strong>Grand Total Extrusion Length</strong></td>
                <td><strong>${totalPieces} pcs</strong></td>
                <td><strong style="color: var(--accent-blue);">${totalMeters} meters (${totalLinearMm} mm)</strong></td>
            `;
            tbodyCut.appendChild(trTotal);
        }

        const tbodyHardware = document.getElementById('tbody-hardware-bom');
        if (tbodyHardware) {
            tbodyHardware.innerHTML = `
                <tr>
                    <td>Corner Brackets</td>
                    <td>${state.joineryType === 'gusset' ? 'Die-Cast 90° Aluminum Gusset with Tabs' : state.joineryType}</td>
                    <td><strong>${bracketQty} pcs</strong></td>
                    <td>Fastens structural perpendicular joints</td>
                </tr>
                <tr>
                    <td>T-Nuts</td>
                    <td>${spec.tnut} (${spec.tap})</td>
                    <td><strong>${tnutQty} pcs</strong></td>
                    <td>Drop-in slot nuts for ${spec.slot}mm channel</td>
                </tr>
                <tr>
                    <td>Socket Head Screws</td>
                    <td>${spec.hardware} Grade 10.9 Zinc/Steel</td>
                    <td><strong>${boltQty} pcs</strong></td>
                    <td>Hex socket cap screws</td>
                </tr>
                <tr>
                    <td>Base Leveling Feet</td>
                    <td>${state.feetType === 'rubber' ? 'Articulated Rubber Leveling Foot' : state.feetType} (${spec.tap})</td>
                    <td><strong>4 pcs</strong></td>
                    <td>Threaded into bottom leg cores</td>
                </tr>
                <tr>
                    <td>Tabletop Z-Clips</td>
                    <td>Slotted Wood Expansion Fasteners</td>
                    <td><strong>8 pcs</strong></td>
                    <td>Secures plywood top to upper frame slots</td>
                </tr>
            `;
        }

        const tbodyTabletop = document.getElementById('tbody-tabletop-bom');
        if (tbodyTabletop) {
            tbodyTabletop.innerHTML = state.enableTabletop ? `
                <tr>
                    <td>Main Table Slab</td>
                    <td>Birch Plywood with ${state.topLaminate.toUpperCase()} Mica Laminate</td>
                    <td><strong>${topW} mm</strong></td>
                    <td><strong>${topD} mm</strong></td>
                    <td><strong>${state.topThickness} mm</strong></td>
                    <td>${state.retainingSlot ? '5mm Routed Perimeter Slot' : 'Flush Plain Edge'}</td>
                </tr>
            ` : `
                <tr>
                    <td colspan="6" style="color: var(--text-muted); text-align: center;">Tabletop disabled (Open Frame Only)</td>
                </tr>
            `;
        }

        // Cache for CSV Export
        state.currentCutList = cutList;
        state.currentHardware = [
            { item: 'Corner Brackets', spec: state.joineryType, qty: bracketQty },
            { item: 'T-Nuts', spec: spec.tnut, qty: tnutQty },
            { item: 'Socket Screws', spec: spec.hardware, qty: boltQty },
            { item: 'Base Feet', spec: state.feetType, qty: 4 },
            { item: 'Tabletop Z-Clips', spec: 'Wood Mount', qty: 8 }
        ];
    }

    // ==========================================
    // 11. UI EVENT LISTENERS & PRESETS
    // ==========================================
    function setupUIEventListeners() {
        // Collapsible Accordion Cards on Header Click
        document.querySelectorAll('.card-header').forEach(header => {
            header.addEventListener('click', (e) => {
                if (e.target.tagName === 'BUTTON' || e.target.tagName === 'INPUT' || e.target.closest('.card-badge')) return;
                const card = header.closest('.config-card');
                if (card) {
                    card.classList.toggle('collapsed');
                }
            });
        });

        // Quick Presets
        document.querySelectorAll('.btn-preset').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.btn-preset').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                const preset = btn.dataset.preset;
                applyPreset(preset);
            });
        });

        // 1-Click Table Generator Buttons
        document.getElementById('btn-generate-table-main').addEventListener('click', () => {
            applyPreset('workbench');
        });
        document.getElementById('btn-create-table-quick').addEventListener('click', () => {
            applyPreset('workbench');
        });

        // Profile Selector Buttons
        document.querySelectorAll('.btn-profile-card[data-profile]').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.btn-profile-card[data-profile]').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                state.profileType = btn.dataset.profile;
                document.getElementById('badge-active-profile').textContent = `${state.profileType} T-Slot`;
                buildTableAssembly();
            });
        });

        // Finish Selector Buttons
        document.querySelectorAll('.btn-finish-chip[data-finish]').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.btn-finish-chip[data-finish]').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                state.profileFinish = btn.dataset.finish;
                buildTableAssembly();
            });
        });

        // Dimensions Sliders & Number Inputs
        bindSliderAndInput('table-width', 'width', 400, 2400);
        bindSliderAndInput('table-depth', 'depth', 300, 1500);
        bindSliderAndInput('table-height', 'height', 300, 1200);
        bindSliderAndInput('stretcher-height', 'stretcherHeight', 50, 400);

        // Stretcher Style
        document.getElementById('btn-stretcher-box').addEventListener('click', () => {
            document.getElementById('btn-stretcher-box').classList.add('active');
            document.getElementById('btn-stretcher-hframe').classList.remove('active');
            state.stretcherStyle = 'box';
            buildTableAssembly();
        });
        document.getElementById('btn-stretcher-hframe').addEventListener('click', () => {
            document.getElementById('btn-stretcher-hframe').classList.add('active');
            document.getElementById('btn-stretcher-box').classList.remove('active');
            state.stretcherStyle = 'hframe';
            buildTableAssembly();
        });

        // Center Rib Toggle
        document.getElementById('check-center-rib').addEventListener('change', (e) => {
            state.centerRib = e.target.checked;
            buildTableAssembly();
        });

        // Tabletop Toggles
        document.getElementById('check-enable-tabletop').addEventListener('change', (e) => {
            state.enableTabletop = e.target.checked;
            buildTableAssembly();
        });

        // Thickness Pills
        document.querySelectorAll('.btn-profile-card[data-thickness]').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.btn-profile-card[data-thickness]').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                state.topThickness = parseInt(btn.dataset.thickness);
                document.getElementById('val-top-thickness').textContent = `${state.topThickness} mm`;
                buildTableAssembly();
            });
        });

        // Laminate Finish Cards
        document.querySelectorAll('.btn-laminate-card').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.btn-laminate-card').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                state.topLaminate = btn.dataset.laminate;
                buildTableAssembly();
            });
        });

        // Overhang Sliders
        bindSliderAndInput('overhang-front', 'overhangFront', 0, 250);
        bindSliderAndInput('overhang-back', 'overhangBack', 0, 250);
        bindSliderAndInput('overhang-left', 'overhangLeft', 0, 250);
        bindSliderAndInput('overhang-right', 'overhangRight', 0, 250);

        // 5mm Retaining Slot Toggle
        document.getElementById('check-retaining-slot').addEventListener('change', (e) => {
            state.retainingSlot = e.target.checked;
            buildTableAssembly();
        });

        // Upper Extrusions Toggle
        document.getElementById('check-upper-extrusions').addEventListener('change', (e) => {
            state.upperExtrusions = e.target.checked;
            buildTableAssembly();
        });

        // Joinery Type Chips
        document.querySelectorAll('.btn-joinery-chip[data-joinery]').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.btn-joinery-chip[data-joinery]').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                state.joineryType = btn.dataset.joinery;
                buildTableAssembly();
            });
        });

        // Feet Type Chips
        document.querySelectorAll('.btn-finish-chip[data-feet]').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.btn-finish-chip[data-feet]').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                state.feetType = btn.dataset.feet;
                buildTableAssembly();
            });
        });

        // Viewport Top HUD Buttons
        const btnToggleHandles = document.getElementById('btn-toggle-handles');
        btnToggleHandles.addEventListener('click', () => {
            state.showHandles = !state.showHandles;
            btnToggleHandles.classList.toggle('active', state.showHandles);
            handlesGroup.visible = state.showHandles;
        });

        const btnToggleDims = document.getElementById('btn-toggle-dims');
        btnToggleDims.addEventListener('click', () => {
            state.showDimensions = !state.showDimensions;
            btnToggleDims.classList.toggle('active', state.showDimensions);
            dimensionsGroup.visible = state.showDimensions;
        });

        const btnToggleWire = document.getElementById('btn-toggle-wireframe');
        btnToggleWire.addEventListener('click', () => {
            state.wireframe = !state.wireframe;
            btnToggleWire.classList.toggle('active', state.wireframe);
            tableAssemblyGroup.traverse(child => {
                if (child.material) child.material.wireframe = state.wireframe;
            });
        });

        document.getElementById('btn-reset-camera').addEventListener('click', () => {
            camera.position.set(1600, 1400, 2000);
            controls.target.set(0, state.height / 2, 0);
            controls.update();
        });

        // View Cube Angles
        document.querySelectorAll('.view-cube-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const view = btn.dataset.view;
                if (view === 'iso') {
                    camera.position.set(1600, 1400, 2000);
                } else if (view === 'front') {
                    camera.position.set(0, state.height / 2, 2400);
                } else if (view === 'top') {
                    camera.position.set(0, 2600, 0);
                } else if (view === 'side') {
                    camera.position.set(2400, state.height / 2, 0);
                }
                controls.target.set(0, state.height / 2, 0);
                controls.update();
            });
        });

        // BOM Modal Open / Close
        const modal = document.getElementById('bom-modal-overlay');
        const btnOpenModal = document.getElementById('btn-open-bom-modal');
        if (btnOpenModal && modal) {
            btnOpenModal.addEventListener('click', () => {
                calculateAndUpdateBOM();
                modal.classList.add('open');
            });
        }
        const btnExportBom = document.getElementById('btn-export-bom');
        if (btnExportBom && modal) {
            btnExportBom.addEventListener('click', () => {
                calculateAndUpdateBOM();
                modal.classList.add('open');
            });
        }
        const btnCloseBom = document.getElementById('btn-close-bom-modal');
        if (btnCloseBom && modal) {
            btnCloseBom.addEventListener('click', () => {
                modal.classList.remove('open');
            });
        }
        if (modal) {
            modal.addEventListener('click', (e) => {
                if (e.target === modal) modal.classList.remove('open');
            });
        }

        // CSV Export & Print (Modal & Right Panel)
        const btnDlCsv = document.getElementById('btn-download-csv');
        if (btnDlCsv) btnDlCsv.addEventListener('click', downloadCutListCSV);
        const btnPrintBom = document.getElementById('btn-print-bom');
        if (btnPrintBom) btnPrintBom.addEventListener('click', () => window.print());

        const rightBtnDlCsv = document.getElementById('right-btn-download-csv');
        if (rightBtnDlCsv) rightBtnDlCsv.addEventListener('click', downloadCutListCSV);
        const rightBtnPrintBom = document.getElementById('right-btn-print-bom');
        if (rightBtnPrintBom) rightBtnPrintBom.addEventListener('click', () => window.print());

        // High-Res Viewport Screenshot Capture
        const btnScreenshot = document.getElementById('btn-screenshot-3d');
        if (btnScreenshot) {
            btnScreenshot.addEventListener('click', () => {
                renderer.render(scene, camera);
                const dataUrl = canvas.toDataURL('image/png');
                const a = document.createElement('a');
                a.href = dataUrl;
                a.download = `extrusion_table_${state.profileType}_${Date.now()}.png`;
                a.click();
            });
        }
    }

    function bindSliderAndInput(idPrefix, stateKey, min, max) {
        const slider = document.getElementById(`slider-${idPrefix}`);
        const input = document.getElementById(`input-${idPrefix}`);
        const valBadge = document.getElementById(`val-${idPrefix}`);

        function update(val) {
            val = Math.max(min, Math.min(max, parseInt(val) || min));
            state[stateKey] = val;
            slider.value = val;
            input.value = val;
            if (valBadge) {
                if (idPrefix === 'stretcher-height') {
                    valBadge.textContent = `${val} mm (${(val / 25.4).toFixed(1)}")`;
                } else {
                    valBadge.textContent = `${val} mm`;
                }
            }
            buildTableAssembly();
        }

        slider.addEventListener('input', (e) => update(e.target.value));
        input.addEventListener('change', (e) => update(e.target.value));
    }

    function applyPreset(presetKey) {
        if (presetKey === 'workbench') {
            state.width = 1200;
            state.depth = 800;
            state.height = 750;
            state.profileType = '3030';
            state.stretcherHeight = 150;
            state.stretcherStyle = 'box';
            state.centerRib = true;
            state.topThickness = 18;
            state.topLaminate = 'birch';
        } else if (presetKey === 'rig') {
            state.width = 600;
            state.depth = 600;
            state.height = 700;
            state.profileType = '2020';
            state.stretcherHeight = 100;
            state.stretcherStyle = 'box';
            state.centerRib = false;
            state.topThickness = 12;
            state.topLaminate = 'charcoal';
        } else if (presetKey === 'heavy') {
            state.width = 1500;
            state.depth = 900;
            state.height = 850;
            state.profileType = '4040';
            state.stretcherHeight = 180;
            state.stretcherStyle = 'hframe';
            state.centerRib = true;
            state.topThickness = 25;
            state.topLaminate = 'butcher';
        } else if (presetKey === 'compact') {
            state.width = 800;
            state.depth = 500;
            state.height = 800;
            state.profileType = '2040';
            state.stretcherHeight = 120;
            state.stretcherStyle = 'box';
            state.centerRib = false;
            state.topThickness = 18;
            state.topLaminate = 'white';
        }

        // Sync inputs
        document.getElementById('slider-table-width').value = state.width;
        document.getElementById('input-table-width').value = state.width;
        document.getElementById('val-table-width').textContent = `${state.width} mm`;

        document.getElementById('slider-table-depth').value = state.depth;
        document.getElementById('input-table-depth').value = state.depth;
        document.getElementById('val-table-depth').textContent = `${state.depth} mm`;

        document.getElementById('slider-table-height').value = state.height;
        document.getElementById('input-table-height').value = state.height;
        document.getElementById('val-table-height').textContent = `${state.height} mm`;

        document.getElementById('slider-stretcher-height').value = state.stretcherHeight;
        document.getElementById('input-stretcher-height').value = state.stretcherHeight;
        document.getElementById('val-stretcher-height').textContent = `${state.stretcherHeight} mm (${(state.stretcherHeight / 25.4).toFixed(1)}")`;

        // Update active profile button
        document.querySelectorAll('.btn-profile-card[data-profile]').forEach(b => {
            b.classList.toggle('active', b.dataset.profile === state.profileType);
        });
        document.getElementById('badge-active-profile').textContent = `${state.profileType} T-Slot`;

        // Build
        buildTableAssembly();
    }

    function downloadCutListCSV() {
        if (!state.currentCutList) return;

        let csv = 'Role,Profile,Cut Length (mm),Quantity,Total (mm)\n';
        state.currentCutList.forEach(item => {
            csv += `"${item.role}","${item.profile}",${item.length},${item.qty},${item.length * item.qty}\n`;
        });

        csv += '\nHardware BOM\nItem,Specification,Quantity\n';
        state.currentHardware.forEach(h => {
            csv += `"${h.item}","${h.spec}",${h.qty}\n`;
        });

        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `extrusion_cut_list_${state.profileType}_${state.width}x${state.depth}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    }

    // ==========================================
    // 12. INITIALIZATION
    // ==========================================
    window.addEventListener('DOMContentLoaded', () => {
        initThree();
        setupUIEventListeners();
        buildTableAssembly();
    });

})();
