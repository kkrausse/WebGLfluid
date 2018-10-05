// Solids basically handles all of the boundary conditions
var Solids = (function() {
	function Solids(simulation) {
		initVars();
		this.simulation = simulation;
		// velocity boundaries are of the form {
		// 	mesh:, value: (3d array), mode: eg, gl.Triangles
		// }
		this.windSpeed = 1;
		this.vBoundaries = [];

		var boundaryMesh = createCircle(0.06);
		this.moveable = new MovableObj(boundaryMesh, inMeshFunc(boundaryMesh), this.simulation);

		addBoundaries.call(this);
	}

	var solidMeshShader = null;
	var moveShader = null;

	function initVars() {
		solidMeshShader = new GL.Shader('\
			void main() {\
				gl_Position = gl_Vertex;\
			}\
			', '\
			uniform vec3 color;\
			void main() {\
				gl_FragColor = vec4(color, 1.0);\
			}'
		);

		moveShader = new GL.Shader([
			'varying vec2 normal;',
			'void main() {',
				'normal = gl_Normal.xy;',
				'gl_Position = gl_Vertex;',
			'}',
		].join('\n'), [
			'uniform vec2 movementDir;',
			'varying vec2 normal;',
			'void main() {',
				'gl_FragColor = vec4(dot(normal, movementDir)*normal, 0.0, 1.0);',
			'}'
		].join('\n'));
	}

	Solids.prototype = {
		inMeshFunc: inMeshFunc,
		createCircle: createCircle,
		MovableObj: MovableObj,
		setWindSpeed: function(speed) {
			this.windSpeed = speed;
			this.vBoundaries = this.vBoundaries.map(function(b) {
				if (b.windSpeed) {
					b.value = [speed, 0, 0]
				}
				return b;
			})
		}
	}

	function addBoundaries() {
		function getRectMesh(start, width, height) {
			var mesh = new GL.Mesh();
			mesh.vertices.push([start[0], start[1], 0]);
			mesh.vertices.push([start[0]+width, start[1], 0]);
			mesh.vertices.push([start[0]+width, start[1]+height, 0]);
			mesh.vertices.push([start[0], start[1]+height, 0]);
			mesh.triangles = [[0, 1, 2],[0, 2, 3]];
			mesh.compile();
			return mesh;
		}
		//top
		this.vBoundaries.push({
			mesh: getRectMesh([-1, -1], 2, 0.01),
			value: [0, 0, 0],
			mode: gl.TRIANGLES
		});
		//right
		this.vBoundaries.push({
			// value depends on windspeed so it needs to change
			// when windspeed changes
			windSpeed: true,
			mesh: getRectMesh([0.99, -1], 0.01, 2),
			value: [this.windSpeed, 0, 0],
			mode: gl.TRIANGLES
		});
		//bottom
		this.vBoundaries.push({
			mesh: getRectMesh([-1, 0.99], 2, 0.01),
			value: [0, 0, 0],
			mode: gl.TRIANGLES
		});
		//left
		this.vBoundaries.push({
			windSpeed: true,
			mesh: getRectMesh([-1, -1], 0.01, 2),
			value: [this.windSpeed, 0, 0],
			mode: gl.TRIANGLES
		});

		this.simulation.addBoundaryFunc(setVBoundaries.bind(this), true);
	}

	function setVBoundaries() {
		this.vBoundaries.map(function(b) {
			solidMeshShader.uniforms({
				color: b.value
			}).draw(b.mesh, b.mode);
		});
	}

	function createCircle(radius) {
		var numPoints = 20;
		var mesh = new GL.Mesh({normals: true});
		mesh.vertices.push([0.0, 0.0, 0.0]);
		mesh.normals.push([0.0, 0.0, 0.0]);
		for (var i = 0; i < numPoints; i++) {
			var theta = i * 2 * Math.PI / numPoints;
			var p = [Math.cos(theta)*radius, Math.sin(theta)*radius, 0];
			mesh.vertices.push(p);
			mesh.normals.push(p);
			mesh.triangles.push([0, mesh.vertices.length-1, mesh.vertices.length]);
		}
		var t = mesh.triangles.pop();
		t[2] = 1;
		mesh.triangles.push(t);
		mesh.compile();
		return mesh;
	}

	// creates a movable object on the canvas
	// takes over the gl.mouse... functions
	function MovableObj(mesh, isInside, sim, color) {
		this.mesh = mesh;
		this.scale = 1;
		this.color = color || [0.0, 0.1, 0.3]; // ugly default color
		mesh.v0 = mesh.vertices[0].slice();
		this.isInside = isInside;
		this.selected = false;
		this.movement = [0.0, 0.0];
		
		sim.surfaceMeshes.push({
			mesh: this.mesh,
			color: this.color
		});

		sim.addBoundaryFunc((function() {
			moveShader.uniforms({
				movementDir: this.movement
			}).draw(this.mesh, gl.TRIANGLES);
			this.movement = this.movement.map(e => e * 0.7);
		}).bind(this), true);
		
		function normalize(e) {
			var w = gl.canvas.width;
			var h = gl.canvas.height;
			e.x = e.x * 2 / w - 1;
			e.deltaX /= w / 2;
			e.y = 1 - e.y * 2 / h;
			e.deltaY /= -h/2;
		}

		gl.onmousedown = (function(e) {
			normalize(e);
			if (this.isInside(e))
				this.selected = true;
		}).bind(this);

		gl.onmouseup = (function(e) {
			this.selected = false;
		}).bind(this);

		gl.onmousemove = (function(e) {
			if (this.selected) move.call(this, e);
		}).bind(this);

		function move(e) {
			normalize(e);
			for (var i in this.mesh.vertices) {
				var vert = this.mesh.vertices[i];
				vert[0] += e.deltaX;
				vert[1] += e.deltaY;
			}
			this.mesh.compile();
			this.movement[0] += e.deltaX * 3000;
			this.movement[1] += e.deltaY * 3000;
		}

		this.resize = function(scale) {

		}
	}

	// given an arbitrary mesh, this returns a function that returns
	// true if the given point is inside of the mesh and false otherwise
	function inMeshFunc(mesh) {
		// all params assumed to be 2D arrays
		function isInTriangle(v1, v2, v3, p) {
			function sub(v1, v2) {
				return [v1[0] - v2[0], v1[1] - v2[1]];
			}
			function cross(v1, v2) {
				return v1[0] * v2[1] - v1[1] * v2[0];
			}
			function sameSign(a, b) {
				return Math.abs(a + b) > Math.abs(a);
			}
			// checks if p1 and p2 are on the same side of the line formed by
			// v1 and v2
			function rightSide(v1, v2, p1, p2) {
				var dir = sub(v2, v1);
				return sameSign(cross(dir, sub(p1, v1)), cross(dir, sub(p2, v1)));
			}

			return rightSide(v1, v2, v3, p) && rightSide(v1, v3, v2, p) &&
					rightSide(v2, v3, v1, p);
		}
		return function(e) {
			var vs = mesh.vertices;
			for (var i in mesh.triangles) {
				var t = mesh.triangles[i];
				if (isInTriangle(vs[t[0]], vs[t[1]], vs[t[2]], [e.x, e.y]))
					return true;
			}
			return false;
		}
	}

	return Solids;
})();