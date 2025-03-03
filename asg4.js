// Vertex shader program
var VSHADER_SOURCE = `
    attribute vec4 a_Position;
    attribute vec4 a_Color;
    attribute vec4 a_Normal;
    attribute vec2 a_TexCoord;
    
    uniform mat4 u_ModelMatrix;
    uniform mat4 u_ViewMatrix;
    uniform mat4 u_ProjMatrix;
    uniform mat4 u_NormalMatrix;
    uniform vec3 u_LightPosition;
    uniform vec3 u_SpotLightPosition;
    uniform vec3 u_SpotLightDirection;
    uniform bool u_NormalVisualization;
    
    varying vec4 v_Color;
    varying vec2 v_TexCoord;
    varying vec3 v_Normal;
    varying vec3 v_Position;
    varying vec3 v_LightDirection;
    varying vec3 v_SpotLightDirection;
    varying vec3 v_SpotLightToVertex;
    
    void main() {
        // Calculate world position of vertex
        vec4 worldPosition = u_ModelMatrix * a_Position;
        
        // Transform normal to world space
        v_Normal = normalize(vec3(u_NormalMatrix * a_Normal));
        
        // Calculate light direction (from vertex to light)
        v_LightDirection = normalize(u_LightPosition - vec3(worldPosition));
        
        // Calculate spotlight direction
        v_SpotLightToVertex = normalize(u_SpotLightPosition - vec3(worldPosition));
        v_SpotLightDirection = normalize(u_SpotLightDirection);
        
        // Save vertex position for fragment shader
        v_Position = vec3(worldPosition);
        
        // Pass texture coordinates
        v_TexCoord = a_TexCoord;
        
        // Set color based on normal visualization toggle
        if(u_NormalVisualization) {
            v_Color = vec4((v_Normal + 1.0) / 2.0, 1.0); // Normalize to 0-1 range
        } else {
            v_Color = a_Color;
        }
        
        // Calculate final position
        gl_Position = u_ProjMatrix * u_ViewMatrix * worldPosition;
    }
`;

// Fragment shader program
var FSHADER_SOURCE = `
    precision mediump float;
    
    uniform vec3 u_LightColor;
    uniform vec3 u_SpotLightColor;
    uniform bool u_LightingOn;
    uniform bool u_SpotLightOn;
    uniform sampler2D u_Sampler;
    uniform bool u_UseTexture;
    uniform bool u_NormalVisualization;
    
    varying vec4 v_Color;
    varying vec2 v_TexCoord;
    varying vec3 v_Normal;
    varying vec3 v_Position;
    varying vec3 v_LightDirection;
    varying vec3 v_SpotLightDirection;
    varying vec3 v_SpotLightToVertex;
    
    void main() {
        // Set base color
        vec4 baseColor;
        if(u_UseTexture) {
            baseColor = texture2D(u_Sampler, v_TexCoord);
        } else {
            baseColor = v_Color;
        }
        
        // If normal visualization is on, just show the normals
        if(u_NormalVisualization) {
            gl_FragColor = v_Color;
            return;
        }
        
        // If lighting is off, just show the base color
        if(!u_LightingOn) {
            gl_FragColor = baseColor;
            return;
        }
        
        // Normalize vectors
        vec3 normal = normalize(v_Normal);
        vec3 lightDir = normalize(v_LightDirection);
        
        // Ambient component
        float ambientStrength = 0.2;
        vec3 ambient = ambientStrength * u_LightColor;
        
        // Diffuse 
        float diff = max(dot(normal, lightDir), 0.0);
        vec3 diffuse = diff * u_LightColor;
        
        // Specular component
        float specularStrength = 0.5;
        vec3 viewDir = normalize(-v_Position);
        vec3 reflectDir = reflect(-lightDir, normal);
        float spec = pow(max(dot(viewDir, reflectDir), 0.0), 32.0);
        vec3 specular = specularStrength * spec * u_LightColor;
        
        // Combined point light contribution
        vec3 pointLightResult = ambient + diffuse + specular;
        
        // Spotlight (if enabled)
        vec3 spotlightResult = vec3(0.0, 0.0, 0.0);
        
        if(u_SpotLightOn) {
            float theta = dot(normalize(v_SpotLightToVertex), -v_SpotLightDirection);
            float cutOff = cos(radians(20.0)); 
            
            if(theta > cutOff) {
                // Spotlight ambient
                float spotIntensity = 2.0; // Increase this value for a brighter spotlight

                // Spotlight ambient (increase ambient lighting)
                vec3 spotAmbient = (ambientStrength * 2.0) * u_SpotLightColor; 

                // Spotlight diffuse (increase diffuse brightness)
                float spotDiff = max(dot(normal, normalize(v_SpotLightToVertex)), 0.0);
                vec3 spotDiffuse = (spotDiff * spotIntensity) * u_SpotLightColor;

                // Spotlight specular (increase specular reflection)
                vec3 spotReflectDir = reflect(-normalize(v_SpotLightToVertex), normal);
                float spotSpec = pow(max(dot(viewDir, spotReflectDir), 0.0), 64.0); // Sharper specular highlight
                vec3 spotSpecular = (specularStrength * 3.0 * spotSpec) * u_SpotLightColor;
                
                // Spotlight intensity based on distance from center
                float epsilon = 0.2; // Softer falloff
                float intensity = clamp((theta - cutOff) / epsilon, 0.0, 1.5);
                
                spotlightResult = (spotAmbient + spotDiffuse + spotSpecular) * intensity;
            }
        }
        
        // Modified: Choose spotlight OR point light, not both
        vec3 lighting = u_SpotLightOn ? spotlightResult : pointLightResult;

        
        // Final color
        if (u_SpotLightOn && length(spotlightResult) < 0.01) {
            gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0); // Full black if outside spotlight
        } else {
            gl_FragColor = vec4(lighting * vec3(baseColor), baseColor.a);
        }
    }
`;
// Global variables
var gl;
var canvas;
var camera;
var lightPosition = [0.0, 5.0, 5.0];
var lightColor = [1.0, 1.0, 1.0]; // White light
var spotLightPosition = [5.0, 5.0, 0.0];
var spotLightDirection = [0.0, -1.0, 0.0]; // Pointing down
var spotLightColor = [1.0, 1.0, 0.0];  
var normalVisualization = false;
var lightingOn = true;
var spotLightOn = false;
var lightAngle = 0;
var manualLightControl = false; // Flag for manual light position control
var animationId;
var shapes = []; // Will store our objects
var g_seconds = 0; // For animation
var g_CharHoverLocation = 0; // For caterpillar position
var u_Sampler; // For the sky texture
var groundTexture; // For ground texture
var mouseX = 0;
var mouseY = 0;
var caterpillarTargetX = -3; // Initial X position of caterpillar
var caterpillarTargetZ = 5;  // Initial Z position of caterpillar
var caterpillarX = -3;       // Current X position
var caterpillarZ = 5;        // Current Z position
var caterpillarMoveSpeed = 0.05; // Speed of caterpillar movement
var butterflyX = 3;
var butterflyY = 2;
var butterflyZ = -3;
var butterflyWingAngle = 0;
var butterflyPathAngle = 0;



