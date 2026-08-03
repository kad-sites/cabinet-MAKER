// State Management
let materials = JSON.parse(localStorage.getItem('cabinetOptimizer_materials')) || [];
window.materials = materials;
let cabinetParts = [];
let editingMaterialId = null;

// DOM Elements
const tabs = document.querySelectorAll('.tab-btn');
const tabContents = document.querySelectorAll('.tab-content');
const materialForm = document.getElementById('material-form');
const savedMaterialsList = document.getElementById('saved-materials-list');
const cabMaterialSelect = document.getElementById('cab-material');
const cabinetForm = document.getElementById('cabinet-form');
const generatedPartsUl = document.getElementById('generated-parts');
const partsListDiv = document.getElementById('parts-list');
const cutLayoutsContainer = document.getElementById('cut-layouts');
const globalCurrencySelect = document.getElementById('global-currency');
let currentCurrency = '₹';

if (globalCurrencySelect) {
    globalCurrencySelect.addEventListener('change', (e) => {
        currentCurrency = e.target.value;
        updateMaterialUI();
        // Reset optimization cost display so it doesn't show wrong currency
        document.getElementById('res-cost').textContent = `${currentCurrency}0`;
    });
}

// Tab Navigation
tabs.forEach(tab => {
    tab.addEventListener('click', () => {
        tabs.forEach(t => t.classList.remove('active'));
        tabContents.forEach(c => c.classList.remove('active'));
        
        tab.classList.add('active');
        document.getElementById(tab.dataset.target).classList.add('active');

        if (tab.dataset.target === 'visualizer-tab') {
            // No longer auto-submit form. The CAD Builder handles itself via 3d.js.
        }
    });
});

// Switch to tab
function switchToTab(tabId) {
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    
    document.getElementById(tabId).classList.add('active');
    document.querySelector(`[data-target="${tabId}"]`).classList.add('active');
}

function getNonOverlappingWaste(sheetWidth, sheetHeight, packedParts) {
    let wasteRects = [{x: 0, y: 0, w: sheetWidth, h: sheetHeight}];

    for (let part of packedParts) {
        let newWaste = [];
        for (let wRect of wasteRects) {
            if (part.x < wRect.x + wRect.w && part.x + part.w > wRect.x &&
                part.y < wRect.y + wRect.h && part.y + part.h > wRect.y) {
                
                if (part.y > wRect.y) {
                    newWaste.push({
                        x: wRect.x,
                        y: wRect.y,
                        w: wRect.w,
                        h: part.y - wRect.y
                    });
                }
                if (part.y + part.h < wRect.y + wRect.h) {
                    newWaste.push({
                        x: wRect.x,
                        y: part.y + part.h,
                        w: wRect.w,
                        h: (wRect.y + wRect.h) - (part.y + part.h)
                    });
                }
                if (part.x > wRect.x) {
                    newWaste.push({
                        x: wRect.x,
                        y: Math.max(wRect.y, part.y),
                        w: part.x - wRect.x,
                        h: Math.min(wRect.y + wRect.h, part.y + part.h) - Math.max(wRect.y, part.y)
                    });
                }
                if (part.x + part.w < wRect.x + wRect.w) {
                    newWaste.push({
                        x: part.x + part.w,
                        y: Math.max(wRect.y, part.y),
                        w: (wRect.x + wRect.w) - (part.x + part.w),
                        h: Math.min(wRect.y + wRect.h, part.y + part.h) - Math.max(wRect.y, part.y)
                    });
                }
            } else {
                newWaste.push(wRect);
            }
        }
        wasteRects = newWaste;
    }
    
    // Filter out slivers less than 1.9 inches 
    return wasteRects.filter(r => r.w >= 1.9 && r.h >= 1.9);
}

