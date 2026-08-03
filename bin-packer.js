class BinPacker {
  constructor(binWidth, binHeight, kerf = 3) {
    this.binWidth = binWidth;
    this.binHeight = binHeight;
    this.kerf = kerf;
    this.freeRects = [{ x: 0, y: 0, w: binWidth, h: binHeight }];
    this.usedRects = [];
  }

  insert(w, h, label, allowRotation = true) {
    let bestNode = this.findPositionForNewNode(w, h, label, allowRotation);
    if (!bestNode) return null;
    
    let numRectanglesToProcess = this.freeRects.length;
    for (let i = 0; i < numRectanglesToProcess; ++i) {
      if (this.splitFreeNode(this.freeRects[i], bestNode.rect)) {
        this.freeRects.splice(i, 1);
        --i;
        --numRectanglesToProcess;
      }
    }
    
    this.cleanUpFreeRects();
    this.usedRects.push(bestNode.rect);
    return bestNode.rect;
  }

  findPositionForNewNode(w, h, label, allowRotation) {
    let bestScore = Infinity;
    let bestNode = null;

    for (let i = 0; i < this.freeRects.length; i++) {
      let fr = this.freeRects[i];
      // Try normal orientation
      if (fr.w >= w && fr.h >= h) {
        let score = (fr.w - w) * (fr.h - h);
        if (score < bestScore) {
          bestScore = score;
          bestNode = { freeRect: fr, rect: { x: fr.x, y: fr.y, w: w, h: h, label: label, rotated: false } };
        }
      }
      // Try rotated orientation
      if (allowRotation && fr.w >= h && fr.h >= w) {
        let score = (fr.w - h) * (fr.h - w);
        if (score < bestScore) {
          bestScore = score;
          bestNode = { freeRect: fr, rect: { x: fr.x, y: fr.y, w: h, h: w, label: label, rotated: true } };
        }
      }
    }
    return bestNode;
  }

  splitFreeNode(freeNode, usedNode) {
    // Add kerf to usedNode for splitting calculation
    const uX = usedNode.x;
    const uY = usedNode.y;
    const uW = usedNode.w + this.kerf;
    const uH = usedNode.h + this.kerf;

    // Check if freeNode intersects with usedNode (including kerf)
    if (uX >= freeNode.x + freeNode.w || uX + uW <= freeNode.x ||
        uY >= freeNode.y + freeNode.h || uY + uH <= freeNode.y) {
      return false; // No intersection
    }

    // Split horizontally (top and bottom)
    if (uY > freeNode.y && uY < freeNode.y + freeNode.h) {
      let newNode = { ...freeNode };
      newNode.h = uY - freeNode.y;
      this.freeRects.push(newNode);
    }
    if (uY + uH < freeNode.y + freeNode.h) {
      let newNode = { ...freeNode };
      newNode.y = uY + uH;
      newNode.h = freeNode.y + freeNode.h - (uY + uH);
      this.freeRects.push(newNode);
    }
    
    // Split vertically (left and right)
    if (uX > freeNode.x && uX < freeNode.x + freeNode.w) {
      let newNode = { ...freeNode };
      newNode.w = uX - freeNode.x;
      this.freeRects.push(newNode);
    }
    if (uX + uW < freeNode.x + freeNode.w) {
      let newNode = { ...freeNode };
      newNode.x = uX + uW;
      newNode.w = freeNode.x + freeNode.w - (uX + uW);
      this.freeRects.push(newNode);
    }

    return true; // Node was split
  }

  cleanUpFreeRects() {
    // Remove free rects that are completely contained within others
    for (let i = 0; i < this.freeRects.length; i++) {
      for (let j = i + 1; j < this.freeRects.length; j++) {
        let r1 = this.freeRects[i];
        let r2 = this.freeRects[j];
        if (this.isContained(r1, r2)) {
          this.freeRects.splice(i, 1);
          i--;
          break;
        }
        if (this.isContained(r2, r1)) {
          this.freeRects.splice(j, 1);
          j--;
        }
      }
    }
  }

  isContained(r1, r2) {
    return r1.x >= r2.x && r1.y >= r2.y && 
           r1.x + r1.w <= r2.x + r2.w && r1.y + r1.h <= r2.y + r2.h;
  }
}
