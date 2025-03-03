// Triangle class
var Triangle = function(vertices, normals, color) {
    this.type = 'triangle';
    this.vertices = vertices || new Float32Array([0, 0.5, 0, -0.5, -0.5, 0, 0.5, -0.5, 0]);
    this.normals = normals || new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1]);
    this.color = color || [1.0, 1.0, 1.0, 1.0];
    this.matrix = new Matrix4();
};

// Render method
Triangle.prototype.render = function(gl) {
    var FSIZE = Float32Array.BYTES_PER_ELEMENT;
    
    // Create a buffer for vertices
    var vertexBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, this.vertices, gl.STATIC_DRAW);
    var a_Position = gl.getAttribLocation(gl.program, 'a_Position');
    gl.vertexAttribPointer(a_Position, 3, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(a_Position);
    
    // Create a buffer for normals
    var normalBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, normalBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, this.normals, gl.STATIC_DRAW);
    var a_Normal = gl.getAttribLocation(gl.program, 'a_Normal');
    gl.vertexAttribPointer(a_Normal, 3, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(a_Normal);
    
    // Create a buffer for colors
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
    
    // Draw the triangle
    gl.drawArrays(gl.TRIANGLES, 0, this.vertices.length / 3);
};