// Add Material
document.getElementById('mat-name').addEventListener('input', (e) => {
    const val = e.target.value.toLowerCase();
    const isLaminate = val.includes('laminate') || val.includes('mica') || val.includes('liner');
    const thickContainer = document.getElementById('thickness-container');
    
    if (isLaminate) {
        thickContainer.innerHTML = `
            <select id="mat-thickness" required style="flex: 1;">
                <option value="0.7">0.7</option>
                <option value="0.75">0.75</option>
                <option value="0.8">0.8</option>
                <option value="1.0">1.0</option>
            </select>
            <select id="thickness-unit" style="width: 80px;">
                <option value="mm">mm</option>
                <option value="in">in</option>
            </select>
        `;
    } else {
        thickContainer.innerHTML = `
            <input type="number" id="mat-thickness" value="12" step="any" required style="flex: 1;">
            <select id="thickness-unit" style="width: 80px;">
                <option value="mm" selected>mm</option>
                <option value="in">in</option>
            </select>
        `;
    }
});
materialForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const brand = document.getElementById('mat-brand').value || '';
    const name = document.getElementById('mat-name').value;
    let width = parseFloat(document.getElementById('mat-width').value);
    let height = parseFloat(document.getElementById('mat-height').value);
    let thickness = parseFloat(document.getElementById('mat-thickness').value);
    const inputThickness = thickness;
    const tUnit = document.getElementById('thickness-unit').value;
    const inputPrice = parseFloat(document.getElementById('mat-price').value);

    const wUnit = document.getElementById('width-unit').value;
    const hUnit = document.getElementById('height-unit').value;

    if (wUnit === 'ft') width *= 12;
    if (hUnit === 'ft') height *= 12;
    if (tUnit === 'in') thickness *= 25.4; // Convert inches to mm internally

    const sqft = (width * height) / 144;
    const sheetPrice = inputPrice * sqft;

    if (editingMaterialId !== null) {
        materials = materials.map(m => m.id === editingMaterialId ? { id: editingMaterialId, brand, name, width, height, thickness, price: sheetPrice, inputPrice, inputThickness, tUnit } : m);
        cancelEdit();
    } else {
        const material = { id: Date.now(), brand, name, width, height, thickness, price: sheetPrice, inputPrice, inputThickness, tUnit };
        materials.push(material);
        materialForm.reset();
    }
    
    saveMaterials();
    updateMaterialUI();
});