// Create background plane for the sky
// Create background plane for the sky
function createSkyPlane() {
    var size = 50.0;
    var vertices = [
        // Original back sky plane
        -size, -size, -size,
         size, -size, -size,
         size,  size, -size,
        -size,  size, -size,
        
        // Left side
        -size, -size, size,
        -size,  size, size,
        -size,  size, -size,
        -size, -size, -size,
        
        // Right side
         size, -size, -size,
         size, -size, size,
         size,  size, size,
         size,  size, -size,
        
        // Front side
        -size, -size, size,
         size, -size, size,
         size,  size, size,
        -size,  size, size
    ];
    
    var texCoords = [
        // Back
        0.0, 0.0,  1.0, 0.0,  1.0, 1.0,  0.0, 1.0,
        // Left
        0.0, 0.0,  1.0, 0.0,  1.0, 1.0,  0.0, 1.0,
        // Right
        0.0, 0.0,  1.0, 0.0,  1.0, 1.0,  0.0, 1.0,
        // Front
        0.0, 0.0,  1.0, 0.0,  1.0, 1.0,  0.0, 1.0
    ];
    
    var indices = [
        0, 1, 2,  0, 2, 3,   // Back
        4, 5, 6,  4, 6, 7,   // Left
        8, 9, 10, 8, 10, 11, // Right
        12, 13, 14, 12, 14, 15 // Front
    ];
    
    var skyPlane = {
        vertices: vertices,
        texCoords: texCoords,
        indices: indices,
        useTexture: true,
        render: function(gl) {
            var FSIZE = Float32Array.BYTES_PER_ELEMENT;
            
            var vertexBuffer = gl.createBuffer();
            gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);
            gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(this.vertices), gl.STATIC_DRAW);
            var a_Position = gl.getAttribLocation(gl.program, 'a_Position');
            gl.vertexAttribPointer(a_Position, 3, gl.FLOAT, false, 0, 0);
            gl.enableVertexAttribArray(a_Position);
            
            var texCoordBuffer = gl.createBuffer();
            gl.bindBuffer(gl.ARRAY_BUFFER, texCoordBuffer);
            gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(this.texCoords), gl.STATIC_DRAW);
            var a_TexCoord = gl.getAttribLocation(gl.program, 'a_TexCoord');
            gl.vertexAttribPointer(a_TexCoord, 2, gl.FLOAT, false, 0, 0);
            gl.enableVertexAttribArray(a_TexCoord);
            
            var indexBuffer = gl.createBuffer();
            gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
            gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(this.indices), gl.STATIC_DRAW);
            
            gl.uniform1i(gl.getUniformLocation(gl.program, 'u_UseTexture'), true);
            gl.drawElements(gl.TRIANGLES, this.indices.length, gl.UNSIGNED_SHORT, 0);
            gl.uniform1i(gl.getUniformLocation(gl.program, 'u_UseTexture'), false);
        }
    };
    return skyPlane;
}

