// Camera class for controlling viewpoint
var Camera = function() {
    this.x = 0.0;
    this.y = 0.0;
    this.z = 0.0;
    
    // Look at point
    this.lx = 0.0;
    this.ly = 0.0;
    this.lz = -1.0;
    
    // Up direction
    this.upX = 0.0;
    this.upY = 1.0;
    this.upZ = 0.0;
    
    // Orientation angles
    this.yaw = -Math.PI / 2;   // Initially looking along negative z-axis
    this.pitch = 0.0;
    
    // Mouse control properties
    this.isDragging = false;
    this.lastMouseX = 0;
    this.lastMouseY = 0;
    this.mouseSensitivity = 0.005;
    this.zoomSensitivity = 0.1;
    this.minDistance = 1.0;    // Minimum zoom distance
    this.maxDistance = 100.0;  // Maximum zoom distance
    
    // Initialize mouse controls
    this.initMouseControls();
};

// Set the camera position
Camera.prototype.setPosition = function(x, y, z) {
    this.x = x;
    this.y = y;
    this.z = z;
    this.updateLookAt();
};

// Update the look-at point based on orientation
Camera.prototype.updateLookAt = function() {
    this.lx = this.x + Math.cos(this.yaw) * Math.cos(this.pitch);
    this.ly = this.y + Math.sin(this.pitch);
    this.lz = this.z + Math.sin(this.yaw) * Math.cos(this.pitch);
};

// Move the camera forward/backward
Camera.prototype.moveForward = function(distance) {
    var dx = Math.cos(this.yaw) * Math.cos(this.pitch) * distance;
    var dy = Math.sin(this.pitch) * distance;
    var dz = Math.sin(this.yaw) * Math.cos(this.pitch) * distance;
    
    this.x += dx;
    this.y += dy;
    this.z += dz;
    
    this.updateLookAt();
};

// Move the camera right/left
Camera.prototype.moveRight = function(distance) {
    // Right vector is perpendicular to forward vector
    var dx = Math.cos(this.yaw + Math.PI/2) * distance;
    var dz = Math.sin(this.yaw + Math.PI/2) * distance;
    
    this.x += dx;
    this.z += dz;
    
    this.updateLookAt();
};

// Move the camera up/down
Camera.prototype.moveUp = function(distance) {
    this.y += distance;
    this.updateLookAt();
};

// Turn left/right (adjust yaw)
Camera.prototype.turnLeft = function(angle) {
    this.yaw += angle;
    this.updateLookAt();
};

// Look up/down (adjust pitch)
Camera.prototype.lookUp = function(angle) {
    this.pitch += angle;
    
    // Limit pitch to prevent camera flipping
    if (this.pitch > Math.PI/2 - 0.1) {
        this.pitch = Math.PI/2 - 0.1;
    }
    if (this.pitch < -Math.PI/2 + 0.1) {
        this.pitch = -Math.PI/2 + 0.1;
    }
    
    this.updateLookAt();
};

// Initialize mouse control event listeners
Camera.prototype.initMouseControls = function() {
    var self = this;
    var canvas = document.getElementById('webgl'); // Using your canvas ID
    
    if (!canvas) {
        console.error('Canvas element not found');
        return;
    }
    
    // Mouse down event - start dragging
    canvas.addEventListener('mousedown', function(event) {
        self.isDragging = true;
        self.lastMouseX = event.clientX;
        self.lastMouseY = event.clientY;
    });
    
    // Mouse up event - stop dragging
    document.addEventListener('mouseup', function(event) {
        self.isDragging = false;
    });
    
    // Mouse move event - rotate camera if dragging
    document.addEventListener('mousemove', function(event) {
        if (!self.isDragging) return;
        
        var deltaX = event.clientX - self.lastMouseX;
        var deltaY = event.clientY - self.lastMouseY;
        
        self.turnLeft(deltaX * self.mouseSensitivity);
        self.lookUp(-deltaY * self.mouseSensitivity);
        
        self.lastMouseX = event.clientX;
        self.lastMouseY = event.clientY;
    });
    
    // Mouse wheel event - zoom in/out
    canvas.addEventListener('wheel', function(event) {
        event.preventDefault();
        
        // Determine zoom direction and amount
        var zoomAmount = (event.deltaY > 0 ? 1 : -1) * self.zoomSensitivity;
        
        // Get current distance from camera to look-at point
        var dx = self.lx - self.x;
        var dy = self.ly - self.y;
        var dz = self.lz - self.z;
        var currentDistance = Math.sqrt(dx*dx + dy*dy + dz*dz);
        
        // Calculate new distance after zoom
        var newDistance = currentDistance * (1 + zoomAmount);
        
        // Clamp to min/max zoom distance
        newDistance = Math.max(self.minDistance, Math.min(self.maxDistance, newDistance));
        
        // Calculate zoom factor
        var zoomFactor = newDistance / currentDistance;
        
        // Move camera towards/away from look-at point
        // We first calculate vector from look-at to camera
        var vx = self.x - self.lx;
        var vy = self.y - self.ly;
        var vz = self.z - self.lz;
        
        // Scale this vector by the zoom factor
        self.x = self.lx + vx * zoomFactor;
        self.y = self.ly + vy * zoomFactor;
        self.z = self.lz + vz * zoomFactor;
        
        self.updateLookAt();
    });
};

// Apply the camera to the view matrix - call this before rendering
Camera.prototype.apply = function(gl, viewMatrix) {
    viewMatrix.setLookAt(
        this.x, this.y, this.z,           // Camera position
        this.lx, this.ly, this.lz,        // Look-at point
        this.upX, this.upY, this.upZ      // Up vector
    );
    
    return viewMatrix;
};