function editMaterial(id) {
    const mat = materials.find(m => m.id === id);
    if (!mat) return;
    
    editingMaterialId = id;
    
    document.getElementById('mat-brand').value = mat.brand || '';
    document.getElementById('mat-name').value = mat.name;
    document.getElementById('mat-name').dispatchEvent(new Event('input')); // Trigger UI swap if laminate
    document.getElementById('mat-width').value = mat.width;
    document.getElementById('width-unit').value = 'in';
    
    document.getElementById('mat-height').value = mat.height;
    document.getElementById('height-unit').value = 'in';
    
    // Use timeout to ensure the DOM updated from the event dispatch before setting value
    setTimeout(() => {
        document.getElementById('mat-thickness').value = mat.inputThickness;
        document.getElementById('thickness-unit').value = mat.tUnit;
    }, 10);
    
    document.getElementById('mat-price').value = mat.inputPrice;
    
    document.getElementById('submit-mat-btn').textContent = "Update Material";
    document.getElementById('cancel-edit-btn').style.display = "block";
    
    // Switch to materials tab and scroll to top
    switchToTab('materials-tab');
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function cancelEdit() {
    editingMaterialId = null;
    materialForm.reset();
    document.getElementById('mat-name').dispatchEvent(new Event('input')); // Reset thickness UI
    document.getElementById('submit-mat-btn').textContent = "Add Material";
    document.getElementById('cancel-edit-btn').style.display = "none";
}

function deleteMaterial(id) {
    materials = materials.filter(m => m.id !== id);
    saveMaterials();
    updateMaterialUI();
}

function saveMaterials() {
    localStorage.setItem('cabinetOptimizer_materials', JSON.stringify(materials));
}

function updateMaterialUI() {
    // Sync global materials array
    window.materials = materials;
    savedMaterialsList.innerHTML = '';
    cabMaterialSelect.innerHTML = '';
    
    const cabLinerSelect = document.getElementById('cab-liner');
    if (cabLinerSelect) {
        cabLinerSelect.innerHTML = '<option value="none">Without Liner (Bare)</option>';
    }

    if (materials.length === 0) {
        savedMaterialsList.innerHTML = '<li>No materials added yet.</li>';
        return;
    }

    materials.forEach(mat => {
        // List item
        const displayName = `${mat.brand ? mat.brand + ' ' : ''}${mat.name} - ${mat.width}" x ${mat.height}" [${(mat.width/12).toFixed(1)}ft x ${(mat.height/12).toFixed(1)}ft] (${mat.inputThickness}${mat.tUnit})`;
        
        const li = document.createElement('li');
        li.innerHTML = `
            <div>
                <strong>${displayName}</strong><br>
                <small>${currentCurrency}${mat.inputPrice} per sqft (${currentCurrency}${mat.price.toFixed(2)} total/sheet)</small>
            </div>
            <div style="display: flex; gap: 0.5rem;">
                <button class="edit-btn" onclick="editMaterial(${mat.id})" style="background: var(--primary); color: white; border: none; padding: 0.4rem 0.8rem; border-radius: 4px; cursor: pointer; font-weight: 600;">Edit</button>
                <button class="delete-btn" onclick="deleteMaterial(${mat.id})">Delete</button>
            </div>
        `;
        savedMaterialsList.appendChild(li);

        const option = document.createElement('option');
        option.value = mat.id;
        option.textContent = displayName;
        cabMaterialSelect.appendChild(option.cloneNode(true));
        if (cabLinerSelect) {
            cabLinerSelect.appendChild(option.cloneNode(true));
        }
    });
}

// No default materials; starts empty.
updateMaterialUI();

// Cabinet Generation & Optimization
cabinetForm.addEventListener('submit', (e) => {
    e.preventDefault();
    
    if (materials.length === 0) {
        alert("Please add materials first.");
        return;
    }

    let h = parseFloat(document.getElementById('cab-height').value);
    let w = parseFloat(document.getElementById('cab-width').value);
    let d = parseFloat(document.getElementById('cab-depth').value);

    const hUnit = document.getElementById('cab-height-unit').value;
    const wUnit = document.getElementById('cab-width-unit').value;
    const dUnit = document.getElementById('cab-depth-unit').value;

    const numShelves = parseInt(document.getElementById('cab-shelves').value) || 0;
    const numDrawers = parseInt(document.getElementById('cab-drawers').value) || 0;

    if (hUnit === 'mm') h /= 25.4;
    else if (hUnit === 'ft') h *= 12;

    if (wUnit === 'mm') w /= 25.4;
    else if (wUnit === 'ft') w *= 12;

    if (dUnit === 'mm') d /= 25.4;
    else if (dUnit === 'ft') d *= 12;
    
    const selectedMatId = parseInt(cabMaterialSelect.value);
    const selectedMat = materials.find(m => m.id === selectedMatId);
    
    if (!selectedMat) {
        if (errorDiv) {
            errorDiv.innerHTML = `<strong>Error:</strong> Please add a material in the Materials tab first.`;
            errorDiv.classList.remove('hidden');
        }
        
        // If they click 3D Visualizer tab and have no materials, just render a default 18mm thickness cabinet
        if (window.renderCabinet3D) {
            window.renderCabinet3D(w, h, d, numShelves, numDrawers, 18/25.4);
        }
        return;
    }
    
    const t_inch = selectedMat.thickness / 25.4;
    
    const innerWidth = w - (2 * t_inch);
    const innerHeight = h - (2 * t_inch);

    cabinetParts = [
        { label: "Left Side", w: h, h: d },
        { label: "Right Side", w: h, h: d },
        { label: "Top", w: innerWidth, h: d },
        { label: "Bottom", w: innerWidth, h: d },
        { label: "Back Panel", w: innerWidth, h: innerHeight }
    ];

    const linerVal = document.getElementById('cab-liner').value;
    window.micaParts = [];
    window.selectedLinerMat = linerVal !== 'none' ? materials.find(m => m.id === parseInt(linerVal)) : null;

    if (window.selectedLinerMat) {
        window.micaParts.push({ label: "Liner Left Side", w: h, h: d });
        window.micaParts.push({ label: "Liner Right Side", w: h, h: d });
        window.micaParts.push({ label: "Liner Top", w: innerWidth, h: d });
        window.micaParts.push({ label: "Liner Bottom", w: innerWidth, h: d });
        window.micaParts.push({ label: "Liner Back Panel", w: innerWidth, h: innerHeight });
    }

    for (let i = 0; i < numShelves; i++) {
        cabinetParts.push({ label: `Shelf ${i+1}`, w: innerWidth, h: d - 1.0 });
        if (window.selectedLinerMat) {
            window.micaParts.push({ label: `Liner Shelf ${i+1} Top`, w: innerWidth, h: d - 1.0 });
            window.micaParts.push({ label: `Liner Shelf ${i+1} Btm`, w: innerWidth, h: d - 1.0 });
        }
    }

    if (numDrawers > 0) {
        const drawerDepth = d - 2.0; 
        const drawerWidth = innerWidth - 1.0; 
        const drawerHeight = (innerHeight / numDrawers) - 1.5; 

        if (drawerHeight > 0) {
            for (let i = 0; i < numDrawers; i++) {
                const dLabel = `Drw ${i+1}`;
                cabinetParts.push({ label: `${dLabel} Side L`, w: drawerDepth, h: drawerHeight });
                cabinetParts.push({ label: `${dLabel} Side R`, w: drawerDepth, h: drawerHeight });
                const drawerInnerWidth = drawerWidth - (2 * t_inch);
                cabinetParts.push({ label: `${dLabel} FrontBox`, w: drawerInnerWidth, h: drawerHeight });
                cabinetParts.push({ label: `${dLabel} BackBox`, w: drawerInnerWidth, h: drawerHeight });
                cabinetParts.push({ label: `${dLabel} Bottom`, w: drawerWidth, h: drawerDepth });

                if (window.selectedLinerMat) {
                    window.micaParts.push({ label: `Liner ${dLabel} Side L`, w: drawerDepth, h: drawerHeight });
                    window.micaParts.push({ label: `Liner ${dLabel} Side R`, w: drawerDepth, h: drawerHeight });
                    window.micaParts.push({ label: `Liner ${dLabel} FrontBox`, w: drawerInnerWidth, h: drawerHeight });
                    window.micaParts.push({ label: `Liner ${dLabel} BackBox`, w: drawerInnerWidth, h: drawerHeight });
                    window.micaParts.push({ label: `Liner ${dLabel} Bottom`, w: drawerWidth, h: drawerDepth });
                }
            }
        }
    }

    // Display parts
    const errorDiv = document.getElementById('designer-error');
    if (errorDiv) errorDiv.classList.add('hidden');

    partsListDiv.classList.remove('hidden');
    generatedPartsUl.innerHTML = '';
    cabinetParts.forEach(p => {
        const li = document.createElement('li');
        li.textContent = `${p.label}: ${p.w.toFixed(1)}" x ${p.h.toFixed(1)}"`;
        generatedPartsUl.appendChild(li);
    });

    if (window.selectedLinerMat) {
        const li = document.createElement('li');
        li.style.marginTop = '1rem';
        li.style.fontWeight = 'bold';
        li.style.color = '#3b82f6';
        const linerName = window.selectedLinerMat.brand ? `${window.selectedLinerMat.brand} - ${window.selectedLinerMat.name}` : window.selectedLinerMat.name;
        li.textContent = `--- Inner Liner (${linerName}) ---`;
        generatedPartsUl.appendChild(li);
        
        window.micaParts.forEach(p => {
            const mLi = document.createElement('li');
            mLi.textContent = `${p.label}: ${p.w.toFixed(1)}" x ${p.h.toFixed(1)}"`;
            generatedPartsUl.appendChild(mLi);
        });
    }

    // Call global optimization function
    window.runGlobalOptimization(cabinetParts, window.micaParts, selectedMat, window.selectedLinerMat);

});

function optimizeMultipleMaterials(parts, candidates) {
    let sortedParts = [...parts].sort((a, b) => (b.w * b.h) - (a.w * a.h));
    let sheetsUsed = [];
    let remainingParts = [...sortedParts];

    while (remainingParts.length > 0) {
        let bestSheet = null;
        let bestScore = Infinity; 

        for (let mat of candidates) {
            let packer = new BinPacker(mat.width, mat.height, 0.125);
            let packedIndices = [];
            let packedParts = [];
            let packedArea = 0;

            for (let i = 0; i < remainingParts.length; i++) {
                let part = remainingParts[i];
                let placed = packer.insert(part.w, part.h, part.label, true);
                if (placed) {
                    packedIndices.push(i);
                    packedParts.push(placed);
                    packedArea += (part.w * part.h);
                }
            }

            if (packedIndices.length > 0) {
                let score;
                if (packedIndices.length === remainingParts.length) {
                    score = mat.price - 1000000; 
                } else {
                    score = mat.price / packedArea; 
                }

                if (score < bestScore) {
                    bestScore = score;
                    bestSheet = {
                        material: mat,
                        packer: packer,
                        parts: packedParts,
                        packedIndices: packedIndices
                    };
                }
            }
        }

        if (!bestSheet) {
            console.error("Part too big for any sheet", remainingParts[0]);
            return null;
        }

        sheetsUsed.push({
            material: bestSheet.material,
            packer: bestSheet.packer,
            parts: bestSheet.parts
        });

        for (let i = bestSheet.packedIndices.length - 1; i >= 0; i--) {
            remainingParts.splice(bestSheet.packedIndices[i], 1);
        }
    }

    let totalCost = 0;
    let totalArea = 0;
    let totalSheetsCount = sheetsUsed.length;
    
    sheetsUsed.forEach(s => {
        totalCost += s.material.price;
        totalArea += (s.material.width * s.material.height);
    });

    const usedArea = parts.reduce((sum, p) => sum + (p.w * p.h), 0);
    const wastePercent = ((totalArea - usedArea) / totalArea) * 100;

    return {
        isMixed: true,
        sheets: sheetsUsed,
        totalSheets: totalSheetsCount,
        totalCost,
        wastePercent,
        usedArea,
        totalArea
    };
}

function renderOptimizationResults(result, isMica = false) {
    let matCounts = {};
    result.sheets.forEach(s => {
        let key = `${s.material.brand ? s.material.brand + ' - ' : ''}${s.material.name} [${(s.material.width/12).toFixed(1)}ft x ${(s.material.height/12).toFixed(1)}ft]`;
        matCounts[key] = (matCounts[key] || 0) + 1;
    });
    
    let displayStr = `<ul style="list-style-position: inside; margin: 0; padding: 0; text-align: right; font-size: 1.1rem; font-weight: 500; color: var(--text-main); line-height: 1.4;">` + 
        Object.keys(matCounts).map(k => `<li style="margin-bottom: 0.3rem;"><strong style="color: ${isMica ? '#3b82f6' : 'var(--accent)'};">${matCounts[k]}x</strong> ${k}</li>`).join('') + 
        `</ul>`;

    if (!isMica) {
        document.getElementById('plywood-header').classList.remove('hidden');
        document.getElementById('optimization-results').classList.remove('hidden');
        document.getElementById('res-mat-used').innerHTML = displayStr;
        document.getElementById('res-sheets').textContent = result.totalSheets;
        document.getElementById('res-cost').textContent = `${currentCurrency}${result.totalCost.toFixed(2)}`;
        document.getElementById('res-waste').textContent = `${result.wastePercent.toFixed(1)}%`;
        cutLayoutsContainer.innerHTML = '';
    } else {
        document.getElementById('mica-header').classList.remove('hidden');
        document.getElementById('mica-optimization-results').classList.remove('hidden');
        document.getElementById('res-mica-used').innerHTML = displayStr;
        document.getElementById('res-mica-sheets').textContent = result.totalSheets;
        document.getElementById('res-mica-cost').textContent = `${currentCurrency}${result.totalCost.toFixed(2)}`;
        document.getElementById('res-mica-waste').textContent = `${result.wastePercent.toFixed(1)}%`;
    }
    
    result.sheets.forEach((sheet, index) => {
        const mat = sheet.material;
        const maxRenderWidth = 600;
        const scale = maxRenderWidth / mat.width;
        const renderHeight = mat.height * scale;

        const wrapper = document.createElement('div');
        wrapper.className = 'sheet-wrapper';

        const title = document.createElement('h4');
        title.className = 'sheet-title';
        title.textContent = `Sheet ${index + 1} - ${mat.brand ? mat.brand + ' ' : ''}${mat.name} (${mat.width}" x ${mat.height}" / ${(mat.width/12).toFixed(1)}ft x ${(mat.height/12).toFixed(1)}ft)`;
        wrapper.appendChild(title);

        const container = document.createElement('div');
        container.className = 'sheet-container';
        container.style.width = `${maxRenderWidth}px`;
        container.style.height = `${renderHeight}px`;

        // Render Waste Areas
        const wasteRects = getNonOverlappingWaste(mat.width, mat.height, sheet.parts);
        wasteRects.forEach(wr => {
            const wPanel = document.createElement('div');
            wPanel.style.position = 'absolute';
            wPanel.style.left = `${wr.x * scale}px`;
            wPanel.style.top = `${wr.y * scale}px`;
            wPanel.style.width = `${wr.w * scale}px`;
            wPanel.style.height = `${wr.h * scale}px`;
            wPanel.style.background = '#374151'; 
            wPanel.style.border = '1px solid #4b5563'; 
            wPanel.style.display = 'flex';
            wPanel.style.alignItems = 'center';
            wPanel.style.justifyContent = 'center';
            wPanel.style.color = '#9ca3af';
            wPanel.style.fontSize = '0.7rem';
            wPanel.style.fontWeight = '500';
            wPanel.style.textAlign = 'center';
            wPanel.style.boxSizing = 'border-box';
            wPanel.style.overflow = 'hidden';
            wPanel.style.lineHeight = '1.1';
            
            const boxW = wr.w * scale;
            const boxH = wr.h * scale;

            // Try to always show dimensions. Pick layout based on aspect ratio
            if (boxW > 50 && boxH > 28) {
                // Room for two lines + "Waste"
                wPanel.innerHTML = `Waste<br>${wr.w.toFixed(1)}"x${wr.h.toFixed(1)}"`;
            } else if (boxW > 60 && boxH > 12) {
                // Wide but short (Horizontal strip)
                wPanel.innerHTML = `${wr.w.toFixed(1)}"x${wr.h.toFixed(1)}"`;
            } else if (boxW > 20 && boxH > 22) {
                // Tall but narrow (Vertical strip)
                wPanel.innerHTML = `${wr.w.toFixed(1)}"x<br>${wr.h.toFixed(1)}"`; 
            }
            container.appendChild(wPanel);
        });

        sheet.parts.forEach(part => {
            const panel = document.createElement('div');
            panel.className = 'sheet-panel';
            panel.style.left = `${part.x * scale}px`;
            panel.style.top = `${part.y * scale}px`;
            panel.style.width = `${part.w * scale}px`;
            panel.style.height = `${part.h * scale}px`;
            
            // Only show text if panel is big enough
            if (part.w * scale > 40 && part.h * scale > 20) {
                panel.innerHTML = `${part.label}<br>${part.w.toFixed(1)}x${part.h.toFixed(1)}`;
            }
            
            container.appendChild(panel);
        });

        wrapper.appendChild(container);
        cutLayoutsContainer.appendChild(wrapper);
    });
}

// Global optimization runner so it can be called from 3D Builder
window.runGlobalOptimization = function(parts, micaParts, selectedMat, selectedLinerMat) {
    const errorDiv = document.getElementById('designer-error');
    const optError = document.getElementById('opt-tab-error');
    
    try {
        const candidates = materials.filter(m => m.thickness === selectedMat.thickness);
        let bestResult = null;
        let failReason = "No materials match this thickness.";

        if (candidates.length > 0) {
            failReason = "The cabinet parts are larger than all your available material sheets. Please check the Materials tab and make sure you entered 'ft' instead of 'in' for your sheet size.";
            bestResult = optimizeMultipleMaterials(parts, candidates);
            if (bestResult && isNaN(bestResult.totalCost)) {
                failReason = "Material cost calculation failed (invalid price).";
                bestResult = null;
            }
        }

        if (bestResult) {
            if (errorDiv) errorDiv.classList.add('hidden');
            if (optError) optError.classList.add('hidden');
            
            try {
                // Clear any previous headers
                document.getElementById('plywood-header').classList.add('hidden');
                document.getElementById('mica-header').classList.add('hidden');
                document.getElementById('mica-optimization-results').classList.add('hidden');

                renderOptimizationResults(bestResult, false);

                // Run Mica Optimization if selected
                if (selectedLinerMat && micaParts && micaParts.length > 0) {
                    const linerCandidates = materials.filter(m => m.thickness === selectedLinerMat.thickness);
                    
                    let micaResult = null;
                    if (linerCandidates.length > 0) {
                        micaResult = optimizeMultipleMaterials(micaParts, linerCandidates);
                    }
                    
                    if (micaResult) {
                        const separator = document.createElement('h2');
                        separator.textContent = "Inner Liner (Mica) Cut Layout";
                        separator.style.marginTop = "3rem";
                        separator.style.marginBottom = "1.5rem";
                        separator.style.color = "#3b82f6";
                        separator.style.borderBottom = "2px solid #3b82f6";
                        separator.style.paddingBottom = "0.5rem";
                        separator.style.width = "100%";
                        separator.style.flexBasis = "100%";
                        separator.style.textAlign = "center";
                        cutLayoutsContainer.appendChild(separator);

                        renderOptimizationResults(micaResult, true);
                    }
                }
            } catch(e) {
                failReason = "Error rendering results: " + e.message;
                bestResult = null;
            }
        } 
        
        const emptyState = document.getElementById('opt-empty-state');
        if (emptyState) emptyState.classList.add('hidden');

        if (!bestResult) {
            if (errorDiv) {
                errorDiv.innerHTML = `<strong>Optimization Failed:</strong> ${failReason}`;
                errorDiv.classList.remove('hidden');
            }
            if (optError) {
                optError.innerHTML = `<strong>Optimization Failed:</strong> ${failReason}`;
                optError.classList.remove('hidden');
            }
            document.getElementById('optimization-results').classList.add('hidden');
            cutLayoutsContainer.classList.add('hidden');
        } else {
            document.getElementById('optimization-results').classList.remove('hidden');
            cutLayoutsContainer.classList.remove('hidden');
        }
    } catch (crashError) {
        console.error("FATAL CRASH:", crashError);
    }
};

updateMaterialUI();