// Create ground plane function
function createGroundPlane() {
    // Create a large quad for the ground
    var vertices = [
        -20.0, -0.5, -20.0,
         20.0, -0.5, -20.0,
         20.0, -0.5,  20.0,
        -20.0, -0.5,  20.0
    ];
    
    var normals = [
        0.0, 1.0, 0.0,
        0.0, 1.0, 0.0,
        0.0, 1.0, 0.0,
        0.0, 1.0, 0.0
    ];
    
    var texCoords = [
        0.0, 0.0,
        5.0, 0.0, // Repeat texture multiple times
        5.0, 5.0,
        0.0, 5.0
    ];
    
    var indices = [0, 1, 2, 0, 2, 3];
    
    // Create ground plane object
    var groundPlane = {
        vertices: vertices,
        normals: normals,
        texCoords: texCoords,
        indices: indices,
        color: [0.4, 0.8, 0.4, 1.0], // Green color for ground
        useTexture: false, // Can be set to true if we add a ground texture
        render: function(gl) {
            var FSIZE = Float32Array.BYTES_PER_ELEMENT;
            
            // Create vertex buffer
            var vertexBuffer = gl.createBuffer();
            gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);
            gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(this.vertices), gl.STATIC_DRAW);
            var a_Position = gl.getAttribLocation(gl.program, 'a_Position');
            gl.vertexAttribPointer(a_Position, 3, gl.FLOAT, false, 0, 0);
            gl.enableVertexAttribArray(a_Position);
            
            // Create normal buffer
            var normalBuffer = gl.createBuffer();
            gl.bindBuffer(gl.ARRAY_BUFFER, normalBuffer);
            gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(this.normals), gl.STATIC_DRAW);
            var a_Normal = gl.getAttribLocation(gl.program, 'a_Normal');
            gl.vertexAttribPointer(a_Normal, 3, gl.FLOAT, false, 0, 0);
            gl.enableVertexAttribArray(a_Normal);
            
            // Create texture coordinate buffer
            var texCoordBuffer = gl.createBuffer();
            gl.bindBuffer(gl.ARRAY_BUFFER, texCoordBuffer);
            gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(this.texCoords), gl.STATIC_DRAW);
            var a_TexCoord = gl.getAttribLocation(gl.program, 'a_TexCoord');
            gl.vertexAttribPointer(a_TexCoord, 2, gl.FLOAT, false, 0, 0);
            gl.enableVertexAttribArray(a_TexCoord);
            
            // Create color buffer
            var colors = [];
            for (var i = 0; i < this.vertices.length / 3; i++) {
                colors.push(this.color[0]);  // R
                colors.push(this.color[1]);  // G
                colors.push(this.color[2]);  // B
                colors.push(this.color[3]);  // A
            }
            var colorBuffer = gl.createBuffer();
            gl.bindBuffer(gl.ARRAY_BUFFER, colorBuffer);
            gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(colors), gl.STATIC_DRAW);
            var a_Color = gl.getAttribLocation(gl.program, 'a_Color');
            gl.vertexAttribPointer(a_Color, 4, gl.FLOAT, false, 0, 0);
            gl.enableVertexAttribArray(a_Color);
            
            // Create index buffer
            var indexBuffer = gl.createBuffer();
            gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
            gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(this.indices), gl.STATIC_DRAW);
            
            // Disable texturing for the ground (using color)
            gl.uniform1i(gl.getUniformLocation(gl.program, 'u_UseTexture'), false);
            
            // Draw the ground plane
            gl.drawElements(gl.TRIANGLES, this.indices.length, gl.UNSIGNED_SHORT, 0);
        }
    };
    
    return groundPlane;
}
function setupMouseTracking(canvas) {
    // Track mouse movement over the canvas
    canvas.addEventListener('mousemove', function(event) {
        // Get canvas position
        var rect = canvas.getBoundingClientRect();
        
        // Calculate normalized device coordinates from -1 to 1
        var x = ((event.clientX - rect.left) / canvas.width) * 2 - 1;
        var y = -((event.clientY - rect.top) / canvas.height) * 2 + 1;
        
        // Store the mouse position
        mouseX = x;
        mouseY = y;
        
        // Convert to world coordinates (approximate)
        // The conversion depends on your camera and projection setup
        // This is a simple approximation
        var worldX = x * 10; // Scale based on scene size
        var worldZ = -y * 10; // Invert Y to match WebGL Z coordinate
        
        // Set the target position for the caterpillar
        caterpillarTargetX = worldX;
        caterpillarTargetZ = worldZ;
    });
}


function main() {
    // Get canvas and WebGL context
    canvas = document.getElementById('webgl');
    gl = getWebGLContext(canvas);
    if (!gl) {
        console.log('Failed to get the rendering context for WebGL');
        return;
    }
    
    // Initialize shaders
    if (!initShaders(gl, VSHADER_SOURCE, FSHADER_SOURCE)) {
        console.log('Failed to initialize shaders.');
        return;
    }
    
    // Set up camera
    camera = new Camera();
    camera.setPosition(0, 3, 10);
    
    // Initialize buffers and textures
    var n = initVertexBuffers(gl);
    if (n < 0) {
        console.log('Failed to set the vertex information');
        return;
    }
    
    // Set the clear color for background (will be overlaid by sky)
    gl.clearColor(0.0, 0.0, 0.0, 1.0);
    gl.enable(gl.DEPTH_TEST);
    
    // Get the storage locations of uniform variables
    var u_ModelMatrix = gl.getUniformLocation(gl.program, 'u_ModelMatrix');
    var u_ViewMatrix = gl.getUniformLocation(gl.program, 'u_ViewMatrix');
    var u_ProjMatrix = gl.getUniformLocation(gl.program, 'u_ProjMatrix');
    var u_NormalMatrix = gl.getUniformLocation(gl.program, 'u_NormalMatrix');
    var u_LightPosition = gl.getUniformLocation(gl.program, 'u_LightPosition');
    var u_LightColor = gl.getUniformLocation(gl.program, 'u_LightColor');
    var u_SpotLightPosition = gl.getUniformLocation(gl.program, 'u_SpotLightPosition');
    var u_SpotLightDirection = gl.getUniformLocation(gl.program, 'u_SpotLightDirection');
    var u_SpotLightColor = gl.getUniformLocation(gl.program, 'u_SpotLightColor');
    var u_LightingOn = gl.getUniformLocation(gl.program, 'u_LightingOn');
    var u_SpotLightOn = gl.getUniformLocation(gl.program, 'u_SpotLightOn');
    var u_NormalVisualization = gl.getUniformLocation(gl.program, 'u_NormalVisualization');
    var u_UseTexture = gl.getUniformLocation(gl.program, 'u_UseTexture');
    u_Sampler = gl.getUniformLocation(gl.program, 'u_Sampler');
    
    // Set initial uniform values - use uniform1i for booleans
    gl.uniform3fv(u_LightPosition, lightPosition);
    gl.uniform3fv(u_LightColor, lightColor);
    gl.uniform3fv(u_SpotLightPosition, spotLightPosition);
    gl.uniform3fv(u_SpotLightDirection, spotLightDirection);
    gl.uniform3fv(u_SpotLightColor, spotLightColor);
    gl.uniform1i(u_LightingOn, lightingOn ? 1 : 0);  // Convert boolean to int
    gl.uniform1i(u_SpotLightOn, spotLightOn ? 1 : 0); // Convert boolean to int
    gl.uniform1i(u_NormalVisualization, normalVisualization ? 1 : 0);
    gl.uniform1i(u_UseTexture, 0); // false as int
    
    // Set up projection matrix (doesn't change)
    var projMatrix = new Matrix4();
    projMatrix.setPerspective(45, canvas.width/canvas.height, 1, 100);
    gl.uniformMatrix4fv(u_ProjMatrix, false, projMatrix.elements);
    
    // Set the event handlers for keyboard input
    document.onkeydown = function(ev) { keydown(ev, gl, u_ModelMatrix, u_ViewMatrix, u_NormalMatrix); };
    
    // Set up UI controls
    setupUI(gl, u_ModelMatrix, u_ViewMatrix, u_NormalMatrix);
    
    // Set up mouse tracking
    setupMouseTracking(canvas);
    
    // Start animation
    tick(gl, u_ModelMatrix, u_ViewMatrix, u_NormalMatrix, u_LightPosition);
    
    // Animation function
    function tick(gl, u_ModelMatrix, u_ViewMatrix, u_NormalMatrix, u_LightPosition) {
        // Update animation time
        g_seconds += 0.01;
        
        // Only update light position automatically if not in manual control mode
        if (lightingOn && !manualLightControl) {
            lightAngle += 0.01;
            lightPosition[0] = 5.0 * Math.cos(lightAngle);
            lightPosition[2] = 5.0 * Math.sin(lightAngle);
            gl.uniform3fv(u_LightPosition, lightPosition);
            
            // Update slider position if it exists
            var lightPosSlider = document.getElementById('lightPosSlider');
            if (lightPosSlider) {
                // Convert radians to degrees for slider
                lightPosSlider.value = (lightAngle * 180 / Math.PI) % 360;
            }
        }
        
        // Update caterpillar position
        updateCaterpillarPosition();
        
        // Draw the scene
        drawScene(gl, u_ModelMatrix, u_ViewMatrix, u_NormalMatrix);
        
        // Request the next frame
        animationId = requestAnimationFrame(function() {
            tick(gl, u_ModelMatrix, u_ViewMatrix, u_NormalMatrix, u_LightPosition);
        });
    }
}
function updateCaterpillarPosition() {
    // Smoothly interpolate current position toward target position
    caterpillarX += (caterpillarTargetX - caterpillarX) * caterpillarMoveSpeed;
    caterpillarZ += (caterpillarTargetZ - caterpillarZ) * caterpillarMoveSpeed;
    
    // Calculate the direction of movement for rotation
    var dx = caterpillarTargetX - caterpillarX;
    var dz = caterpillarTargetZ - caterpillarZ;
    
    // Add a small hover effect based on speed
    var speed = Math.sqrt(dx*dx + dz*dz);
    g_CharHoverLocation = Math.sin(g_seconds * 2) * 0.2 + 0.3; // Base hover + wave motion
}
// Caterpillar drawing function
function drawCaterpillar(gl, u_ModelMatrix, u_NormalMatrix) {
    var modelMatrix = new Matrix4();
    var normalMatrix = new Matrix4();

    // Calculate the angle between caterpillar and target
    var dx = caterpillarTargetX - caterpillarX;
    var dz = caterpillarTargetZ - caterpillarZ;
    var angle = Math.atan2(dz, dx);

    // Body segments
    for (let i = 0; i < 5; i++) {
        var segment = new Cube();
        segment.color = [0.5, 0.8, 0.5, 1.0]; // green color for caterpillar
        
        // Position segment with an offset from the head position
        // and add a wave-like motion along the body
        var segmentOffset = i * 1.2;
        var waveEffect = Math.sin(i + g_seconds) * 0.1;
        
        modelMatrix.setTranslate(
            caterpillarX - Math.cos(angle) * segmentOffset, 
            0 + g_CharHoverLocation + waveEffect, 
            caterpillarZ - Math.sin(angle) * segmentOffset
        );
        
        // Rotate the segment to face the movement direction
        modelMatrix.rotate(angle * (180/Math.PI), 0, 1, 0);
        
        // Add wiggle animation
        modelMatrix.rotate(Math.sin(i + g_seconds) * 10, 0, 1, 0);
        
        modelMatrix.scale(0.6, 0.6, 0.6); // Make the body smaller
        
        normalMatrix.setInverseOf(modelMatrix);
        normalMatrix.transpose();
        
        gl.uniformMatrix4fv(u_ModelMatrix, false, modelMatrix.elements);
        gl.uniformMatrix4fv(u_NormalMatrix, false, normalMatrix.elements);
        
        segment.render(gl);
    }

    // Head
    var head = new Cube();
    head.color = [0.6, 0.9, 0.6, 1.0]; // slightly lighter green for head
    
    modelMatrix.setTranslate(caterpillarX, 0 + g_CharHoverLocation, caterpillarZ);
    modelMatrix.rotate(angle * (180/Math.PI), 0, 1, 0); // Rotate to face movement direction
    modelMatrix.scale(1, 1, 1);
    
    normalMatrix.setInverseOf(modelMatrix);
    normalMatrix.transpose();
    
    gl.uniformMatrix4fv(u_ModelMatrix, false, modelMatrix.elements);
    gl.uniformMatrix4fv(u_NormalMatrix, false, normalMatrix.elements);
    
    head.render(gl);

    // Eyes (two small black cubes)
    var leftEye = new Cube();
    leftEye.color = [0, 0, 0, 1]; // Black color
    
    modelMatrix.setTranslate(caterpillarX, 0 + g_CharHoverLocation, caterpillarZ);
    modelMatrix.rotate(angle * (180/Math.PI), 0, 1, 0); // Rotate to face movement direction
    modelMatrix.translate(0.3, 0.5, 0.4); // Position relative to head
    modelMatrix.scale(0.15, 0.15, 0.15); // Reduced the size of the eyes
    
    normalMatrix.setInverseOf(modelMatrix);
    normalMatrix.transpose();
    
    gl.uniformMatrix4fv(u_ModelMatrix, false, modelMatrix.elements);
    gl.uniformMatrix4fv(u_NormalMatrix, false, normalMatrix.elements);
    
    leftEye.render(gl);

    var rightEye = new Cube();
    rightEye.color = [0, 0, 0, 1]; // Black color
    
    modelMatrix.setTranslate(caterpillarX, 0 + g_CharHoverLocation, caterpillarZ);
    modelMatrix.rotate(angle * (180/Math.PI), 0, 1, 0); // Rotate to face movement direction
    modelMatrix.translate(-0.3, 0.5, 0.4); // Position relative to head
    modelMatrix.scale(0.15, 0.15, 0.15); // Reduced the size of the eyes
    
    normalMatrix.setInverseOf(modelMatrix);
    normalMatrix.transpose();
    
    gl.uniformMatrix4fv(u_ModelMatrix, false, modelMatrix.elements);
    gl.uniformMatrix4fv(u_NormalMatrix, false, normalMatrix.elements);
    
    rightEye.render(gl);
}
// Function to draw the butterfly
function drawButterfly(gl, u_ModelMatrix, u_NormalMatrix) {
    var modelMatrix = new Matrix4();
    var normalMatrix = new Matrix4();
    
    // Update butterfly position with a figure-8 path
    butterflyPathAngle += 0.01;
    var pathRadius = 3.0;
    
    // Figure-8 path calculation
    butterflyX = pathRadius * Math.sin(butterflyPathAngle);
    butterflyY = 2 + 0.5 * Math.sin(butterflyPathAngle * 2); // Gentle up/down motion
    butterflyZ = pathRadius * Math.sin(butterflyPathAngle * 0.5) * Math.cos(butterflyPathAngle);
    
    // Wing flapping animation
    butterflyWingAngle = Math.sin(butterflyPathAngle * 8) * 45; // Wing flap in degrees
    
    // Draw butterfly body
    var body = new Cube();
    body.color = [0.4, 0.0, 0.6, 1.0]; // Purple body
    
    modelMatrix.setTranslate(butterflyX, butterflyY, butterflyZ);
    
    // Rotate body to follow path
    var bodyRotation = Math.atan2(
        Math.cos(butterflyPathAngle * 0.5) * Math.cos(butterflyPathAngle),
        Math.cos(butterflyPathAngle)
    );
    modelMatrix.rotate(bodyRotation * (180/Math.PI), 0, 1, 0);
    
    // Scale to make a thin body
    modelMatrix.scale(0.1, 0.3, 0.6);
    
    normalMatrix.setInverseOf(modelMatrix);
    normalMatrix.transpose();
    
    gl.uniformMatrix4fv(u_ModelMatrix, false, modelMatrix.elements);
    gl.uniformMatrix4fv(u_NormalMatrix, false, normalMatrix.elements);
    
    body.render(gl);
    
    // Draw left wing
    var leftWing = new Cube();
    leftWing.color = [0.8, 0.2, 0.8, 0.9]; // Lighter purple, slightly transparent
    
    modelMatrix.setTranslate(butterflyX, butterflyY, butterflyZ);
    modelMatrix.rotate(bodyRotation * (180/Math.PI), 0, 1, 0);
    
    // Position the left wing and apply flapping motion
    modelMatrix.rotate(butterflyWingAngle, 0, 0, 1);
    modelMatrix.translate(0.5, 0, 0);
    modelMatrix.scale(0.5, 0.02, 0.4);
    
    normalMatrix.setInverseOf(modelMatrix);
    normalMatrix.transpose();
    
    gl.uniformMatrix4fv(u_ModelMatrix, false, modelMatrix.elements);
    gl.uniformMatrix4fv(u_NormalMatrix, false, normalMatrix.elements);
    
    leftWing.render(gl);
    
    // Draw right wing
    var rightWing = new Cube();
    rightWing.color = [0.8, 0.2, 0.8, 0.9]; // Lighter purple, slightly transparent
    
    modelMatrix.setTranslate(butterflyX, butterflyY, butterflyZ);
    modelMatrix.rotate(bodyRotation * (180/Math.PI), 0, 1, 0);
    
    // Position the right wing with opposite flapping motion
    modelMatrix.rotate(-butterflyWingAngle, 0, 0, 1);
    modelMatrix.translate(-0.5, 0, 0);
    modelMatrix.scale(0.5, 0.02, 0.4);
    
    normalMatrix.setInverseOf(modelMatrix);
    normalMatrix.transpose();
    
    gl.uniformMatrix4fv(u_ModelMatrix, false, modelMatrix.elements);
    gl.uniformMatrix4fv(u_NormalMatrix, false, normalMatrix.elements);
    
    rightWing.render(gl);
}

// Function to update butterfly animation
function updateButterfly() {
    // Wing flapping speed based on movement
    butterflyWingAngle += 0.2;
    
    // Reset wing angle after complete cycle
    if (butterflyWingAngle > Math.PI * 2) {
        butterflyWingAngle = 0;
    }
}

function initVertexBuffers(gl) {
    // Create a cube
    var cube = new Cube();
    
    // Create a sphere
    var sphere = createSphere(1.0, 30, 30);
    
    // Create the sky plane
    var skyPlane = createSkyPlane();
    
    // Create the ground plane
    var groundPlane = createGroundPlane();
    
    // Store all shapes in a global array for rendering
    shapes = [cube, sphere, skyPlane, groundPlane];

    // Initialize the sky texture
    initTexture();
    
    return shapes.length;
}

function initTexture() {
    // Create a texture object
    var texture = gl.createTexture();
    
    // Create an image object
    var image = new Image();
    
    // Register the event handler to be called when image loading is completed
    image.onload = function() {
        // Flip the image's y-axis
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 1);
        
        // Activate texture unit0
        gl.activeTexture(gl.TEXTURE0);
        
        // Bind the texture object to the target
        gl.bindTexture(gl.TEXTURE_2D, texture);
        
        // Set texture parameters
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
        
        // Set the texture image
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
        
        // Set the texture unit 0 to the sampler
        gl.uniform1i(u_Sampler, 0);
        
        console.log('Sky texture loaded successfully.');
    };
    
    // Tell the browser to load the image
    image.src = 'sky3.webp';
}

function drawScene(gl, u_ModelMatrix, u_ViewMatrix, u_NormalMatrix) {
    // Clear color and depth buffer
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    
    // Set view matrix based on camera
    var viewMatrix = new Matrix4();
    viewMatrix = camera.apply(gl, viewMatrix);
    gl.uniformMatrix4fv(u_ViewMatrix, false, viewMatrix.elements);
    
    // Model matrix for each shape
    var modelMatrix = new Matrix4();
    
    // Normal matrix for lighting calculations
    var normalMatrix = new Matrix4();
    
    // Draw the sky background first (with identity model matrix)
    modelMatrix.setIdentity();
    normalMatrix.setInverseOf(modelMatrix);
    normalMatrix.transpose();
    gl.uniformMatrix4fv(u_ModelMatrix, false, modelMatrix.elements);
    gl.uniformMatrix4fv(u_NormalMatrix, false, normalMatrix.elements);
    shapes[2].render(gl); // Sky plane is at index 2
    
    // Draw the ground plane
    modelMatrix.setIdentity();
    normalMatrix.setInverseOf(modelMatrix);
    normalMatrix.transpose();
    gl.uniformMatrix4fv(u_ModelMatrix, false, modelMatrix.elements);
    gl.uniformMatrix4fv(u_NormalMatrix, false, normalMatrix.elements);
    shapes[3].render(gl); // Ground plane is at index 3
    
    // Draw the caterpillar
    drawCaterpillar(gl, u_ModelMatrix, u_NormalMatrix);

    //draw the butterfly
    drawButterfly(gl, u_ModelMatrix, u_NormalMatrix);
    
    // Draw the cube
    modelMatrix.setTranslate(-3.0, 0.0, 0.0);
    normalMatrix.setInverseOf(modelMatrix);
    normalMatrix.transpose();
    gl.uniformMatrix4fv(u_ModelMatrix, false, modelMatrix.elements);
    gl.uniformMatrix4fv(u_NormalMatrix, false, normalMatrix.elements);
    shapes[0].render(gl);
    
    // Draw the sphere
    modelMatrix.setTranslate(3.0, 1.0, 0.0);
    normalMatrix.setInverseOf(modelMatrix);
    normalMatrix.transpose();
    gl.uniformMatrix4fv(u_ModelMatrix, false, modelMatrix.elements);
    gl.uniformMatrix4fv(u_NormalMatrix, false, normalMatrix.elements);
    shapes[1].render(gl);
    
    
    // Draw only the active light source
    if (!spotLightOn) {
        // Draw the point light cube (visual marker for point light position)
        modelMatrix.setTranslate(lightPosition[0], lightPosition[1], lightPosition[2]);
        modelMatrix.scale(0.2, 0.2, 0.2);
        normalMatrix.setInverseOf(modelMatrix);
        normalMatrix.transpose();
        gl.uniformMatrix4fv(u_ModelMatrix, false, modelMatrix.elements);
        gl.uniformMatrix4fv(u_NormalMatrix, false, normalMatrix.elements);
        shapes[0].render(gl);
    } else {
        // Draw the spotlight cube (visual marker for spotlight position)
        modelMatrix.setTranslate(spotLightPosition[0], spotLightPosition[1], spotLightPosition[2]);
        modelMatrix.scale(0.2, 0.2, 0.2);
        normalMatrix.setInverseOf(modelMatrix);
        normalMatrix.transpose();
        gl.uniformMatrix4fv(u_ModelMatrix, false, modelMatrix.elements);
        gl.uniformMatrix4fv(u_NormalMatrix, false, normalMatrix.elements);
        shapes[0].render(gl);
    }
}

function createSphere(radius, latBands, longBands) {
    var vertices = [];
    var normals = [];
    var texCoords = [];
    var indices = [];
    
    // Generate vertices, normals, and texture coordinates
    for (var latNumber = 0; latNumber <= latBands; latNumber++) {
        var theta = latNumber * Math.PI / latBands;
        var sinTheta = Math.sin(theta);
        var cosTheta = Math.cos(theta);
        
        for (var longNumber = 0; longNumber <= longBands; longNumber++) {
            var phi = longNumber * 2 * Math.PI / longBands;
            var sinPhi = Math.sin(phi);
            var cosPhi = Math.cos(phi);
            
            var x = cosPhi * sinTheta;
            var y = cosTheta;
            var z = sinPhi * sinTheta;
            var u = 1 - (longNumber / longBands);
            var v = 1 - (latNumber / latBands);
            
            vertices.push(radius * x);
            vertices.push(radius * y);
            vertices.push(radius * z);
            
            normals.push(x);
            normals.push(y);
            normals.push(z);
            
            texCoords.push(u);
            texCoords.push(v);
        }
    }
    
    // Generate indices
    for (var latNumber = 0; latNumber < latBands; latNumber++) {
        for (var longNumber = 0; longNumber < longBands; longNumber++) {
            var first = (latNumber * (longBands + 1)) + longNumber;
            var second = first + longBands + 1;
            
            indices.push(first);
            indices.push(second);
            indices.push(first + 1);
            
            indices.push(second);
            indices.push(second + 1);
            indices.push(first + 1);
        }
    }
    
    
    // Create a custom sphere object similar to Cube
    var sphere = {
        vertices: vertices,
        normals: normals,
        texCoords: texCoords,
        indices: indices,
        render: function(gl) {
            var FSIZE = Float32Array.BYTES_PER_ELEMENT;
            
            // Create vertex buffer
            var vertexBuffer = gl.createBuffer();
            gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);
            gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(this.vertices), gl.STATIC_DRAW);
            var a_Position = gl.getAttribLocation(gl.program, 'a_Position');
            gl.vertexAttribPointer(a_Position, 3, gl.FLOAT, false, 0, 0);
            gl.enableVertexAttribArray(a_Position);
            
            // Create normal buffer
            var normalBuffer = gl.createBuffer();
            gl.bindBuffer(gl.ARRAY_BUFFER, normalBuffer);
            gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(this.normals), gl.STATIC_DRAW);
            var a_Normal = gl.getAttribLocation(gl.program, 'a_Normal');
            gl.vertexAttribPointer(a_Normal, 3, gl.FLOAT, false, 0, 0);
            gl.enableVertexAttribArray(a_Normal);
            
            // Create texture coordinate buffer
            var texCoordBuffer = gl.createBuffer();
            gl.bindBuffer(gl.ARRAY_BUFFER, texCoordBuffer);
            gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(this.texCoords), gl.STATIC_DRAW);
            var a_TexCoord = gl.getAttribLocation(gl.program, 'a_TexCoord');
            gl.vertexAttribPointer(a_TexCoord, 2, gl.FLOAT, false, 0, 0);
            gl.enableVertexAttribArray(a_TexCoord);
            
            // Create color buffer (use color based on normal)
            var colors = [];
            for (var i = 0; i < this.normals.length / 3; i++) {
                colors.push(0.5);  // R
                colors.push(0.5);  // G
                colors.push(1.0);  // B
                colors.push(1.0);  // A
            }
            var colorBuffer = gl.createBuffer();
            gl.bindBuffer(gl.ARRAY_BUFFER, colorBuffer);
            gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(colors), gl.STATIC_DRAW);
            var a_Color = gl.getAttribLocation(gl.program, 'a_Color');
            gl.vertexAttribPointer(a_Color, 4, gl.FLOAT, false, 0, 0);
            gl.enableVertexAttribArray(a_Color);
            
            // Create index buffer
            var indexBuffer = gl.createBuffer();
            gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
            gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(this.indices), gl.STATIC_DRAW);
            
            // Draw the sphere
            gl.drawElements(gl.TRIANGLES, this.indices.length, gl.UNSIGNED_SHORT, 0);
        }
    };
    
    return sphere;
}

function keydown(ev, gl, u_ModelMatrix, u_ViewMatrix, u_NormalMatrix) {
    switch (ev.keyCode) {
        case 87: // W key - move forward
            camera.moveForward(0.5);
            break;
        case 83: // S key - move backward
            camera.moveForward(-0.5);
            break;
        case 65: // A key - move left
            camera.moveRight(-0.5);
            break;
        case 68: // D key - move right
            camera.moveRight(0.5);
            break;
        case 90: // Z key - move down
            camera.moveUp(-0.5);
            break;
        case 88: // X key - move up
            camera.moveUp(0.5);
            break;
        case 81: // Q key - look left
            camera.turnLeft(-0.1);
            break;
        case 69: // E key - look right
            camera.turnLeft(0.1);
            break;
        default:
            return;
    }
    
    // Redraw the scene
    drawScene(gl, u_ModelMatrix, u_ViewMatrix, u_NormalMatrix);
}

// Set up UI controls
function setupUI(gl, u_ModelMatrix, u_ViewMatrix, u_NormalMatrix) {
    // Light position slider
    var lightPosSlider = document.getElementById('lightPosSlider');
    if (lightPosSlider) {
        // Set initial slider value based on current light angle
        lightPosSlider.value = (lightAngle * 180 / Math.PI) % 360;
        
        lightPosSlider.oninput = function() {
            // Enable manual control when slider is used
            manualLightControl = true;
            
            // Convert slider value (degrees) to radians
            var angle = this.value * (Math.PI / 180);
            
            // Update light position
            lightPosition[0] = 5.0 * Math.cos(angle);
            lightPosition[2] = 5.0 * Math.sin(angle);
            
            // Save angle for continuity if switching back to automatic
            lightAngle = angle;
            
            // Update uniform
            gl.uniform3fv(gl.getUniformLocation(gl.program, 'u_LightPosition'), lightPosition);
            
            // Request redraw
            drawScene(gl, u_ModelMatrix, u_ViewMatrix, u_NormalMatrix);
        };
    }
    
    // Light color controls
    var redSlider = document.getElementById('redSlider');
    var greenSlider = document.getElementById('greenSlider');
    var blueSlider = document.getElementById('blueSlider');
    
    if (redSlider && greenSlider && blueSlider) {
        function updateLightColor() {
            var r = redSlider.value / 100;
            var g = greenSlider.value / 100;
            var b = blueSlider.value / 100;
            lightColor = [r, g, b];
            gl.uniform3fv(gl.getUniformLocation(gl.program, 'u_LightColor'), lightColor);
            console.log("Light color updated: " + lightColor);
        }
        
        redSlider.oninput = updateLightColor;
        greenSlider.oninput = updateLightColor;
        blueSlider.oninput = updateLightColor;
    }
    
    // Toggle buttons
    var toggleLightingButton = document.getElementById('toggleLighting');
    if (toggleLightingButton) {
        toggleLightingButton.textContent = lightingOn ? "Turn Off Lighting" : "Turn On Lighting";
        
        toggleLightingButton.onclick = function() {
            lightingOn = !lightingOn;
            gl.uniform1i(gl.getUniformLocation(gl.program, 'u_LightingOn'), lightingOn ? 1 : 0);
            this.textContent = lightingOn ? "Turn Off Lighting" : "Turn On Lighting";
            console.log("Lighting is now " + (lightingOn ? "ON" : "OFF"));
        };
    }

    var toggleNormalsButton = document.getElementById('toggleNormals');
    if (toggleNormalsButton) {
        toggleNormalsButton.textContent = normalVisualization ? "Hide Normals" : "Show Normals";
        
        toggleNormalsButton.onclick = function() {
            normalVisualization = !normalVisualization;
            gl.uniform1i(gl.getUniformLocation(gl.program, 'u_NormalVisualization'), normalVisualization ? 1 : 0);
            this.textContent = normalVisualization ? "Hide Normals" : "Show Normals";
            console.log("Normal visualization is now " + (normalVisualization ? "ON" : "OFF"));
        };
    }
    
    var toggleSpotlightButton = document.getElementById('toggleSpotlight');
    if (toggleSpotlightButton) {
        toggleSpotlightButton.textContent = spotLightOn ? "Turn Off Spotlight" : "Turn On Spotlight";
    
        toggleSpotlightButton.onclick = function() {
            spotLightOn = !spotLightOn;  // Toggle spotlight state
    
            // Pass the spotlight state (on/off) to the shader
            gl.uniform1i(gl.getUniformLocation(gl.program, 'u_SpotLightOn'), spotLightOn ? 1 : 0);
            
            // Change button text based on the spotlight state
            this.textContent = spotLightOn ? "Turn Off Spotlight" : "Turn On Spotlight";
            
            console.log("Spotlight is now " + (spotLightOn ? "ON" : "OFF"));
            
            // Request redraw after changing spotlight state
            drawScene(gl, u_ModelMatrix, u_ViewMatrix, u_NormalMatrix);
        };
    }
}